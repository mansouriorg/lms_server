// src/coupons/coupons.service.ts
import { 
  Injectable, 
  ConflictException, 
  NotFoundException, 
  BadRequestException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Actor,
  academyScope,
  assertManagesAcademy,
} from '../common/academy-scope';
import { CreateCouponDto } from './dto/create-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  // A center admin's coupon belongs to their academy (and only discounts its
  // items); a super admin's coupon is platform-wide.
  async create(dto: CreateCouponDto, actor: Actor) {
    const scope = await academyScope(this.prisma, actor);
    // 1. Validate the math logic
    if (!dto.discountPercentage && !dto.discountAmount) {
      throw new BadRequestException('Set either a percentage or a fixed discount amount.');
    }
    if (dto.discountPercentage && dto.discountAmount) {
      throw new BadRequestException('A coupon cannot have both a percentage and a fixed amount.');
    }
    // The end date is the last moment the coupon works: it cannot be past
    if (dto.expiresAt && new Date(dto.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException(
        'The end date of the coupon is already past.',
      );
    }

    // 2. Check if the code already exists
    const normalizedCode = dto.code.toUpperCase().trim();
    const existing = await this.prisma.coupon.findUnique({ 
      where: { code: normalizedCode } 
    });
    
    if (existing) {
      throw new ConflictException('This coupon code already exists.');
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
        centerId: scope.all ? null : scope.centerId,
      },
    });

    return { message: 'Coupon created.', coupon };
  }

  // Fetch all coupons for the admin dashboard
  async findAll(actor: Actor) {
    const scope = await academyScope(this.prisma, actor);
    return this.prisma.coupon.findMany({
      where: scope.all ? {} : { centerId: scope.centerId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { orders: true } // Let the admin see exactly how many orders used this coupon
        }
      }
    });
  }

  // Quickly pause or unpause a marketing campaign
  async toggleStatus(id: string, actor: Actor) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    
    if (!coupon) {
      throw new NotFoundException('Coupon not found.');
    }

    // Center admins: only their own academy's coupons (platform-wide ones
    // are for super admins)
    await assertManagesAcademy(this.prisma, actor, coupon.centerId);

    const updatedCoupon = await this.prisma.coupon.update({
      where: { id },
      data: { isActive: !coupon.isActive }
    });

    const statusMsg = updatedCoupon.isActive ? 'activated' : 'deactivated';
    return { message: `Coupon ${statusMsg}.`, coupon: updatedCoupon };
  }

  // Delete a coupon that no order used. Once an order used it, the order
  // keeps its discount and its history, so the coupon can only be paused.
  async remove(id: string, actor: Actor) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (coupon === null) {
      throw new NotFoundException('Coupon not found.');
    }
    await assertManagesAcademy(this.prisma, actor, coupon.centerId);

    if (coupon._count.orders > 0) {
      throw new ConflictException(
        'This coupon was used in an order, so it cannot be deleted: the order keeps its discount. Pause it instead.',
      );
    }
    await this.prisma.coupon.delete({ where: { id } });
    return { message: 'Coupon deleted.' };
  }
}