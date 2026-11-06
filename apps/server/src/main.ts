import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config';

const SHUTDOWN_TIMEOUT_MS = 5000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  // Clients authenticate with a bearer token, not cookies, so any origin on the local
  // network may call the API (the web client can be served from another port).
  app.enableCors({ origin: true, allowedHeaders: ['content-type', 'authorization'] });
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
  handleShutdownRequests(app);

  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.webDir) serveWebClient(app, config.webDir);
  await app.listen(config.port);
  Logger.log(`IntegrAlo core listening on http://localhost:${config.port}/api`, 'Bootstrap');
}

/**
 * Orderly shutdown on SIGINT/SIGTERM or, when started by the supervisor, on its
 * "shutdown" message (on Windows a parent cannot send SIGTERM to a child).
 * Safety net: if the orderly shutdown hangs, the process still ends.
 */
function handleShutdownRequests(app: INestApplication): void {
  const armTimeout = () => setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, armTimeout);
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    armTimeout();
    void app.close().then(() => process.exit(0));
  };
  process.on('message', (message: unknown) => {
    if ((message as { type?: string } | null)?.type === 'shutdown') close();
  });
  // The supervisor's channel closed without a "shutdown": the supervisor itself is gone
  // (ended by force). The core stops too, instead of running on without anyone watching it.
  process.on('disconnect', close);
}

/**
 * Serves the exported web client from the core, so a browser on the network only needs
 * the address of this computer. Routes that are not API calls fall back to index.html
 * (single-page app).
 */
function serveWebClient(app: NestExpressApplication, webDir: string): void {
  const index = join(webDir, 'index.html');
  if (!existsSync(index)) {
    Logger.warn(`web client not found in ${webDir}`, 'Bootstrap');
    return;
  }
  app.useStaticAssets(webDir, { index: false });
  app.use((req: { method: string; path: string }, res: { sendFile(path: string): void }, next: () => void) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) res.sendFile(index);
    else next();
  });
  Logger.log(`serving web client from ${webDir}`, 'Bootstrap');
}

void bootstrap();
