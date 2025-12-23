import { Controller, Get, Query, Param, ValidationPipe, UsePipes, HttpStatus, HttpCode, BadRequestException } from '@nestjs/common';
import { CategoryProductsService } from '../Service/category-products.service';
import { GetProductsByCategoryDto, CategoryProductsResponseDto, CategoryStatsDto } from '../dto/category.dto';
import { GetProductsByCategoryIdsDto } from '../dto/category-ids.dto';


/**
 * CategoryController
 * 
 * RESTful API endpoints for category-based product operations
 * Following REST best practices and OpenAPI documentation standards
 * 
 * @controller /products/categories
 * @version 1.0
 */
@Controller('products/categories')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CategoryController {
  constructor(private readonly categoryProductsService: CategoryProductsService) {}

  /**
   * Get products by multiple category IDs
   *
   * Example: GET /products/categories/by-ids?categoryIds=1,2,3&limit=20&page=1
   */
  @Get('by-ids')
  @HttpCode(HttpStatus.OK)
  async getProductsByCategoryIds(
    @Query() query: GetProductsByCategoryIdsDto,
  ): Promise<{ success: boolean } & CategoryProductsResponseDto> {
    const result = await this.categoryProductsService.getProductsByCategoryIds(query);
    return { success: true, ...result };
  }

  /**
   * Get products by specific category with filters and pagination
   * 
   * @route GET /products/categories/:category
   * @access Public
   * @param category - Category to filter by (clothes, accessories, home, books, 
   * 
   * , others)
   * @query page - Page number (default: 1)
   * @query limit - Items per page (default: 20, max: 100)
   * @query sortBy - Sort order (newest, oldest, price-asc, price-desc, popular, rating)
   * @query condition - Filter by condition (new, like-new, good, fair, used)
   * @query minPrice - Minimum price filter
   * @query maxPrice - Maximum price filter
   * @query inStock - Filter by availability (default: true)
   * @returns Paginated list of products with metadata
   */
  @Get(':category')
  @HttpCode(HttpStatus.OK)
  async getProductsByCategory(
    @Param('category') category: string,
    @Query() queryParams: Omit<GetProductsByCategoryDto, 'category'>,
  ): Promise<{ success: boolean } & CategoryProductsResponseDto> {
    const dto: GetProductsByCategoryDto = {
      category: category as any,
      ...queryParams,
    };

    const result = await this.categoryProductsService.getProductsByCategory(dto);
    
    return {
      success: true,
      ...result,
    };
  }

  /**
   * Get all available categories with product counts
   * 
   * @route GET /products/categories/all
   * @access Public
   * @returns Array of categories with metadata and product counts
   */
  @Get('all/list')
  @HttpCode(HttpStatus.OK)
  async getAllCategories() {
    const categories = await this.categoryProductsService.getAllCategoriesWithCounts();
    
    return {
      success: true,
      data: categories,
    };
  }


}
