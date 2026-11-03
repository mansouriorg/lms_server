// src/products/dto/create-product.dto.ts
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { trimText, withoutHtml } from '../../common/text';

// POST /products: a digital product (a PDF, a ZIP, a code repository...).
// Texts are stored without HTML; the price is in TND, with at most 3
// decimals (the millimes); the file link is a web address (http or https).
export class CreateProductDto {
  @IsString()
  @Transform(withoutHtml)
  @IsNotEmpty({ message: 'The product title is required.' })
  @MaxLength(120, { message: 'The title can have at most 120 characters.' })
  title: string;

  @IsOptional()
  @IsString()
  @Transform(withoutHtml)
  @MaxLength(2000, {
    message: 'The description can have at most 2000 characters.',
  })
  description?: string;

  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'The price must be a number, like 25 or 12.500.' },
  )
  @Min(0, { message: 'The price cannot be negative.' })
  price: number;

  @IsString()
  @Transform(trimText)
  @IsNotEmpty({ message: 'Please enter the link to the file.' })
  @MaxLength(1000, { message: 'The link can have at most 1000 characters.' })
  @IsUrl(
    { protocols: ['http', 'https'] },
    {
      message:
        'Please enter a valid link to the file (AWS S3, Google Drive, etc.).',
    },
  )
  fileUrl: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
