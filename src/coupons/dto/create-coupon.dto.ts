// src/coupons/dto/create-coupon.dto.ts
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

// "  summer-20 " -> "SUMMER-20": codes are stored in capitals, and students
// can type them in any letter case.
const codeText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

// POST /coupons: a discount code. Either a percentage or a fixed amount in
// TND (the service refuses both or neither), an optional limit of uses, and
// an optional end (expiresAt, not in the past).
export class CreateCouponDto {
  @IsString()
  @Transform(codeText)
  @Matches(/^[A-Z0-9_-]{3,30}$/, {
    message:
      'The coupon code must have 3 to 30 letters, digits, - or _ (for example SUMMER20).',
  })
  code: string;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'The percentage must be a number, like 20.' },
  )
  @Min(1, { message: 'The percentage must be between 1 and 100.' })
  @Max(100, { message: 'The percentage must be between 1 and 100.' })
  discountPercentage?: number;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'The amount must be a number in TND, like 15 or 7.500.' },
  )
  @Min(1, { message: 'The amount must be at least 1 TND.' })
  discountAmount?: number;

  @IsOptional()
  @IsInt({ message: 'The limit of uses must be a whole number.' })
  @Min(1, { message: 'The limit of uses must be at least 1.' })
  @Max(1000000, { message: 'The limit of uses is too high.' })
  maxUses?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Please enter a valid date (ISO 8601).' })
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
