import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchIndexService implements OnModuleInit {
  private readonly logger = new Logger(SearchIndexService.name);

  constructor(private readonly prisma: PrismaService) { }

  async onModuleInit() {
    try {
      this.logger.log('Initializing search infrastructure...');
      await this.enableExtensions();
      await this.createSearchIndexes();
      await this.createMaterializedViews();
      await this.analyzeIndexes();
      this.logger.log('Search infrastructure ready');
    } catch (error) {
      this.logger.error(`Failed to init search: ${error.message}`);
      this.logger.warn('Continuing without search optimization...');
    }
  }

  private async enableExtensions(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
      await this.prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS unaccent;`);
      await this.prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS btree_gin;`);
      this.logger.log('Extensions enabled');
    } catch (error) {
      if (error.message.includes('already exists')) {
        this.logger.log('Extensions already enabled');
      } else {
        throw error;
      }
    }
  }

  private async createSearchIndexes(): Promise<void> {
    try {
      // Trigram indexes
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_title_trgm 
        ON "Product" USING GIN (title gin_trgm_ops);
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_description_trgm 
        ON "Product" USING GIN (description gin_trgm_ops);
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_category_trgm 
        ON "Product" USING GIN (category gin_trgm_ops);
      `);

      // Full-text search index
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_fulltext 
        ON "Product" USING GIN (
          to_tsvector('english', 
            COALESCE(title, '') || ' ' || 
            COALESCE(description, '') || ' ' || 
            COALESCE(category, '')
          )
        );
      `);

      // Composite indexes
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_active_unsold 
        ON "Product" ("isActive", "isSold", "createdAt" DESC)
        WHERE "isActive" = true AND "isSold" = false;
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_category_condition 
        ON "Product" USING GIN (category, condition);
      `);

      // Sorting indexes
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_price_asc 
        ON "Product" ("discountedPrice" ASC)
        WHERE "isActive" = true AND "isSold" = false;
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_price_desc 
        ON "Product" ("discountedPrice" DESC)
        WHERE "isActive" = true AND "isSold" = false;
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_created_desc 
        ON "Product" ("createdAt" DESC)
        WHERE "isActive" = true AND "isSold" = false;
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_views_desc 
        ON "Product" ("views" DESC, "createdAt" DESC)
        WHERE "isActive" = true AND "isSold" = false;
      `);

      // Tags index
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_product_tags 
        ON "Product" USING GIN (tags);
      `);

      this.logger.log('Search indexes created');
    } catch (error) {
      if (error.message.includes('already exists')) {
        this.logger.log('Search indexes already exist');
      } else {
        throw error;
      }
    }
  }

  private async createMaterializedViews(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS product_category_facets AS
        SELECT 
          category,
          COUNT(*) as count,
          MIN("discountedPrice") as min_price,
          MAX("discountedPrice") as max_price
        FROM "Product"
        WHERE "isActive" = true AND "isSold" = false
        GROUP BY category
        ORDER BY count DESC;
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_category_facets_category 
        ON product_category_facets (category);
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS product_condition_facets AS
        SELECT 
          condition,
          COUNT(*) as count
        FROM "Product"
        WHERE "isActive" = true AND "isSold" = false AND condition IS NOT NULL
        GROUP BY condition
        ORDER BY count DESC;
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_condition_facets_condition 
        ON product_condition_facets (condition);
      `);

      this.logger.log('Materialized views created');
    } catch (error) {
      if (error.message.includes('already exists')) {
        this.logger.log('Materialized views already exist');
      } else {
        throw error;
      }
    }
  }

  private async analyzeIndexes(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`ANALYZE "Product";`);
      this.logger.log('Product table analyzed');
    } catch (error) {
      this.logger.warn(`Failed to analyze indexes: ${error.message}`);
    }
  }

  async refreshFacetViews(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY product_category_facets;`);
      await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY product_condition_facets;`);
      this.logger.log('Facet views refreshed');
    } catch (error) {
      this.logger.error(`Failed to refresh facet views: ${error.message}`);
      throw error;
    }
  }

  async getIndexStats(): Promise<any> {
    try {
      const stats = await this.prisma.$queryRawUnsafe(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
          idx_scan as scans,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched
        FROM pg_stat_user_indexes
        WHERE tablename = 'Product'
        ORDER BY pg_relation_size(indexrelid) DESC;
      `);
      return stats;
    } catch (error) {
      this.logger.error(`Failed to get index stats: ${error.message}`);
      return [];
    }
  }

  async rebuildIndexes(): Promise<void> {
    try {
      this.logger.warn('Rebuilding search indexes...');
      await this.prisma.$executeRawUnsafe(`REINDEX TABLE "Product";`);
      await this.analyzeIndexes();
      this.logger.log('Indexes rebuilt');
    } catch (error) {
      this.logger.error(`Failed to rebuild indexes: ${error.message}`);
      throw error;
    }
  }

  async dropIndexes(): Promise<void> {
    try {
      this.logger.warn('Dropping all search indexes...');
      const indexNames = [
        'idx_product_title_trgm',
        'idx_product_description_trgm',
        'idx_product_category_trgm',
        'idx_product_fulltext',
        'idx_product_active_unsold',
        'idx_product_category_condition',
        'idx_product_price_asc',
        'idx_product_price_desc',
        'idx_product_created_desc',
        'idx_product_views_desc',
        'idx_product_tags',
      ];

      for (const indexName of indexNames) {
        await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS ${indexName};`);
      }
      this.logger.log('All search indexes dropped');
    } catch (error) {
      this.logger.error(`Failed to drop indexes: ${error.message}`);
      throw error;
    }
  }
}
