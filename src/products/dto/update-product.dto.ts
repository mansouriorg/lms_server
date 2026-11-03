// src/products/dto/update-product.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';

// PATCH /products/:id: any field of a product, with the same checks as
// POST /products. The fields that are not sent stay as they are.
export class UpdateProductDto extends PartialType(CreateProductDto) {}
