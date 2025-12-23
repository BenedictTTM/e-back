import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProductDto {
  @IsString({ message: 'Title must be a string' })
  @IsOptional()
  title?: string;

  @IsString({ message: 'Description must be a string' })
  @IsOptional()
  description?: string;

  @IsOptional()
  @IsArray()
  imageUrl?: string[];

  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: 'Original price must be a number' })
  @IsOptional()
  originalPrice?: number;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: 'Discounted price must be a number' })
  @IsOptional()
  discountedPrice?: number;

  @Transform(({ value }) => parseFloat(value))
  @IsOptional()
  @IsNumber({}, { message: 'Rating must be a number' })
  rating?: number;

  @Transform(({ value }) => parseFloat(value))
  @IsOptional()
  @IsNumber({}, { message: 'Views must be a number' })
  views?: number;

  @IsString({ message: 'Category must be a string' })
  @IsOptional()
  category?: string;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber({}, { message: 'Stock must be a number' })
  @IsOptional()
  stock?: number;

  @IsNumber()
  @IsOptional()
  locationLat?: number;

  @IsNumber()
  @IsOptional()
  locationLng?: number;

  @IsArray()
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsOptional()
  condition?: string;
}
