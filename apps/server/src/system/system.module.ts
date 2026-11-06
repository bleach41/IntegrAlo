import { networkInterfaces } from 'node:os';
import type { NodeAccess } from '@integralo/contract';
import { Controller, Get, Inject, Module } from '@nestjs/common';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { APP_CONFIG, AppConfig } from '../config';
import { EventsService } from '../events/events.service';

@Controller('system')
class SystemController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly events: EventsService,
  ) {}

  /**
   * What to program into a new node (ESP32): broker addresses, port, topic prefix and the
   * node account. Engineering only, and every read is audited because it shows a password.
   */
  @RequirePermission(PERMISSIONS.nodeAccessRead)
  @Get('node-access')
  nodeAccess(@CurrentUser() user: AuthUser): NodeAccess {
    const access = this.config.nodeAccess;
    if (!access) return { configured: false };
    this.events.record('system.node_access_viewed', null, user.username);
    return {
      configured: true,
      hosts: Object.values(networkInterfaces())
        .flat()
        // 169.254.x.x is link-local (adapter without an address): no node can use it.
        .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
        .map((a) => a!.address),
      port: access.port,
      topicPrefix: this.config.topicPrefix,
      username: access.username,
      password: access.password,
    };
  }
}

@Module({ controllers: [SystemController] })
export class SystemModule {}
