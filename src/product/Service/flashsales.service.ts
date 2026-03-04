import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

export interface FlashSaleProduct {
  id: number;
  title: string;
  description: string | null;
  originalPrice: number;
  discountedPrice: number;
  discountPercentage: number;
  category: string;
  imageUrl: string[];
  stock: number;
  views: number;
  tags: string[];
  createdAt: Date;
  user: {
    id: number;
    username: string;
    storeName: string | null;
  } | null;
}

export interface FlashSaleResponse {
  products: FlashSaleProduct[];
  nextRefreshAt: Date;
  refreshesIn: number; // milliseconds until next refresh
  generation: number; // Track which batch this is
}

/**
 * Enterprise Flash Sales Service
 * 
 * ARCHITECTURE: Double-Buffer Pre-rendering
 * ==========================================
 * 
 * Problem: Traditional approach causes "flash sale gap" during refresh
 * Solution: Pre-render next batch 5 minutes before current expires
 * 
 * Design Pattern: Double Buffering (Graphics/Game Dev Pattern)
 * - Buffer A (Current): Actively served to users
 * - Buffer B (Next): Pre-rendered in background
 * - Atomic Swap: Zero-downtime transition at hour boundary
 * 
 * Benefits:
 * ✅ Zero perceived latency during rotation
 * ✅ No cache stampede (pre-warmed)
 * ✅ Graceful degradation on errors
 * ✅ Consistent response times
 * ✅ Production-ready for millions of requests
 * 
 * @class FlashSalesService
 * @since 2.0.0
 */
@Injectable()
export class FlashSalesService implements OnModuleInit {
  private readonly logger = new Logger(FlashSalesService.name);

  // Double Buffer System
  private currentBatch: FlashSaleProduct[] = [];
  private nextBatch: FlashSaleProduct[] = [];

  // Metadata
  private currentRefreshTime: Date;
  private nextRefreshTime: Date;
  private generationCounter = 0;

  // Pre-rendering Control
  private isPrerendering = false;
  private readonly PRE_RENDER_MINUTES = 5; // Start preparing 5min before expiry
  private readonly ROTATION_INTERVAL_MINUTES = 180; // Rotate every 3 hours

  constructor(private prisma: PrismaService) {
    this.logger.log('🔧 PRODUCTION MODE: 3-hour rotation interval');
  }

  /**
   * Called by NestJS AFTER all providers are instantiated and connected.
   * This ensures PrismaService.$connect() has completed before we query the DB.
   */
  async onModuleInit() {
    await this.initializeService();
  }

  /**
   * Initialize service on startup
   * Loads current batch immediately and schedules pre-rendering
   */
  private async initializeService() {
    this.logger.log('🚀 Initializing Flash Sales Service...');
    this.logger.log(`📊 CONFIG: Rotation=${this.ROTATION_INTERVAL_MINUTES}min, Pre-render=${this.PRE_RENDER_MINUTES}min before`);

    try {
      // Set initial timestamps
      this.currentRefreshTime = new Date();
      this.nextRefreshTime = this.getNextRotationTime();

      this.logger.log(`⏰ Initial timestamps set:`);
      this.logger.log(`   Current refresh: ${this.currentRefreshTime.toISOString()}`);
      this.logger.log(`   Next refresh: ${this.nextRefreshTime.toISOString()}`);

      // Load initial batch immediately
      this.logger.log('📦 Loading initial current batch...');
      await this.refreshCurrentBatch();

      // Pre-render next batch in background (don't wait)
      this.logger.log('🎨 Starting background pre-render of next batch...');
      this.preRenderNextBatch().catch(err =>
        this.logger.error(`Failed to pre-render on init: ${err.message}`)
      );

      this.logger.log(
        `✅ Flash Sales initialized | Current batch: ${this.currentBatch.length} products | ` +
        `Next batch: ${this.nextBatch.length} products | ` +
        `Next refresh: ${this.nextRefreshTime.toISOString()}`
      );
    } catch (error) {
      this.logger.error(`❌ Failed to initialize Flash Sales: ${error.message}`);
      this.logger.error(`Stack trace: ${error.stack}`);
      // Set empty fallback
      this.currentBatch = [];
      this.nextBatch = [];
    }
  }

