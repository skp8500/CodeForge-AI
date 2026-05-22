import * as dotenv from 'dotenv';
dotenv.config();

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  app.useWebSocketAdapter(new IoAdapter(app));

  const cookieParser = await import('cookie-parser');
  app.use(cookieParser.default());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CodeForge AI API')
    .setDescription('AI-powered online coding judge platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('refreshToken')
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = process.env.API_PORT || 3001;
  await app.listen(port, process.env.API_HOST || '0.0.0.0');
  console.log(`✓ API running at http://localhost:${port}/api/v1`);
  console.log(`✓ Health check: http://localhost:${port}/api/v1/health`);
}

void bootstrap();
