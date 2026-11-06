import { networkInterfaces } from 'node:os';
import { NONCE_PATTERN, type IdentityProof, type NodeAccess, type PairingInfo } from '@integralo/contract';
import { BadRequestException, Controller, Get, Inject, Module, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, RequirePermission } from '../auth/auth.decorators';
import { PERMISSIONS } from '../auth/permissions';
import { APP_CONFIG, AppConfig } from '../config';
import { EventsService } from '../events/events.service';
import { IdentityService } from './identity.service';

@Controller('system')
class SystemController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly events: EventsService,
    private readonly identity: IdentityService,
  ) {}

  /** Any signed-in user: addresses and QR to pair a phone. Nothing secret is in it. */
  @Get('pairing')
  pairing(): PairingInfo {
    return this.identity.pairing();
  }

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

/** Public: proves the identity of this core by signing the app's challenge. */
@Controller('identity')
class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Public()
  @Get()
  prove(@Query('nonce') nonce: unknown): IdentityProof {
    if (typeof nonce !== 'string' || !NONCE_PATTERN.test(nonce)) throw new BadRequestException('invalid nonce');
    return this.identity.prove(nonce);
  }
}

@Module({ controllers: [SystemController, IdentityController], providers: [IdentityService], exports: [IdentityService] })
export class SystemModule {}