  /**
   * PRIMARY CRON: Runs every 3 hours to swap buffers (0:00, 3:00, 6:00, etc.)
   * This is instant because next batch is already pre-rendered
   */
  @Cron('0 */3 * * *') // Every 3 hours at the top of the hour
  async handleRotationSwap() {
    const now = new Date();
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('🔄 3-HOUR ROTATION TRIGGERED');
    this.logger.log(`⏰ Trigger time: ${now.toISOString()}`);
    this.logger.log(`📊 Current batch size: ${this.currentBatch.length}`);
    this.logger.log(`📊 Next batch size: ${this.nextBatch.length}`);
    this.logger.log(`📊 Generation counter: ${this.generationCounter}`);
    this.logger.log(`📊 Is pre-rendering: ${this.isPrerendering}`);

    await this.performBufferSwap();

    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  /**
   * SECONDARY CRON: Runs at 55 minutes past hours preceding rotation (2:55, 5:55, etc.)
   * Pre-renders 5 minutes before the 3-hour swap
   */
  @Cron('55 2,5,8,11,14,17,20,23 * * *') // 5 minutes before each 3-hour mark
  async handlePreRender() {
    const now = new Date();
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('⏰ PRE-RENDER TRIGGER (5min before swap)');
    this.logger.log(`⏰ Trigger time: ${now.toISOString()}`);
    this.logger.log(`📊 Current batch size: ${this.currentBatch.length}`);
    this.logger.log(`📊 Next batch size: ${this.nextBatch.length}`);
    this.logger.log(`📊 Is pre-rendering: ${this.isPrerendering}`);

    await this.preRenderNextBatch();

    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  /**
   * BACKUP CRON: Safety fallback every 15 minutes to check if refresh is needed
   * Only triggers if system missed the main cron jobs
   */
  @Cron('*/15 * * * *') // Every 15 minutes
  async handleSafetyCheck() {
    const now = new Date();
    const timeSinceRefresh = now.getTime() - this.currentRefreshTime?.getTime();
    const minutesSinceRefresh = Math.floor(timeSinceRefresh / (60 * 1000));

    this.logger.log(`🔍 Safety check: ${minutesSinceRefresh} minutes since last refresh`);

    // If more than 2.5 hours since last refresh (missed cron), force refresh
    if (timeSinceRefresh > 150 * 60 * 1000) {
      this.logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.warn('⚠️ SAFETY CHECK TRIGGERED - MISSED REGULAR REFRESH');
      this.logger.warn(`⚠️ Time since last refresh: ${minutesSinceRefresh} minutes`);
      this.logger.warn(`⚠️ Expected: ${this.ROTATION_INTERVAL_MINUTES} minutes`);
      this.logger.warn('⚠️ Forcing emergency refresh...');
      await this.performBufferSwap();
      this.logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }

  /**
   * Perform atomic buffer swap (instant operation)
   * Current ← Next (pre-rendered batch becomes live)
   * Next ← Empty (ready for next pre-render)
   */
  private async performBufferSwap() {
    const startTime = Date.now();

    this.logger.log('🔄 SWAP START');
    this.logger.log(`   Before swap - Current: ${this.currentBatch.length}, Next: ${this.nextBatch.length}`);

    try {
      // Atomic swap - no database queries, instant
      if (this.nextBatch.length > 0) {
        const oldBatchSize = this.currentBatch.length;
        this.currentBatch = this.nextBatch;
        this.nextBatch = [];
        this.generationCounter++;

        this.logger.log(
          `✅ SWAP COMPLETE | Generation ${this.generationCounter} | ` +
          `Old batch: ${oldBatchSize} → New batch: ${this.currentBatch.length} products | ` +
          `Duration: ${Date.now() - startTime}ms`
        );
      } else {
        this.logger.warn('⚠️ WARNING: Next batch empty during swap!');
        this.logger.warn('⚠️ This means pre-rendering failed or didn\'t run');
        this.logger.warn('⚠️ Falling back to emergency refresh of current batch...');
        await this.refreshCurrentBatch();
      }

      // Update timestamps
      const oldRefreshTime = this.currentRefreshTime;
      const oldNextTime = this.nextRefreshTime;

      this.currentRefreshTime = new Date();
      this.nextRefreshTime = this.getNextRotationTime();

      this.logger.log(`📅 Timestamp update:`);
      this.logger.log(`   Old current: ${oldRefreshTime?.toISOString()}`);
      this.logger.log(`   New current: ${this.currentRefreshTime.toISOString()}`);
      this.logger.log(`   Old next: ${oldNextTime?.toISOString()}`);
      this.logger.log(`   New next: ${this.nextRefreshTime.toISOString()}`);

    } catch (error) {
      this.logger.error(`❌ SWAP FAILED: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      // Keep current batch active on error
    }
  }

  /**
   * Pre-render next batch in background
   * Runs 1 minute before swap to ensure smooth transition (TESTING MODE)
   */
  private async preRenderNextBatch() {
    this.logger.log('🎨 PRE-RENDER ATTEMPT');
    this.logger.log(`   isPrerendering flag: ${this.isPrerendering}`);

    if (this.isPrerendering) {
      this.logger.warn('⚠️ SKIP: Pre-render already in progress');
      this.logger.warn('⚠️ This might indicate a previous pre-render is stuck!');
      return;
    }

    this.isPrerendering = true;
    this.logger.log('🔒 Pre-rendering flag set to TRUE');

    const startTime = Date.now();

    try {
      this.logger.log('🎨 Starting product fetch for next batch...');

      const products = await this.fetchFlashSaleProducts();

      this.logger.log(`📦 Fetched ${products.length} products`);
      this.logger.log(`   Current nextBatch size before assignment: ${this.nextBatch.length}`);

      this.nextBatch = products;

      this.logger.log(`   Next batch size after assignment: ${this.nextBatch.length}`);

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ PRE-RENDER SUCCESS | ${this.nextBatch.length} products ready | ` +
        `${duration}ms | Swap scheduled: ${this.nextRefreshTime.toISOString()}`
      );

    } catch (error) {
      this.logger.error(`❌ PRE-RENDER FAILED: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      this.logger.error(`Next batch remains: ${this.nextBatch.length} products`);
      // Keep old next batch as fallback
    } finally {
      this.isPrerendering = false;
      this.logger.log('🔓 Pre-rendering flag set to FALSE');
    }
  }

  /**
   * Refresh current batch (used on startup and emergency cases)
   */
  private async refreshCurrentBatch() {
    const startTime = Date.now();

    this.logger.log('🔄 REFRESH CURRENT BATCH START');
    this.logger.log(`   Current batch size before: ${this.currentBatch.length}`);

    try {
      this.logger.log('� Fetching products for current batch...');

      const products = await this.fetchFlashSaleProducts();

      this.logger.log(`📦 Fetched ${products.length} products`);

      this.currentBatch = products;
      this.generationCounter++;

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ CURRENT BATCH REFRESHED | Generation ${this.generationCounter} | ` +
        `${this.currentBatch.length} products | ${duration}ms`
      );

    } catch (error) {
      this.logger.error(`❌ REFRESH CURRENT BATCH FAILED: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      throw error;
    }
  }

  /**
   * Calculate discount percentage
   */
  private calculateDiscount(originalPrice: number, discountedPrice: number): number {
    if (originalPrice <= 0) return 0;
    return Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);
  }

  /**
   * Core method: Fetch and prepare flash sale products
   * Extracted for reusability (current batch + next batch)
   * 
   * LOGIC:
   * - Selects completely random active products
   * - No discount threshold validation
   * - Uses database-native randomization
   */
  private async fetchFlashSaleProducts(): Promise<FlashSaleProduct[]> {
    const startTime = Date.now();

    try {
      this.logger.log('🔍 Fetching RANDOM products for flash sales...');

      // 1. Get random IDs using native DB randomization
      // This is efficient for getting a random sample from a large table
      const randomIdsRlt = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM "Product" 
        WHERE "isActive" = true 
          AND "isSold" = false 
          AND "stock" > 0 
          AND "originalPrice" > 0 
        ORDER BY RANDOM() 
        LIMIT 12
      `;

      const randomIds = randomIdsRlt.map(r => r.id);

      if (randomIds.length === 0) {
        this.logger.warn('⚠️ No active products found for flash sales');
        return [];
      }

      this.logger.log(`🎲 Selected ${randomIds.length} random IDs: ${randomIds.join(', ')}`);

      // 2. Fetch full details for these IDs
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: randomIds }
        },
        select: {
          id: true,
          title: true,
          description: true,
          originalPrice: true,
          discountedPrice: true,
          category: true,
          imageUrl: true,
          stock: true,
          views: true,
          tags: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              username: true,
              storeName: true,
            },
          },
        },
      });

