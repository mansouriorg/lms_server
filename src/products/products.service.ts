// src/products/products.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // Create a new digital product (Admin only)
  async create(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: {
        title: dto.title,
        description: dto.description,
        price: dto.price,
        fileUrl: dto.fileUrl,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    return { message: 'Produit numérique créé avec succès.', product };
  }

  // Fetch the catalog. 
  // If isAdmin is true, it returns everything. If false, it only returns active products.
  async findAll(isAdmin: boolean = false) {
    return this.prisma.product.findMany({
      where: isAdmin ? {} : { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Fetch a single product
  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    
    if (!product) {
      throw new NotFoundException('Produit introuvable.');
    }
    
    return product;
  }

  // Quickly pause or unpause a product from the storefront
  async toggleStatus(id: string) {
    const product = await this.findOne(id); // Ensures it exists first
    
    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: { isActive: !product.isActive },
    });

    const statusMsg = updatedProduct.isActive ? 'visible' : 'masqué';
    return { message: `Le produit est maintenant ${statusMsg}.`, product: updatedProduct };
  }

  // Permanently delete a product
  async remove(id: string) {
    await this.findOne(id); // Ensures it exists first
    
    await this.prisma.product.delete({ where: { id } });
    return { message: 'Produit supprimé avec succès.' };
  }
}