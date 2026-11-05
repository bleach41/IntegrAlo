import { Body, Controller, Get, Module, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../common/json';
import { NodesService } from './nodes.service';

const ApproveBodySchema = z.object({ name: z.string().min(1).max(80).optional() }).strict();

@Controller('nodes')
class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Get()
  list() {
    return this.nodes.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.nodes.get(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: unknown) {
    const { name } = parseBody(ApproveBodySchema, body ?? {});
    return this.nodes.approve(id, name, 'api');
  }
}

@Module({
  controllers: [NodesController],
  providers: [NodesService],
  exports: [NodesService],
})
export class NodesModule {}
