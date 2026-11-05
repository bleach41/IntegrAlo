import type { TelemetryValue } from '@integralo/contract';
import { TemperatureController } from '../control/controller';
import { outdoorTemperature } from '../model/disturbance';
import { DEFAULT_ROOM, RoomModel, RoomParams } from '../model/room';
import type { NodeState } from './state';

/**
 * Simulated process plus controller, independent of MQTT.
 * timeScale > 1 makes simulated time run faster than real time (e.g. 60: one real
 * second is one simulated minute), useful to observe a thermal response in minutes.
 */
export class TemperatureSimulation {
  private readonly room: RoomModel;
  private readonly controller = new TemperatureController();
  private simTimeS: number;
  private output = 0;

  constructor(
    initialTemperatureC: number,
    startTimeOfDayS = 12 * 3600,
    roomParams: RoomParams = DEFAULT_ROOM,
  ) {
    this.room = new RoomModel(roomParams, initialTemperatureC);
    this.simTimeS = startTimeOfDayS;
  }

  get simulatedTimeS(): number {
    return this.simTimeS;
  }

  /** One control period: compute the output with the current temperature, then advance the room. */
  tick(state: NodeState, dtS: number): Record<string, TelemetryValue> {
    const outdoorC = outdoorTemperature(state.simulation, this.simTimeS % 86_400);
    this.output = this.controller.compute(state, this.room.temperature, dtS);
    this.room.step(dtS, this.output, outdoorC);
    this.simTimeS += dtS;
    return {
      temperature: round(this.room.temperature, 2),
      setpoint: state.setpoint,
      output: round(this.output, 1),
      mode: state.mode,
      outdoorTemperature: round(outdoorC, 2),
    };
  }
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
