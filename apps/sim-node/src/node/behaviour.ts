import type { AckMessage, TelemetryValue } from '@integralo/contract';

/**
 * What a module-specific node does, separated from the MQTT plumbing (SimulatedNode):
 * the same connection, announce, Last Will and ack handling serve every module, as the
 * same firmware skeleton would on the ESP32.
 */
export interface NodeBehaviour {
  /** Module id announced to the platform; it must match a module manifest. */
  readonly moduleId: string;
  /** Telemetry period; it may change after a command. */
  samplePeriodMs(): number;
  /** Applies a command and returns its ack; null only when it has no valid cmdId. */
  handleCommand(raw: unknown): AckMessage | null;
  /** Advances the process and the control loop dtS (simulated) seconds; returns the readings. */
  tick(dtS: number): Record<string, TelemetryValue>;
  /** One-line description of the current state, for the log. */
  describe(): string;
}
