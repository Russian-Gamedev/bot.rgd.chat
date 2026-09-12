import {
  ConsoleLogger,
  INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { EnvironmentVariables } from '#config/env';

import './lib/polyfill';

import { AppModule } from './app.module';

const SHUTDOWN_TIMEOUT_MS = 15_000;
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];
type ShutdownApplication = INestApplication & {
  close(signal?: ShutdownSignal): Promise<void>;
};

function registerProcessShutdownHandlers(
  app: ShutdownApplication,
  logger: Logger,
) {
  let shutdownStarted = false;

  const shutdown = async (signal: ShutdownSignal) => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    logger.log(`Закрываем приложение... (${signal})`);

    const forceExitTimer = setTimeout(() => {
      logger.error(
        `Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`,
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      await app.close(signal);
      logger.log('Application closed gracefully');
      process.exit(0);
    } catch (error) {
      logger.error(`Failed to close application gracefully: ${String(error)}`);
      process.exit(1);
    } finally {
      clearTimeout(forceExitTimer);
    }
  };

  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }
}

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      json: isProduction,
      logLevels: isProduction ? ['log', 'warn', 'error', 'fatal'] : undefined,
    }),
  });
  const logger = new Logger('Bootstrap');

  const config = app.get(ConfigService<EnvironmentVariables>);

  registerProcessShutdownHandlers(app, logger);
  const origin = config.get<string[]>('CORS_ORIGINS', []);
  app.enableCors({
    credentials: true,
    origin,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.useWebSocketAdapter(new WsAdapter(app));

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');

  const currentIP = await fetch('https://api.ipify.org').then((res) =>
    res.text(),
  );
  logger.log(`Server is running on port ${port}`);
  logger.log(`Current IP: ${currentIP}`);
}

main().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Application failed to bootstrap', err);
  process.exit(1);
});
