import { AckMessage, CommandMessageSchema } from '@integralo/contract';
import { TemperatureCommandSchema } from '@integralo/module-temperature';
import { NodeState, stateSnapshot } from './state';

/** Number of recent commands remembered to detect QoS 1 duplicates. */
const RECENT_COMMANDS = 32;

/**
 * Applies the commands received from the platform and builds their acks.
 * A duplicated cmdId is answered with the same ack and is not applied again.
 */
export class CommandHandler {
  private readonly recent = new Map<string, AckMessage>();

  constructor(
    private state: NodeState,
    private readonly onStateChange: (state: NodeState) => void,
  ) {}

  get current(): NodeState {
    return this.state;
  }

  /** Returns null only when the message cannot be answered because it has no valid cmdId. */
  handle(raw: unknown): AckMessage | null {
    const envelope = CommandMessageSchema.safeParse(raw);
    if (!envelope.success) {
      return null;
    }
    const { cmdId, type, payload } = envelope.data;

    const previous = this.recent.get(cmdId);
    if (previous) {
      return previous;
    }

    const ack = this.apply(cmdId, type, payload);
    this.remember(cmdId, ack);
    return ack;
  }

  private apply(cmdId: string, type: string, payload: unknown): AckMessage {
    const command = TemperatureCommandSchema.safeParse({ type, payload });
    if (!command.success) {
      const known = TemperatureCommandSchema.options.some((o) => o.shape.type.value === type);
      return reject(cmdId, known ? 'invalid_payload' : 'unknown_command');
    }

    const next: NodeState = structuredClone(this.state);
    const cmd = command.data;
    switch (cmd.type) {
      case 'set_setpoint':
        next.setpoint = cmd.payload.setpoint;
        break;
      case 'set_mode':
        next.mode = cmd.payload.mode;
        break;
      case 'set_output':
        next.manualOutput = cmd.payload.output;
        break;
      case 'set_params':
        next.params = { ...next.params, ...cmd.payload };
        break;
      case 'set_simulation':
        next.simulation = { ...next.simulation, ...cmd.payload };
        break;
    }

    const { setpointMin, setpointMax } = next.params;
    if (setpointMin > setpointMax) {
      return reject(cmdId, 'invalid_range');
    }
    if (next.setpoint < setpointMin || next.setpoint > setpointMax) {
      return reject(cmdId, 'out_of_range');
    }

    this.state = next;
    this.onStateChange(next);
    return { cmdId, result: 'accepted', state: stateSnapshot(next) };
  }

  private remember(cmdId: string, ack: AckMessage): void {
    this.recent.set(cmdId, ack);
    if (this.recent.size > RECENT_COMMANDS) {
      const oldest = this.recent.keys().next().value as string;
      this.recent.delete(oldest);
    }
  }
}

function reject(cmdId: string, reason: string): AckMessage {
  return { cmdId, result: 'rejected', reason };
}
