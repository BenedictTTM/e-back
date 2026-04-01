import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Raw body for webhook signature verification
  app.use(
    json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );

  const allowedOrigins = [
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-paystack-signature', 'idempotency-key'],
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    disableErrorMessages: false,
    validateCustomDecorators: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    skipMissingProperties: false,
    skipNullProperties: false,
    skipUndefinedProperties: false,
  }));

  const port = process.env.PORT || 3001;
  console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);
  await app.listen(port);
  console.log(`Application is running on port ${port}`);
}
bootstrap();

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});
