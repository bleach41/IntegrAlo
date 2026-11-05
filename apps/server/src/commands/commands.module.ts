import { Body, Controller, DefaultValuePipe, Get, Module, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { PERMISSIONS, commandPermission } from '../auth/permissions';
import { parseBody } from '../common/json';
import { NodesModule } from '../nodes/nodes.module';
import { NodesService } from '../nodes/nodes.service';
import { CommandsService } from './commands.service';

const SendBodySchema = z
  .object({
    type: z.string().min(1),
    payload: z.record(z.unknown()).default({}),
  })
  .strict();

@Controller()
class CommandsController {
  constructor(
    private readonly commands: CommandsService,
    private readonly nodes: NodesService,
    private readonly auth: AuthService,
  ) {}

  /** The required permission depends on the node's module and the command: command:<module>:<type>. */
  @Post('nodes/:id/commands')
  send(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { type, payload } = parseBody(SendBodySchema, body);
    this.auth.assertPermission(user, commandPermission(this.nodes.get(id).module, type));
    return this.commands.send(id, type, payload, user.username);
  }

  @RequirePermission(PERMISSIONS.commandsRead)
  @Get('nodes/:id/commands')
  list(@Param('id') id: string, @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50) {
    return this.commands.list(id, Math.min(limit, 500));
  }

  @RequirePermission(PERMISSIONS.commandsRead)
  @Get('commands/:cmdId')
  get(@Param('cmdId') cmdId: string) {
    return this.commands.get(cmdId);
  }
}

@Module({
  imports: [NodesModule],
  controllers: [CommandsController],
  providers: [CommandsService],
})
export class CommandsModule {}
