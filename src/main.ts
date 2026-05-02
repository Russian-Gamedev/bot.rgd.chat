import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as path from 'path';

import { EnvironmentVariables } from '#config/env';

import './lib/polyfill';

import { AppModule } from './app.module';

async function getSwaggerCustom() {
  const assetsDir = path.resolve('./assets/swagger');
  const customCss = await Bun.file(path.join(assetsDir, 'custom.css')).text();
  const customJs = await Bun.file(path.join(assetsDir, 'custom.js')).text();

  return { customCss, customJs };
}

async function main() {
  const logger = new Logger('Bootstrap');
  logger.log('Starting application...');
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService<EnvironmentVariables>);

  app.enableShutdownHooks();
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.useWebSocketAdapter(new WsAdapter(app));

  const PackageJSON = await Bun.file('./package.json').json();

  const documentBuilder = new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('Взаимодействие с ботом через внешние сервисы bot.rgd.chat')
    .setVersion(PackageJSON.version)
    .build();

  const document = SwaggerModule.createDocument(app, documentBuilder);

  const { customCss, customJs } = await getSwaggerCustom();
  SwaggerModule.setup('docs', app, document, {
    customCss,
    customJs,
    customfavIcon: '/favicon.ico',
    customSiteTitle: 'RGD Bot API Docs',
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');

  const currentIP = await fetch('https://api.ipify.org').then((res) =>
    res.text(),
  );
  logger.log(`Server is running on port ${port}`);
  logger.log(`Current IP: ${currentIP}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
