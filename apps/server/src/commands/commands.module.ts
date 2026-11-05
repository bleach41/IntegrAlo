import { Body, Controller, DefaultValuePipe, Get, Module, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../common/json';
import { NodesModule } from '../nodes/nodes.module';
import { CommandsService } from './commands.service';

const SendBodySchema = z
  .object({
    type: z.string().min(1),
    payload: z.record(z.unknown()).default({}),
  })
  .strict();

@Controller()
class CommandsController {
  constructor(private readonly commands: CommandsService) {}

  @Post('nodes/:id/commands')
  send(@Param('id') id: string, @Body() body: unknown) {
    const { type, payload } = parseBody(SendBodySchema, body);
    return this.commands.send(id, type, payload, 'api');
  }

  @Get('nodes/:id/commands')
  list(@Param('id') id: string, @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50) {
    return this.commands.list(id, Math.min(limit, 500));
  }

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
