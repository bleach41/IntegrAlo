import { Body, Controller, Get, Module, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { parseBody } from '../common/json';
import { NodesService } from './nodes.service';

const ApproveBodySchema = z.object({ name: z.string().min(1).max(80).optional() }).strict();

@Controller('nodes')
class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @RequirePermission(PERMISSIONS.nodesRead)
  @Get()
  list() {
    return this.nodes.list();
  }

  @RequirePermission(PERMISSIONS.nodesRead)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.nodes.get(id);
  }

  @RequirePermission(PERMISSIONS.nodesApprove)
  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { name } = parseBody(ApproveBodySchema, body ?? {});
    return this.nodes.approve(id, name, user.username);
  }
}

@Module({
  controllers: [NodesController],
  providers: [NodesService],
  exports: [NodesService],
})
export class NodesModule {}
