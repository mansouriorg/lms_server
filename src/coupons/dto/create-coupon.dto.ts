import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, IsDateString, IsBoolean } from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty({ message: 'Le code promo est requis (ex: BLACKFRIDAY20).' })
  code: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  discountPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Veuillez fournir une date valide (ISO 8601).' })
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}