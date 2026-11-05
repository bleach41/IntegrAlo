import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config';

const SHUTDOWN_TIMEOUT_MS = 5000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // Clients authenticate with a bearer token, not cookies, so any origin on the local
  // network may call the API (the web client can be served from another port).
  app.enableCors({ origin: true, allowedHeaders: ['content-type', 'authorization'] });
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
  // Safety net: if an orderly shutdown hangs, the process still ends so a supervisor can restart it.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref());
  }
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port);
  Logger.log(`IntegrAlo core listening on http://localhost:${config.port}/api`, 'Bootstrap');
}

void bootstrap();
