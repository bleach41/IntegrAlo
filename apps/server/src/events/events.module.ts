import { Controller, DefaultValuePipe, Get, Global, Module, ParseIntPipe, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { EventsService } from './events.service';

@Controller('events')
class EventsController {
  constructor(private readonly events: EventsService) {}

  @RequirePermission(PERMISSIONS.eventsRead)
  @Get()
  list(
    @Query('nodeId') nodeId?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit = 100,
  ) {
    return this.events.list({ nodeId, limit: Math.min(limit, 1000) });
  }
}

@Global()
@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
