import { IsArray, IsInt, IsOptional, IsString, Min, Max, IsIn, ArrayMinSize } from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * DTO for fetching products by multiple category IDs
 * 
 * @class GetProductsByCategoryIdsDto
 */
export class GetProductsByCategoryIdsDto {
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
    }
    return value;
  })
  @IsArray({ message: 'categoryIds must be an array of numbers' })
  @ArrayMinSize(1, { message: 'At least one category ID is required' })
  @IsInt({ each: true, message: 'Each category ID must be an integer' })
  categoryIds: number[];

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
  limit?: number = 20;

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
