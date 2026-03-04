import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * KeepAliveService — Prevents cold starts on Render + Neon DB
 *
 * Problem:
 *   - Render free/starter tier spins down after ~15 min of inactivity
 *   - Neon free tier suspends compute after ~5 min of inactivity
 *   - Combined, first request after idle can take 10-15 seconds
 *
 * Solution:
 *   - Ping the database every 4 minutes to keep Neon compute alive
 *   - Self-ping the HTTP server every 10 minutes to keep Render awake
 *   - Both are lightweight no-op operations with minimal resource usage
 */
@Injectable()
export class KeepAliveService implements OnModuleInit {
  private readonly logger = new Logger(KeepAliveService.name);
  private serverUrl: string;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const port = process.env.PORT || 3001;
    // In production on Render, use the external URL so the HTTP ping
    // actually hits the Render load balancer and counts as activity.
    // Locally or when no RENDER_EXTERNAL_URL is set, fall back to localhost.
    this.serverUrl =
      process.env.RENDER_EXTERNAL_URL ||
      process.env.SERVER_URL ||
      `http://localhost:${port}`;

    this.logger.log(
      `KeepAlive initialised — DB ping every 4 min, HTTP self-ping every 10 min (${this.serverUrl})`,
    );
  }

  /**
   * Ping the database every 4 minutes.
   * Neon suspends after ~5 min of inactivity, so 4-min interval keeps it warm.
   */
  @Cron('*/4 * * * *') // every 4 minutes
  async pingDatabase() {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const ms = Date.now() - start;
      this.logger.debug(`DB keepalive OK (${ms}ms)`);
    } catch (error) {
      this.logger.warn(`DB keepalive failed: ${error.message}`);
      // Attempt to reconnect
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
