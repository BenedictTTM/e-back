import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Product, Prisma } from '@prisma/client';

export interface SearchFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: string;
  tags?: string[];
  location?: {
    lat: number;
    lng: number;
    radiusKm?: number;
  };
  rating?: number;
  inStock?: boolean;
}

export interface SearchOptions {
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'price-asc' | 'price-desc' | 'newest' | 'popular' | 'rating';
  useStrictMode?: boolean;
  minSimilarity?: number;
}

export interface FacetResult {
  categories: { name: string; count: number }[];
  priceRange: { min: number; max: number };
  conditions: { name: string; count: number }[];
}

export interface SearchResult {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  filters: FacetResult;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Execute optimized search using PostgreSQL Full-Text Search and GIN indexes
   */
  async search(
    query: string,
    filters: SearchFilters = {},
    options: SearchOptions = {},
  ): Promise<SearchResult> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20)); // Cap limit at 100
    const offset = (page - 1) * limit;

    try {
      // 1. Build the dynamic WHERE clause
      const whereConditions: Prisma.Sql[] = [
        Prisma.sql`"isActive" = true`,
        Prisma.sql`"isSold" = false`
      ];

      // Text Search Condition
      if (query && query.trim().length > 0) {
        // Match against the combined vector logic
        // Removed trigram % operator as it requires pg_trgm extension which might be missing/failing
        whereConditions.push(Prisma.sql`
            to_tsvector('english', 
              COALESCE(title, '') || ' ' || 
              COALESCE(description, '') || ' ' || 
              COALESCE(category, '')
            ) @@ websearch_to_tsquery('english', ${query})
        `);
      }

      // Filter: Category
      if (filters.category) {
        whereConditions.push(Prisma.sql`category = ${filters.category}`);
      }

      // Filter: Price Range
      if (filters.minPrice !== undefined) {
        whereConditions.push(Prisma.sql`"discountedPrice" >= ${filters.minPrice}`);
      }
      if (filters.maxPrice !== undefined) {
        whereConditions.push(Prisma.sql`"discountedPrice" <= ${filters.maxPrice}`);
      }

      // Filter: Condition
      if (filters.condition) {
        whereConditions.push(Prisma.sql`condition = ${filters.condition}`);
      }

      // Filter: Tags (Array overlap)
      if (filters.tags && filters.tags.length > 0) {
        whereConditions.push(Prisma.sql`tags && ${filters.tags}::text[]`);
      }

      // Filter: In Stock
      if (filters.inStock) {
        whereConditions.push(Prisma.sql`stock > 0`);
      }

      // Combine conditions
      const whereClause = whereConditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(whereConditions, ' AND ')}`
        : Prisma.empty;

      // 2. Build Sort Clause
      let orderByClause = Prisma.sql`ORDER BY "createdAt" DESC`; // Default

      if (options.sortBy) {
        switch (options.sortBy) {
          case 'relevance':
            if (query && query.trim().length > 0) {
              // Rank by text match density
              orderByClause = Prisma.sql`ORDER BY ts_rank(
                 to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '')),
                 websearch_to_tsquery('english', ${query})
               ) DESC, "createdAt" DESC`;
            }
            break;
          case 'price-asc':
            orderByClause = Prisma.sql`ORDER BY "discountedPrice" ASC`;
            break;
          case 'price-desc':
            orderByClause = Prisma.sql`ORDER BY "discountedPrice" DESC`;
            break;
          case 'newest':
            orderByClause = Prisma.sql`ORDER BY "createdAt" DESC`;
            break;
          case 'popular':
            orderByClause = Prisma.sql`ORDER BY "views" DESC`;
            break;
          case 'rating':
            orderByClause = Prisma.sql`ORDER BY "averageRating" DESC NULLS LAST`;
            break;
        }
      }

      // 3. Execute Query (Fetch Products + Total Count)
      const productsQuery = Prisma.sql`
        SELECT 
          id, title, description, "originalPrice", "discountedPrice", stock, "imageUrl", 
          condition, category, tags, "createdAt", views, "isSold", "isActive",
          "userId", "averageRating"
        FROM "Product"
        ${whereClause}
        ${orderByClause}
        LIMIT ${limit} OFFSET ${offset}
      `;

      const countQuery = Prisma.sql`
        SELECT COUNT(*)::int as total
        FROM "Product"
        ${whereClause}
      `;

      // Parallel Execution
      const [products, totalResult] = await Promise.all([
        this.prisma.$queryRaw<Product[]>(productsQuery),
        this.prisma.$queryRaw<{ total: number }[]>(countQuery)
      ]);

      const total = totalResult[0]?.total || 0;

      // 4. Fetch Facets (Aggregations) based on current search result context
      const facets = await this.getFacets(whereClause);

      return {
        products,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
        filters: facets,
      };

    } catch (error) {
      this.logger.error(`Search failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async getFacets(currentWhereClause: Prisma.Sql): Promise<FacetResult> {
    const categoryStats = await this.prisma.$queryRaw<{ category: string, count: number }[]>`
      SELECT category, COUNT(*)::int as count
      FROM "Product"
      ${currentWhereClause}
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `;

    const conditionStats = await this.prisma.$queryRaw<{ condition: string, count: number }[]>`
      SELECT condition, COUNT(*)::int as count
      FROM "Product"
      ${currentWhereClause}
      GROUP BY condition
      ORDER BY count DESC
      LIMIT 10
    `;

    // Price range
    const priceStats = await this.prisma.$queryRaw<{ min: number, max: number }[]>`
      SELECT MIN("discountedPrice") as min, MAX("discountedPrice") as max
      FROM "Product"
      ${currentWhereClause}
    `;

    return {
      categories: categoryStats.map(c => ({ name: c.category, count: c.count })),
      conditions: conditionStats.map(c => ({ name: c.condition, count: c.count })),
      priceRange: {
        min: priceStats[0]?.min || 0,
        max: priceStats[0]?.max || 0
      }
    };
  }
}
