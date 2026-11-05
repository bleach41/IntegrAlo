import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { AuthUser } from './auth.decorators';
import { hashPassword, verifyPassword } from './password';
import { hasPermission } from './permissions';

export interface UserInfo {
  id: number;
  username: string;
  roleId: string;
  disabled: boolean;
  createdAt: number;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role_id: string;
  disabled: number;
  created_at: number;
}

const SESSION_TTL_MS = 7 * 86_400_000;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 60_000;
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Users, sessions and roles (RF-08).
 * Sessions are random tokens; only their SHA-256 is stored, so a copy of the database
 * does not give valid tokens. Logging out deletes the session.
 */
@Injectable()
export class AuthService {
  private readonly failedLogins = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventsService,
  ) {}

  needsSetup(): boolean {
    const row = this.database.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    return row.n === 0;
  }

  /** First-run assistant: creates the first engineering account, only while no user exists. */
  async setup(username: string, password: string): Promise<UserInfo> {
    if (!this.needsSetup()) throw new ConflictException('setup already completed');
    const user = await this.createUser(username, password, 'engineer', 'setup');
    this.events.record('setup.completed', null, user.username);
    return user;
  }

  async login(username: string, password: string): Promise<{ token: string; expiresAt: number; user: UserInfo }> {
    const key = username.toLowerCase();
    const lock = this.failedLogins.get(key);
    if (lock && lock.lockedUntil > Date.now()) {
      throw new UnauthorizedException('too many failed attempts, try again later');
    }

    const row = this.database.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
    const valid = row && !row.disabled && (await verifyPassword(password, row.password_hash));
    if (!row || !valid) {
      const count = (lock?.count ?? 0) + 1;
      this.failedLogins.set(key, { count, lockedUntil: count >= MAX_FAILED_LOGINS ? Date.now() + LOCKOUT_MS : 0 });
      this.events.record('user.login_failed', null, username, { attempt: count });
      // Same message whether the user exists or not: it does not reveal valid usernames.
      throw new UnauthorizedException('invalid username or password');
    }

    this.failedLogins.delete(key);
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    this.database.db
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(sha256(token), row.id, now, expiresAt);
    this.events.record('user.login', null, row.username);
    return { token, expiresAt, user: toInfo(row) };
  }

  logout(token: string, user: AuthUser): void {
    this.database.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    this.events.record('user.logout', null, user.username);
  }

  userForToken(token: string): AuthUser | undefined {
    const row = this.database.db
      .prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`,
      )
      .get(sha256(token), Date.now()) as UserRow | undefined;
    if (!row) return undefined;
    return { id: row.id, username: row.username, roleId: row.role_id, permissions: this.permissionsOf(row.role_id) };
  }

  assertPermission(user: AuthUser, permission: string): void {
    if (!hasPermission(user.permissions, permission)) {
      throw new ForbiddenException(`permission "${permission}" required`);
    }
  }

  listUsers(): UserInfo[] {
    return (this.database.db.prepare('SELECT * FROM users ORDER BY id').all() as unknown as UserRow[]).map(toInfo);
  }

  async createUser(username: string, password: string, roleId: string, actor: string): Promise<UserInfo> {
    this.assertRole(roleId);
    checkPassword(password);
    if (this.database.db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      throw new ConflictException(`user ${username} already exists`);
    }
    const hash = await hashPassword(password);
    const { lastInsertRowid } = this.database.db
      .prepare('INSERT INTO users (username, password_hash, role_id, created_at) VALUES (?, ?, ?, ?)')
      .run(username, hash, roleId, Date.now());
    this.events.record('user.created', null, actor, { username, roleId });
    return this.getUser(Number(lastInsertRowid));
  }

  async updateUser(id: number, changes: { roleId?: string; disabled?: boolean; password?: string }, actor: AuthUser): Promise<UserInfo> {
    const user = this.getUser(id);
    if (id === actor.id && (changes.disabled || (changes.roleId && changes.roleId !== user.roleId))) {
      throw new BadRequestException('you cannot disable yourself or change your own role');
    }
    if (changes.roleId) {
      this.assertRole(changes.roleId);
      this.database.db.prepare('UPDATE users SET role_id = ? WHERE id = ?').run(changes.roleId, id);
    }
    if (changes.disabled !== undefined) {
      this.database.db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(changes.disabled ? 1 : 0, id);
      if (changes.disabled) this.database.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    if (changes.password) {
      checkPassword(changes.password);
      this.database.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(changes.password), id);
      this.database.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    // The new password itself is never written to the audit log.
    this.events.record('user.updated', null, actor.username, {
      username: user.username,
      roleId: changes.roleId,
      disabled: changes.disabled,
      passwordChanged: changes.password !== undefined,
    });
    return this.getUser(id);
  }

  listRoles(): Array<{ id: string; name: string; permissions: string[] }> {
    const roles = this.database.db.prepare('SELECT id, name FROM roles ORDER BY id').all() as Array<{ id: string; name: string }>;
    return roles.map((r) => ({ ...r, permissions: this.permissionsOf(r.id) }));
  }

  setRolePermissions(roleId: string, permissions: string[], actor: AuthUser): string[] {
    this.assertRole(roleId);
    if (roleId === actor.roleId && !hasPermission(permissions, 'users.manage')) {
      throw new BadRequestException('you cannot remove user management from your own role');
    }
    this.database.transaction(() => {
      this.database.db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
      const insert = this.database.db.prepare('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)');
      for (const p of new Set(permissions)) insert.run(roleId, p);
    });
    this.events.record('role.updated', null, actor.username, { roleId, permissions });
    return this.permissionsOf(roleId);
  }

  private getUser(id: number): UserInfo {
    const row = this.database.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    if (!row) throw new NotFoundException(`user ${id} not found`);
    return toInfo(row);
  }

  private permissionsOf(roleId: string): string[] {
    const rows = this.database.db.prepare('SELECT permission FROM role_permissions WHERE role_id = ? ORDER BY permission').all(roleId) as Array<{
      permission: string;
    }>;
    return rows.map((r) => r.permission);
  }

  private assertRole(roleId: string): void {
    if (!this.database.db.prepare('SELECT 1 FROM roles WHERE id = ?').get(roleId)) {
      throw new BadRequestException(`unknown role ${roleId}`);
    }
  }
}

function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException(`password must have at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function toInfo(row: UserRow): UserInfo {
  return { id: row.id, username: row.username, roleId: row.role_id, disabled: row.disabled === 1, createdAt: row.created_at };
}
