import { Controller, Get, Module, NotFoundException, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { parseBody } from '../common/json';
import { NodesModule } from '../nodes/nodes.module';
import { NodesService } from '../nodes/nodes.service';
import { TelemetryService } from './telemetry.service';

const QuerySchema = z.object({
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50_000).default(5000),
});

@Controller('nodes/:id/telemetry')
class TelemetryController {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly nodes: NodesService,
  ) {}

  /** Samples between from and to (Unix ms); by default, the last hour. */
  @RequirePermission(PERMISSIONS.telemetryRead)
  @Get()
  query(@Param('id') id: string, @Query() query: unknown) {
    this.nodes.get(id);
    const { from, to, limit } = parseBody(QuerySchema, query);
    const end = to ?? Date.now();
    return this.telemetry.query(id, from ?? end - 3_600_000, end, limit);
  }

  @RequirePermission(PERMISSIONS.telemetryRead)
  @Get('latest')
  latest(@Param('id') id: string) {
    this.nodes.get(id);
    const sample = this.telemetry.latest(id);
    if (!sample) throw new NotFoundException(`no telemetry for node ${id}`);
    return sample;
  }
}

@Module({
  imports: [NodesModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
