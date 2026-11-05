import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthRequest, IS_PUBLIC, REQUIRED_PERMISSION } from './auth.decorators';
import { AuthService } from './auth.service';
import { hasPermission } from './permissions';

/**
 * Applied to every route: requires a valid session ("Authorization: Bearer <token>")
 * unless the route is @Public, and the permission declared with @RequirePermission.
 * Secure by default: a new route is protected unless it is explicitly made public.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    const user = token ? this.auth.userForToken(token) : undefined;
    if (!user) throw new UnauthorizedException('sign in required');
    request.user = user;
    request.authToken = token;

    const permission = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_PERMISSION, targets);
    if (permission && !hasPermission(user.permissions, permission)) {
      throw new ForbiddenException(`permission "${permission}" required`);
    }
    return true;
  }
}
