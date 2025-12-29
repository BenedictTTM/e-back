import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { SearchService, SearchFilters, SearchOptions, SearchResult } from '../../search/search.service';

@Injectable()
export class SearchProductsService {
  private readonly logger = new Logger(SearchProductsService.name);

  constructor(
    private readonly searchService: SearchService,
  ) { }

  /**
   * Main search method for products
   * Delegates to the generic SearchService while providing a domain-specific interface
   */
  async searchProducts(
    query: string,
    filters?: SearchFilters,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    this.logger.debug(`Searching products: "${query}" | Page: ${options?.page ?? 1}`);

    try {
      // Delegate to the generic search service
      // We can inject default product-specific options here if needed, e.g., strict mode
      const result = await this.searchService.search(query, filters, {
        ...options,
        // Default options if not provided
        minSimilarity: options?.minSimilarity ?? 0.3,
      });

      return result;
    } catch (error) {
      this.logger.error(`Failed to search products: ${error.message}`, error.stack);
      // Throwing a proper HTTP exception ensures the client receives a 500 error 
      // rather than an empty list which would be misleading (hiding the outage).
      throw new InternalServerErrorException('An error occurred while searching for products.');
    }
  }
}
