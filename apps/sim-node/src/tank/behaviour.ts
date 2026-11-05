import { AckMessage, CommandMessageSchema, TelemetryValue } from '@integralo/contract';
import type { NodeBehaviour } from '../node/behaviour';
import { RecentAcks } from '../node/recent-acks';
import { StateStorage } from '../node/storage';
import { DEFAULT_TANK, TankModel, TankParams } from './model';
import { TankCommandSchema, TankState, TankStateSchema, defaultTankState } from './state';

/**
 * Tank level module node. Control by levels with hysteresis, as a float switch pair:
 * in automatic mode the pump starts when the level falls to startLevel and stops when it
 * reaches stopLevel; between both it keeps its state.
 */
export class TankBehaviour implements NodeBehaviour {
  readonly moduleId = 'tank-level';
  private readonly storage: StateStorage<TankState>;
  private readonly model: TankModel;
  private readonly recent = new RecentAcks();
  private state: TankState;
  private pumpOn = false;

  constructor(stateFile: string, initialLevelPct: number, params: TankParams = DEFAULT_TANK) {
    this.storage = new StateStorage(stateFile, TankStateSchema, defaultTankState);
    this.state = this.storage.load();
    this.model = new TankModel(params, initialLevelPct);
  }

  get current(): TankState {
    return this.state;
  }

  samplePeriodMs(): number {
    return this.state.samplePeriodMs;
  }

  handleCommand(raw: unknown): AckMessage | null {
    const envelope = CommandMessageSchema.safeParse(raw);
    if (!envelope.success) return null;
    const { cmdId, type, payload } = envelope.data;
    const previous = this.recent.get(cmdId);
    if (previous) return previous;

    const command = TankCommandSchema.safeParse({ type, payload });
    if (!command.success) {
      const known = TankCommandSchema.options.some((o) => o.shape.type.value === type);
      return this.recent.remember({ cmdId, result: 'rejected', reason: known ? 'invalid_payload' : 'unknown_command' });
    }

    const next: TankState = { ...this.state };
    const cmd = command.data;
    switch (cmd.type) {
      case 'set_mode':
        next.mode = cmd.payload.mode;
        break;
      case 'set_pump':
        next.manualPump = cmd.payload.pump;
        break;
      case 'set_levels':
        Object.assign(next, cmd.payload);
        break;
      case 'set_simulation':
        Object.assign(next, cmd.payload);
        break;
    }
    if (next.startLevel >= next.stopLevel) {
      return this.recent.remember({ cmdId, result: 'rejected', reason: 'invalid_range' });
    }

    this.state = next;
    this.storage.save(next);
    return this.recent.remember({
      cmdId,
      result: 'accepted',
      state: { mode: next.mode, manualPump: next.manualPump, startLevel: next.startLevel, stopLevel: next.stopLevel, consumptionLpm: next.consumptionLpm },
    });
  }

  tick(dtS: number): Record<string, TelemetryValue> {
    this.pumpOn = this.decidePump(this.model.levelPct);
    this.model.step(dtS, this.pumpOn, this.state.consumptionLpm);
    return {
      level: Math.round(this.model.levelPct * 10) / 10,
      volume: Math.round(this.model.volumeL),
      pump: this.pumpOn ? 'on' : 'off',
      mode: this.state.mode,
      consumption: this.state.consumptionLpm,
    };
  }

  describe(): string {
    return `mode=${this.state.mode}, start=${this.state.startLevel} %, stop=${this.state.stopLevel} %`;
  }

  private decidePump(level: number): boolean {
    switch (this.state.mode) {
      case 'off':
        return false;
      case 'manual':
        return this.state.manualPump === 'on';
      case 'auto':
        if (level <= this.state.startLevel) return true;
        if (level >= this.state.stopLevel) return false;
        return this.pumpOn;
    }
  }
}
