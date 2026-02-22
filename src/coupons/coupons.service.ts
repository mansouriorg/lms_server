// src/coupons/coupons.service.ts
import { 
  Injectable, 
  ConflictException, 
  NotFoundException, 
  BadRequestException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCouponDto) {
    // 1. Validate the math logic
    if (!dto.discountPercentage && !dto.discountAmount) {
      throw new BadRequestException('Vous devez spécifier soit un pourcentage, soit un montant de réduction.');
    }
    if (dto.discountPercentage && dto.discountAmount) {
      throw new BadRequestException('Vous ne pouvez pas combiner un pourcentage et un montant fixe sur le même code.');
    }

    // 2. Check if the code already exists
    const normalizedCode = dto.code.toUpperCase().trim();
    const existing = await this.prisma.coupon.findUnique({ 
      where: { code: normalizedCode } 
    });
    
    if (existing) {
      throw new ConflictException('Ce code promo existe déjà.');
    }

    // 3. Create the coupon
    const coupon = await this.prisma.coupon.create({
      data: {
        code: normalizedCode, // Always store as uppercase so users don't have to worry about case-sensitivity
        discountPercentage: dto.discountPercentage,
        discountAmount: dto.discountAmount,
        maxUses: dto.maxUses,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    return { message: 'Code promo créé avec succès.', coupon };
  }

  // Fetch all coupons for the admin dashboard
  async findAll() {
    return this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { orders: true } // Let the admin see exactly how many orders used this coupon
        }
      }
    });
  }

  // Quickly pause or unpause a marketing campaign
  async toggleStatus(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    
    if (!coupon) {
      throw new NotFoundException('Code promo introuvable.');
    }

    const updatedCoupon = await this.prisma.coupon.update({
      where: { id },
      data: { isActive: !coupon.isActive }
    });

    const statusMsg = updatedCoupon.isActive ? 'activé' : 'désactivé';
    return { message: `Code promo ${statusMsg} avec succès.`, coupon: updatedCoupon };
  }
}