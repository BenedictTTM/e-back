import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
      throw new Error(
        'DATABASE_URL environment variable is not set. Cannot start without a database.',
      );
    }

    super({
      datasources: {
        db: { url: dbUrl },
      },
      log:
        process.env.NODE_ENV === 'production'
          ? ['error', 'warn']
          : ['query', 'info', 'warn', 'error'],
    });
  }

  async onModuleInit() {
    let retries = 3;
    while (retries > 0) {
      try {
        await this.$connect();
        this.logger.log('Prisma: connected to database');
        return;
      } catch (error) {
        retries--;
        this.logger.warn(
          `Prisma connection attempt failed (${3 - retries}/3): ${error.message}`,
        );
        if (retries === 0) {
          this.logger.error(
            'Prisma: could not connect after 3 attempts',
            error.stack,
          );
          throw error;
        }
        // Exponential back-off: 1s, 2s
        await new Promise((r) => setTimeout(r, (3 - retries) * 1000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma: disconnected from database');
  }
}
