import { EventEmitter } from 'node:events';
import { Global, Injectable, Logger, Module } from '@nestjs/common';
import type { AlarmRecord } from '../alarms/alarms.service';
import type { CommandRecord } from '../commands/commands.service';
import type { NodeInfo } from '../nodes/nodes.service';
import type { TelemetrySample } from '../telemetry/telemetry.service';

/** Changes published inside the core; the WebSocket gateway forwards them to clients. */
export interface BusEvents {
  node: NodeInfo;
  telemetry: { nodeId: string; sample: TelemetrySample };
  command: CommandRecord;
  alarm: AlarmRecord;
}

/**
 * In-process publish/subscribe. Producers (nodes, telemetry, commands, alarms) do not
 * know their consumers, so features can be added without changing the producers.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<K extends keyof BusEvents>(kind: K, payload: BusEvents[K]): void {
    try {
      this.emitter.emit(kind, payload);
    } catch (err) {
      this.logger.error(`listener for ${kind} failed: ${(err as Error).message}`);
    }
  }

  on<K extends keyof BusEvents>(kind: K, listener: (payload: BusEvents[K]) => void): () => void {
    this.emitter.on(kind, listener);
    return () => this.emitter.off(kind, listener);
  }
}

@Global()
@Module({
  providers: [EventBus],
  exports: [EventBus],
})
export class BusModule {}
