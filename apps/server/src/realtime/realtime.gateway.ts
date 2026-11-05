import { OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { AuthUser } from '../auth/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { PERMISSIONS, hasPermission } from '../auth/permissions';
import { BusEvents, EventBus } from '../bus/event-bus';

/** The part of a ws socket used here. */
interface Socket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface Client {
  user?: AuthUser;
  token?: string;
  authTimer?: NodeJS.Timeout;
}

const OPEN = 1;
const AUTH_TIMEOUT_MS = 5000;
const REVALIDATE_MS = 60_000;
/** Close code for "authentication failed" (4000–4999 is reserved for applications). */
const CLOSE_UNAUTHORIZED = 4001;
/** Standard close code "going away" (server shutting down); clients reconnect later. */
const CLOSE_GOING_AWAY = 1001;

/** Permission a client needs to receive each kind of change. */
const REQUIRED: Record<keyof BusEvents, string> = {
  node: PERMISSIONS.nodesRead,
  telemetry: PERMISSIONS.telemetryRead,
  command: PERMISSIONS.commandsRead,
  alarm: PERMISSIONS.alarmsRead,
};

/**
 * Real-time channel at ws://<host>/api/ws.
 * The token is not sent in the URL (URLs end up in logs): the client must send
 * {"event":"auth","data":{"token":"..."}} within 5 s, or the connection is closed.
 * Afterwards it receives {"event": kind, "data": ...} for every change it may read.
 */
@WebSocketGateway({ path: '/api/ws' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly clients = new Map<Socket, Client>();
  private readonly revalidate: NodeJS.Timeout;

  constructor(
    private readonly auth: AuthService,
    bus: EventBus,
  ) {
    for (const kind of Object.keys(REQUIRED) as Array<keyof BusEvents>) {
      bus.on(kind, (payload) => this.broadcast(kind, payload));
    }
    // A session closed or expired elsewhere also ends its real-time connection.
    this.revalidate = setInterval(() => this.revalidateSessions(), REVALIDATE_MS);
    this.revalidate.unref();
  }

  handleConnection(socket: Socket): void {
    const authTimer = setTimeout(() => socket.close(CLOSE_UNAUTHORIZED, 'authentication required'), AUTH_TIMEOUT_MS);
    this.clients.set(socket, { authTimer });
  }

  handleDisconnect(socket: Socket): void {
    clearTimeout(this.clients.get(socket)?.authTimer);
    this.clients.delete(socket);
  }

  /** Open sockets would keep the HTTP server alive and block the shutdown: close them first. */
  onModuleDestroy(): void {
    clearInterval(this.revalidate);
    for (const socket of this.clients.keys()) socket.close(CLOSE_GOING_AWAY, 'server shutting down');
    this.clients.clear();
  }

  @SubscribeMessage('auth')
  authenticate(@ConnectedSocket() socket: Socket, @MessageBody() data: unknown): void {
    const client = this.clients.get(socket);
    const token = typeof data === 'object' && data !== null ? (data as { token?: unknown }).token : undefined;
    const user = typeof token === 'string' ? this.auth.userForToken(token) : undefined;
    if (!client || !user) {
      socket.close(CLOSE_UNAUTHORIZED, 'invalid session');
      return;
    }
    clearTimeout(client.authTimer);
    client.user = user;
    client.token = token as string;
    this.send(socket, 'auth', { username: user.username, roleId: user.roleId });
  }

  private broadcast<K extends keyof BusEvents>(kind: K, payload: BusEvents[K]): void {
    for (const [socket, client] of this.clients) {
      if (client.user && hasPermission(client.user.permissions, REQUIRED[kind])) {
        this.send(socket, kind, payload);
      }
    }
  }

  private revalidateSessions(): void {
    for (const [socket, client] of this.clients) {
      if (client.token && !this.auth.userForToken(client.token)) {
        socket.close(CLOSE_UNAUTHORIZED, 'session ended');
      }
    }
  }

  private send(socket: Socket, event: string, data: unknown): void {
    if (socket.readyState === OPEN) socket.send(JSON.stringify({ event, data }));
  }
}
