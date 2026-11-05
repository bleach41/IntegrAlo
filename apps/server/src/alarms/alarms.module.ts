import { Body, Controller, Get, HttpCode, Module, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { parseBody } from '../common/json';
import { NodesModule } from '../nodes/nodes.module';
import { AlarmsService } from './alarms.service';

const ListQuerySchema = z.object({
  nodeId: z.string().optional(),
  open: z.enum(['true', 'false']).default('true'),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

const ConfigBodySchema = z
  .object({
    threshold: z.number().optional(),
    deadband: z.number().nonnegative().optional(),
    delayS: z.number().min(0).max(3600).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

@Controller()
class AlarmsController {
  constructor(private readonly alarms: AlarmsService) {}

  /** Open alarms (not yet both acknowledged and cleared) by default; ?open=false for history. */
  @RequirePermission(PERMISSIONS.alarmsRead)
  @Get('alarms')
  list(@Query() query: unknown) {
    const { nodeId, open, limit } = parseBody(ListQuerySchema, query);
    return this.alarms.list({ nodeId, open: open === 'true', limit });
  }

  @RequirePermission(PERMISSIONS.alarmsAck)
  @Post('alarms/:id/ack')
  @HttpCode(200)
  acknowledge(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.alarms.acknowledge(id, user.username);
  }

  @RequirePermission(PERMISSIONS.alarmsRead)
  @Get('nodes/:id/alarm-configs')
  configs(@Param('id') id: string) {
    return this.alarms.configs(id);
  }

  @RequirePermission(PERMISSIONS.alarmsConfigure)
  @Put('nodes/:id/alarm-configs/:key')
  configure(@Param('id') id: string, @Param('key') key: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.alarms.configure(id, key, parseBody(ConfigBodySchema, body), user.username);
  }
}

@Module({
  imports: [NodesModule],
  controllers: [AlarmsController],
  providers: [AlarmsService],
})
export class AlarmsModule {}
