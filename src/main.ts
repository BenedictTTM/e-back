import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable cookie parser middleware


  // Raw body parser for webhook signature verification
  // This stores the raw body on req.rawBody for routes that need it (like webhooks)
  app.use(
    json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );

  // Enable CORS for frontend connection
  const allowedOrigins = [
    'http://localhost:3000',
    // Added deployed frontend domain for CORS
    'https://clicahair.vercel.app',
    'https://nakpinto1.vercel.app',
    'https://www.cilcahair.com',
    'http://www.cilcahair.com',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
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

  // Enable global validation pipes
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,           // Remove properties that don't have decorators
    forbidNonWhitelisted: false, // CHANGE: Set to false to allow form-data fields
    transform: true,           // Transform payloads to DTO instances
    disableErrorMessages: false, // Show detailed error messages
    validateCustomDecorators: true, // Enable custom validation decorators
    transformOptions: {
      enableImplicitConversion: true, // CHANGE: This helps convert strings to numbers
    },
    // ADD: New option to handle form-data better
    skipMissingProperties: false,
    // ADD: New option to ensure all required fields are validated
    skipNullProperties: false,
    // ADD: New option to handle undefined values
    skipUndefinedProperties: false,
  }));

  const port = process.env.PORT || 3001;
  // Log whether a DATABASE_URL is present (don't print the value)
  console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);
  await app.listen(port);
  console.log(`🚀 Application is running on port ${port}`);
}
bootstrap();

// Capture bootstrap errors
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

