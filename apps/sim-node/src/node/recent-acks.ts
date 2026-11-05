import type { AckMessage } from '@integralo/contract';

/**
 * Remembers the acks of the last commands, so a duplicate delivered by QoS 1 is answered
 * with the same ack instead of being applied twice.
 */
export class RecentAcks {
  private readonly acks = new Map<string, AckMessage>();

  constructor(private readonly size = 32) {}

  get(cmdId: string): AckMessage | undefined {
    return this.acks.get(cmdId);
  }

  remember(ack: AckMessage): AckMessage {
    this.acks.set(ack.cmdId, ack);
    if (this.acks.size > this.size) {
      this.acks.delete(this.acks.keys().next().value as string);
    }
    return ack;
  }
}