      // 3. Map to FlashSaleProduct interface
      const activeProducts: FlashSaleProduct[] = products.map(product => {
        const discountPercentage = this.calculateDiscount(
          product.originalPrice,
          product.discountedPrice,
        );

        return {
          ...product,
          discountPercentage,
        };
      });

      const duration = Date.now() - startTime;
      this.logger.log(
        `🎉 Flash sales products prepared | ${activeProducts.length} products | ${duration}ms`,
      );

      return activeProducts;
    } catch (error) {
      this.logger.error(`❌ Error fetching flash sale products: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current flash sales products
   * Always serves from currentBatch (pre-rendered, instant response)
   */
  async getFlashSales(): Promise<FlashSaleResponse> {
    this.logger.log('📡 GET request received');
    this.logger.log(`   Current batch: ${this.currentBatch.length} products`);
    this.logger.log(`   Next batch: ${this.nextBatch.length} products`);
    this.logger.log(`   Generation: ${this.generationCounter}`);

    // If current batch is empty (shouldn't happen), try emergency refresh
    if (this.currentBatch.length === 0) {
      this.logger.warn('⚠️ EMERGENCY: Current batch empty!');
      this.logger.warn('⚠️ Performing emergency refresh...');
      await this.refreshCurrentBatch();
    }

    const now = new Date();
    const refreshesIn = this.nextRefreshTime.getTime() - now.getTime();

    const response = {
      products: this.currentBatch,
      nextRefreshAt: this.nextRefreshTime,
      refreshesIn: Math.max(0, refreshesIn),
      generation: this.generationCounter,
    };

    this.logger.log(`✅ Returning ${response.products.length} products | Refreshes in ${Math.floor(refreshesIn / 1000)}s`);

    return response;
  }

  /**
   * Fisher-Yates shuffle algorithm for randomization
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get the next rotation time (every 3 hours: 0:00, 3:00, 6:00, etc.)
   */
  private getNextRotationTime(): Date {
    const now = new Date();
    const next = new Date(now);

    // Round up to next 3-hour mark (0, 3, 6, 9, 12, 15, 18, 21)
    const currentHour = next.getHours();
    const nextInterval = Math.ceil((currentHour + 1) / 3) * 3;

    next.setHours(nextInterval % 24, 0, 0, 0);

    // If we've wrapped to next day, ensure we're at the right time
    if (nextInterval >= 24) {
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
    }

    this.logger.log(`⏰ Calculated next rotation: ${next.toISOString()} (from ${now.toISOString()})`);

    return next;
  }

  /**
   * Manual refresh endpoint (for admin/testing purposes)
   * Forces immediate buffer swap with new products
   */
  async forceRefresh(): Promise<FlashSaleResponse> {
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('🔄 MANUAL REFRESH TRIGGERED');
    this.logger.log(`   Before: Current=${this.currentBatch.length}, Next=${this.nextBatch.length}`);

    // Refresh both buffers
    await this.refreshCurrentBatch();
    await this.preRenderNextBatch();

    this.logger.log(`   After: Current=${this.currentBatch.length}, Next=${this.nextBatch.length}`);
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return this.getFlashSales();
  }
}
