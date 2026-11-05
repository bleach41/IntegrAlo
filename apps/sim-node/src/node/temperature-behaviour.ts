import type { AckMessage, TelemetryValue } from '@integralo/contract';
import { manifest } from '@integralo/module-temperature';
import type { NodeBehaviour } from './behaviour';
import { CommandHandler } from './command-handler';
import { TemperatureSimulation } from './simulation';
import { NodeState, NodeStateSchema, defaultNodeState } from './state';
import { StateStorage } from './storage';

/** Temperature module node: room thermal model, hysteresis/PI control and its commands. */
export class TemperatureBehaviour implements NodeBehaviour {
  readonly moduleId = manifest.id;
  private readonly storage: StateStorage<NodeState>;
  private readonly handler: CommandHandler;
  private readonly simulation: TemperatureSimulation;

  constructor(stateFile: string, initialTemperatureC: number) {
    this.storage = new StateStorage(stateFile, NodeStateSchema, defaultNodeState);
    this.handler = new CommandHandler(this.storage.load(), (state) => this.storage.save(state));
    this.simulation = new TemperatureSimulation(initialTemperatureC);
  }

  samplePeriodMs(): number {
    return this.handler.current.params.samplePeriodMs;
  }

  handleCommand(raw: unknown): AckMessage | null {
    return this.handler.handle(raw);
  }

  tick(dtS: number): Record<string, TelemetryValue> {
    return this.simulation.tick(this.handler.current, dtS);
  }

  describe(): string {
    return `mode=${this.handler.current.mode}, setpoint=${this.handler.current.setpoint} °C`;
  }
}
