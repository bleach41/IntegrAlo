import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';

export interface AuthUser {
  id: number;
  username: string;
  roleId: string;
  permissions: string[];
}

/** Minimal view of the HTTP request used by the guard. */
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
  authToken?: string;
}

export const IS_PUBLIC = 'integralo:public';
export const REQUIRED_PERMISSION = 'integralo:permission';

/** Route accessible without signing in (health, first-run setup, login). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route that requires a permission in addition to a valid session. */
export const RequirePermission = (permission: string) => SetMetadata(REQUIRED_PERMISSION, permission);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthRequest>().user as AuthUser;
});
