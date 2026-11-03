// src/products/products.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Actor,
  academyScope,
  assertManagesAcademy,
} from '../common/academy-scope';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

// What the store shows of a product's academy: its name and how to reach it
// to pay (the same details as its public page, /centers/:id).
const STORE_ACADEMY = {
  select: {
    id: true,
    name: true,
    location: true,
    contactEmail: true,
    contactPhone: true,
  },
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // Create a new digital product (Admin only). A center admin's product
  // belongs to their academy; a super admin's product is platform-wide.
  async create(dto: CreateProductDto, actor: Actor) {
    const scope = await academyScope(this.prisma, actor);
    const product = await this.prisma.product.create({
      data: {
        title: dto.title,
        description: dto.description,
        price: dto.price,
        fileUrl: dto.fileUrl,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        centerId: scope.all ? null : scope.centerId,
      },
    });

    return { message: 'Digital product created.', product };
  }

  // Fetch the catalog. 
  // If isAdmin is true, it returns everything. If false, it only returns active products.
  async findAll(isAdmin: boolean = false) {
    if (isAdmin) {
      return this.prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
    }

    // The store never sends fileUrl (the paid download link). Buyers get it
    // with their paid orders (GET /orders/my-orders).
    return this.prisma.product.findMany({
      where: { isActive: true },
      omit: { fileUrl: true },
      include: { center: STORE_ACADEMY },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Fetch a single product
  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    
    return product;
  }

  // Admin catalog (GET /products/admin/all), with the download links: every
  // product for a super admin, only their academy's for a center admin.
  async findAllForAdmin(actor: Actor) {
    const scope = await academyScope(this.prisma, actor);
    return this.prisma.product.findMany({
      where: scope.all ? {} : { centerId: scope.centerId },
      // How many times each product was ordered: an ordered product can be
      // hidden, not deleted (see remove)
      include: { _count: { select: { orderItems: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Fetch a single product for the store page: active products only, and
  // never the paid download link. The admin actions below use findOne.
  async findOnePublic(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, isActive: true },
      omit: { fileUrl: true },
      include: { center: STORE_ACADEMY },
    });

    if (product === null) {
      throw new NotFoundException('Product not found.');
    }

    return product;
  }

  // Edit a product (PATCH /products/:id): only the fields sent change. A new
  // file link also reaches the students who already bought it; a new price
  // only applies to new orders (each order keeps the price that was paid).
  async update(id: string, dto: UpdateProductDto, actor: Actor) {
    const product = await this.findOne(id); // Ensures it exists first
    await assertManagesAcademy(this.prisma, actor, product.centerId);

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        price: dto.price,
        fileUrl: dto.fileUrl,
        isActive: dto.isActive,
      },
    });
    return { message: 'Product saved.', product: updated };
  }

  // Quickly pause or unpause a product from the storefront
  async toggleStatus(id: string, actor: Actor) {
    const product = await this.findOne(id); // Ensures it exists first
    await assertManagesAcademy(this.prisma, actor, product.centerId);
    
    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: { isActive: !product.isActive },
    });

    const statusMsg = updatedProduct.isActive ? 'visible' : 'hidden';
    return { message: `The product is now ${statusMsg}.`, product: updatedProduct };
  }

  // Permanently delete a product that nobody ordered. Once it was ordered,
  // deleting it would break its buyers' download links (and their order
  // history), so it can only be hidden from the store (toggleStatus above):
  // buyers keep their link, and nobody new can buy it.
  async remove(id: string, actor: Actor) {
    const product = await this.findOne(id); // Ensures it exists first
    await assertManagesAcademy(this.prisma, actor, product.centerId);

    const orderCount = await this.prisma.orderItem.count({
      where: { productId: id },
    });
    if (orderCount > 0) {
      throw new ConflictException(
        'This product was ordered, so it cannot be deleted: its buyers would lose their download link. Hide it from the store instead.',
      );
    }

    await this.prisma.product.delete({ where: { id } });
    return { message: 'Product deleted.' };
  }
}