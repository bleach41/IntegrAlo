import { Controller, Get, Global, Module } from '@nestjs/common';
import { CommandsModule } from './commands/commands.module';
import { APP_CONFIG, loadConfig } from './config';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';
import { MqttModule } from './mqtt/mqtt.module';
import { MqttService } from './mqtt/mqtt.service';
import { NodesModule } from './nodes/nodes.module';
import { RegistryModule } from './registry/registry.module';
import { TelemetryModule } from './telemetry/telemetry.module';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
class ConfigModule {}

@Controller('health')
class HealthController {
  constructor(private readonly mqtt: MqttService) {}

  @Get()
  health() {
    return { status: 'ok', broker: this.mqtt.connected ? 'connected' : 'disconnected' };
  }
}

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    EventsModule,
    RegistryModule,
    MqttModule,
    NodesModule,
    TelemetryModule,
    CommandsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
