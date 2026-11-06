import type { ServerHealth } from '@integralo/contract';
import { Controller, Get, Global, Module } from '@nestjs/common';
import { AlarmsModule } from './alarms/alarms.module';
import { Public } from './auth/auth.decorators';
import { AuthModule } from './auth/auth.module';
import { BusModule } from './bus/event-bus';
import { CommandsModule } from './commands/commands.module';
import { APP_CONFIG, loadConfig } from './config';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';
import { MqttModule } from './mqtt/mqtt.module';
import { MqttService } from './mqtt/mqtt.service';
import { NodesModule } from './nodes/nodes.module';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { RegistryModule } from './registry/registry.module';
import { IdentityService } from './system/identity.service';
import { SystemModule } from './system/system.module';
import { TelemetryModule } from './telemetry/telemetry.module';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
class ConfigModule {}

@Controller('health')
class HealthController {
  constructor(
    private readonly mqtt: MqttService,
    private readonly identity: IdentityService,
  ) {}

  /** Public: also how apps recognise an IntegrAlo core while searching the network. */
  @Public()
  @Get()
  health(): ServerHealth {
    return {
      status: 'ok',
      broker: this.mqtt.connected ? 'connected' : 'disconnected',
      serverId: this.identity.serverId,
      name: this.identity.name,
      publicKey: this.identity.publicKey,
    };
  }
}

@Module({
  imports: [
    ConfigModule,
    BusModule,
    DatabaseModule,
    EventsModule,
    AuthModule,
    RegistryModule,
    MqttModule,
    NodesModule,
    TelemetryModule,
    CommandsModule,
    AlarmsModule,
    SystemModule,
  ],
  controllers: [HealthController],
  providers: [RealtimeGateway],
})
export class AppModule {}
