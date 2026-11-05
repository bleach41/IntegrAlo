import { Body, Controller, Get, Global, HttpCode, Module, Param, ParseIntPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import { parseBody } from '../common/json';
import { AuthRequest, AuthUser, CurrentUser, Public, RequirePermission } from './auth.decorators';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PERMISSIONS } from './permissions';

const UsernameSchema = z.string().regex(/^[a-zA-Z0-9._-]{3,32}$/, '3–32 letters, digits, ".", "_" or "-"');
const CredentialsSchema = z.object({ username: UsernameSchema, password: z.string().min(1).max(200) }).strict();
const CreateUserSchema = z.object({ username: UsernameSchema, password: z.string().max(200), roleId: z.string() }).strict();
const UpdateUserSchema = z
  .object({ roleId: z.string().optional(), disabled: z.boolean().optional(), password: z.string().max(200).optional() })
  .strict();
const PermissionsSchema = z.object({ permissions: z.array(z.string().min(1).max(100)) }).strict();

@Controller('setup')
class SetupController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get()
  status() {
    return { needsSetup: this.auth.needsSetup() };
  }

  @Public()
  @Post()
  setup(@Body() body: unknown) {
    const { username, password } = parseBody(CredentialsSchema, body);
    return this.auth.setup(username, password);
  }
}

@Controller('auth')
class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const { username, password } = parseBody(CredentialsSchema, body);
    return this.auth.login(username, password);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Req() request: AuthRequest, @CurrentUser() user: AuthUser) {
    this.auth.logout(request.authToken as string, user);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

@Controller('users')
class UsersController {
  constructor(private readonly auth: AuthService) {}

  @RequirePermission(PERMISSIONS.usersManage)
  @Get()
  list() {
    return this.auth.listUsers();
  }

  @RequirePermission(PERMISSIONS.usersManage)
  @Post()
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const { username, password, roleId } = parseBody(CreateUserSchema, body);
    return this.auth.createUser(username, password, roleId, actor.username);
  }

  @RequirePermission(PERMISSIONS.usersManage)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.auth.updateUser(id, parseBody(UpdateUserSchema, body), actor);
  }
}

@Controller('roles')
class RolesController {
  constructor(private readonly auth: AuthService) {}

  @RequirePermission(PERMISSIONS.usersManage)
  @Get()
  list() {
    return this.auth.listRoles();
  }

  @RequirePermission(PERMISSIONS.usersManage)
  @Put(':id/permissions')
  setPermissions(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const { permissions } = parseBody(PermissionsSchema, body);
    return this.auth.setRolePermissions(id, permissions, actor);
  }
}

@Global()
@Module({
  controllers: [SetupController, AuthController, UsersController, RolesController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
