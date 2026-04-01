import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';


@Injectable()
export class KeepAliveService implements OnModuleInit {
  private readonly logger = new Logger(KeepAliveService.name);
  private serverUrl: string;

  constructor(private readonly prisma: PrismaService) { }

  onModuleInit() {
    const port = process.env.PORT || 3001;

    this.serverUrl =
      process.env.RENDER_EXTERNAL_URL ||
      process.env.SERVER_URL ||
      `http://localhost:${port}`;

    this.logger.log(
      `KeepAlive initialised — DB ping every 4 min, HTTP self-ping every 10 min (${this.serverUrl})`,
    );
  }

  @Cron('*/4 * * * *') // every 4 minutes
  async pingDatabase() {
    if (process.env.NODE_ENV === 'production') return; // ← skip in prod

    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const ms = Date.now() - start;
      this.logger.debug(`DB keepalive OK (${ms}ms)`);
    } catch (error) {
      this.logger.warn(`DB keepalive failed: ${error.message}`);
      try {
        await this.prisma.$connect();
        this.logger.log('DB reconnected after keepalive failure');
      } catch (reconnectError) {
        this.logger.error(`DB reconnect failed: ${reconnectError.message}`);
      }
    }
  }

  /**
   * Self-ping the HTTP server every 10 minutes.
   * Render spins down after ~15 min of inactivity, so 10-min ping keeps it warm.
   * Uses native fetch (Node 18+).
   */
  @Cron('*/10 * * * *') // every 10 minutes
  async selfPing() {
    try {
      const start = Date.now();
      const url = `${this.serverUrl}/health`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000), // 10 s timeout
      });
      const ms = Date.now() - start;
      this.logger.debug(
        `Self-ping OK — ${res.status} (${ms}ms)`,
      );
    } catch (error) {
      this.logger.warn(`Self-ping failed: ${error.message}`);
    }
  }
}
