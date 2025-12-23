import { IsArray, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Min, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateOrderDto {
  // For backward compatibility single-item
  @IsInt()
  @IsPositive()
  @IsOptional()
  productId?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  // Multi-item support
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @IsOptional()
  @ArrayMinSize(1)
  items?: CreateOrderItemDto[];

  @IsString()
  @IsNotEmpty()
  whatsappNumber: string;

  @IsString()
  @IsNotEmpty()
  callNumber: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  message?: string;
}
