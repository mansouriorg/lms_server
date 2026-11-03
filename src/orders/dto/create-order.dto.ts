// src/orders/dto/create-order.dto.ts
import { IsArray, IsOptional, IsString } from 'class-validator';

// A cart holds courses, digital products, or both. The service refuses a
// cart with neither ("Your cart is empty.").
export class CreateOrderDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'Every course ID must be a string.' })
  stageIds?: string[]; // The courses (stages) to buy

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[]; // The digital products to buy

  @IsOptional()
  @IsString()
  couponCode?: string; // Optional discount code, in any letter case
}
