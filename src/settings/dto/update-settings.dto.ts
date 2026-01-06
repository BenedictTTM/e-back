
import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
    @IsString()
    @IsOptional()
    topic?: string;

    @IsString()
    @IsOptional()
    callNumber?: string;

    @IsString()
    @IsOptional()
    discountPercentage?: string;

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}
