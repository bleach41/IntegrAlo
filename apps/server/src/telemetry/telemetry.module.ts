import { Controller, Get, Module, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { parseBody } from '../common/json';
import { NodesModule } from '../nodes/nodes.module';
import { NodesService } from '../nodes/nodes.service';
import { ModuleRegistryService } from '../registry/module-registry.service';
import { telemetryToCsv } from './csv';
import { downsample } from './downsample';
import { TelemetryService } from './telemetry.service';

const EXPORT_MAX_ROWS = 200_000;

/** The part of the HTTP response used to name the downloaded file. */
interface DownloadResponse {
  setHeader(name: string, value: string): void;
}

const QuerySchema = z.object({
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50_000).default(5000),
  /** For charts: at most this many samples, averaged over equal time buckets (see downsample). */
  points: z.coerce.number().int().min(10).max(5000).optional(),
});

/** Readings read to build a reduced chart series: 8 days at one reading per second. */
const CHART_SOURCE_MAX_ROWS = 700_000;

@Controller('nodes/:id/telemetry')
class TelemetryController {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly nodes: NodesService,
    private readonly registry: ModuleRegistryService,
  ) {}

  /**
   * Samples between from and to (Unix ms); by default, the last hour. With `points` the window
   * is reduced to that many averaged samples, so a week fits in a chart.
   */
  @RequirePermission(PERMISSIONS.telemetryRead)
  @Get()
  query(@Param('id') id: string, @Query() query: unknown) {
    this.nodes.get(id);
    const { from, to, limit, points } = parseBody(QuerySchema, query);
    const end = to ?? Date.now();
    const start = from ?? end - 3_600_000;
    if (points === undefined) return this.telemetry.query(id, start, end, limit);
    return downsample(this.telemetry.query(id, start, end, CHART_SOURCE_MAX_ROWS), start, end, points);
  }

  /** CSV download (RF-13); by default, the last 24 hours. */
  @RequirePermission(PERMISSIONS.telemetryRead)
  @Get('export.csv')
  exportCsv(@Param('id') id: string, @Query() query: unknown, @Res({ passthrough: true }) res: DownloadResponse) {
    const node = this.nodes.get(id);
    const { from, to } = parseBody(QuerySchema, query);
    const end = to ?? Date.now();
    const samples = this.telemetry.query(id, from ?? end - 86_400_000, end, EXPORT_MAX_ROWS);
    const variables = this.registry.get(node.module)?.variables.map((v) => v.key) ?? [];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}_${new Date(end).toISOString().slice(0, 10)}.csv"`);
    return telemetryToCsv(samples, variables);
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
