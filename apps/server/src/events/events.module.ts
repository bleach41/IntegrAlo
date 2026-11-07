import { Controller, Get, Global, Module, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { parseBody } from '../common/json';
import { EVENT_CATEGORIES, EventsService } from './events.service';

const ListQuerySchema = z.object({
  nodeId: z.string().optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  beforeId: z.coerce.number().int().positive().optional(),
  // Time window in epoch ms, [from, to): the client sends the bounds of a local day.
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

@Controller('events')
class EventsController {
  constructor(private readonly events: EventsService) {}

  @RequirePermission(PERMISSIONS.eventsRead)
  @Get()
  list(@Query() query: unknown) {
    return this.events.list(parseBody(ListQuerySchema, query));
  }
}

@Global()
@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
