// src/orders/dto/create-order.dto.ts
import { IsArray, IsString, ArrayNotEmpty, IsOptional } from 'class-validator';

export class CreateOrderDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Votre panier est vide.' })
  @IsString({ each: true, message: 'Chaque ID de bootcamp doit être une chaîne de caractères.' })
  stageIds: string[]; // An array of Bootcamp IDs they want to buy

  @IsOptional()
  @IsString()
  couponCode?: string; // <-- NEW: Optional discount code from the user
}