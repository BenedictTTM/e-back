import { IsInt, IsOptional, IsString, Min, Max, IsIn, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductCategory, isValidCategory } from '../categories/category.enum';

/**
 * DTO for category-based product retrieval
 * Follows SOLID principles: Single Responsibility - only handles category query validation
 * 
 * @class GetProductsByCategoryDto
 */
export class GetProductsByCategoryDto {
  @IsString({ message: 'Category must be a string' })
  @MinLength(1, { message: 'Category cannot be empty' })
  category: ProductCategory; // dynamic string category

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 12;

  @IsOptional()
  @IsString()
  @IsIn(['newest', 'oldest', 'price-asc', 'price-desc', 'popular', 'rating'], {
    message: 'Sort must be one of: newest, oldest, price-asc, price-desc, popular, rating',
  })
  sortBy?: string = 'newest';

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0, { message: 'Minimum price cannot be negative' })
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0, { message: 'Maximum price cannot be negative' })
  maxPrice?: number;

  @IsOptional()
  @Type(() => Boolean)
  inStock?: boolean = true;
}

/**
 * Response DTO for paginated category products
 * Ensures consistent API response structure
 */
export class CategoryProductsResponseDto {
  data: any[];

  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };

  category: {
    key: string;
    label: string;
    description: string;
  };

  filters?: Record<string, any>;
}

/**
 * Response DTO for category statistics
 * Used for analytics and dashboard features
 */
export class CategoryStatsDto {
  category: ProductCategory;
  totalProducts: number;
  activeProducts: number;
  averagePrice: number;
  priceRange: {
    min: number;
    max: number;
  };
  popularTags: string[];
}
