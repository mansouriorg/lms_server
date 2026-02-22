// src/orders/orders.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    // 1. Fetch all the bootcamps the user is trying to buy
    const stages = await this.prisma.stage.findMany({
      where: {
        id: { in: dto.stageIds },
      },
    });

    // 2. Verify all bootcamps actually exist
    if (stages.length !== dto.stageIds.length) {
      throw new NotFoundException("Un ou plusieurs bootcamps dans votre panier n'existent pas.");
    }

    // 3. Prevent duplicate purchases
    const existingBookings = await this.prisma.booking.findMany({
      where: {
        userId: userId,
        stageId: { in: dto.stageIds },
        status: 'PAID',
      },
    });

    if (existingBookings.length > 0) {
      throw new BadRequestException("Vous possédez déjà un ou plusieurs bootcamps de ce panier.");
    }

    // 4. Securely calculate the base total amount based on the database prices
    let totalAmount = stages.reduce((sum, stage) => sum + stage.price, 0);
    let appliedCouponId: string | null = null;

    // 5. Validate and apply the Coupon if provided
    if (dto.couponCode) {
      const coupon = await this.prisma.coupon.findUnique({
        where: { code: dto.couponCode },
      });

      if (!coupon) {
        throw new NotFoundException('Code promo invalide.');
      }
      if (!coupon.isActive) {
        throw new BadRequestException('Ce code promo est inactif.');
      }
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        throw new BadRequestException('Ce code promo a expiré.');
      }
      if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
        throw new BadRequestException("Ce code promo a atteint sa limite d'utilisation.");
      }

      // Apply the math
      if (coupon.discountPercentage) {
        totalAmount = totalAmount - (totalAmount * (coupon.discountPercentage / 100));
      } else if (coupon.discountAmount) {
        totalAmount = totalAmount - coupon.discountAmount;
      }

      // Ensure the price doesn't go below 0
      totalAmount = Math.max(0, totalAmount);
      appliedCouponId = coupon.id;
    }

    // 6. Create the Order and OrderItems in a single database transaction
    const order = await this.prisma.order.create({
      data: {
        userId: userId,
        totalAmount: totalAmount,
        status: 'PENDING',
        couponId: appliedCouponId, // Link the coupon to the order history
        items: {
          create: stages.map(stage => ({
            stageId: stage.id,
            price: stage.price, // Snapshot the base price at the time of purchase
          })),
        },
      },
      include: {
        items: {
          include: { stage: { select: { title: true } } }
        },
        coupon: { select: { code: true } } // Return the applied coupon code to the frontend
      }
    });

    // 7. If a coupon was successfully used, increment its usage count
    if (appliedCouponId) {
      await this.prisma.coupon.update({
        where: { id: appliedCouponId },
        data: { usedCount: { increment: 1 } },
      });
    }

    return { message: 'Commande créée avec succès.', order };
  }

  // Allow a student to view their purchase history
  async getMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId: userId },
      include: {
        items: {
          include: {
            stage: { select: { title: true, price: true } }
          }
        },
        coupon: { 
          select: { code: true, discountPercentage: true, discountAmount: true } 
        }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin endpoint to view all orders on the platform
  async getAllOrders() {
    return this.prisma.order.findMany({
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        items: { include: { stage: { select: { title: true } } } },
        coupon: { select: { code: true } }
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}