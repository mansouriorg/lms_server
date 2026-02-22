// src/orders/orders.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    let totalAmount = 0;
    
    // Explicitly telling TypeScript what this array will hold
    const orderItemsData: { price: number; stageId?: string; productId?: string }[] = []; 

    // Ensure the cart isn't completely empty
    if ((!dto.stageIds || dto.stageIds.length === 0) && (!dto.productIds || dto.productIds.length === 0)) {
      throw new BadRequestException('Votre panier est vide.');
    }

    // --- 1. PROCESS BOOTCAMPS (STAGES) ---
    if (dto.stageIds && dto.stageIds.length > 0) {
      const stages = await this.prisma.stage.findMany({ where: { id: { in: dto.stageIds } } });
      if (stages.length !== dto.stageIds.length) {
        throw new NotFoundException("Un ou plusieurs bootcamps n'existent pas.");
      }

      // Prevent duplicate bootcamp purchases
      const existingBookings = await this.prisma.booking.findMany({
        where: { userId, stageId: { in: dto.stageIds }, status: 'PAID' },
      });
      if (existingBookings.length > 0) {
        throw new BadRequestException("Vous possédez déjà un ou plusieurs bootcamps de ce panier.");
      }

      stages.forEach(stage => {
        totalAmount += stage.price;
        orderItemsData.push({ stageId: stage.id, price: stage.price });
      });
    }

    // --- 2. PROCESS DIGITAL PRODUCTS ---
    if (dto.productIds && dto.productIds.length > 0) {
      const products = await this.prisma.product.findMany({ 
        where: { id: { in: dto.productIds }, isActive: true } 
      });
      if (products.length !== dto.productIds.length) {
        throw new NotFoundException("Un ou plusieurs produits numériques n'existent pas ou sont inactifs.");
      }

      // Prevent buying the same digital download twice
      const existingOrders = await this.prisma.orderItem.findMany({
        where: {
          order: { userId, status: 'PAID' },
          productId: { in: dto.productIds }
        }
      });
      if (existingOrders.length > 0) {
        throw new BadRequestException("Vous possédez déjà un ou plusieurs produits numériques de ce panier.");
      }

      products.forEach(product => {
        totalAmount += product.price;
        orderItemsData.push({ productId: product.id, price: product.price });
      });
    }

    // --- 3. APPLY COUPONS ---
    let appliedCouponId: string | null = null;

    if (dto.couponCode) {
      const coupon = await this.prisma.coupon.findUnique({ where: { code: dto.couponCode } });

      if (!coupon) throw new NotFoundException('Code promo invalide.');
      if (!coupon.isActive) throw new BadRequestException('Ce code promo est inactif.');
      if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new BadRequestException('Ce code promo a expiré.');
      if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new BadRequestException("Ce code promo a atteint sa limite d'utilisation.");

      // Calculate the discount
      if (coupon.discountPercentage) {
        totalAmount -= totalAmount * (coupon.discountPercentage / 100);
      } else if (coupon.discountAmount) {
        totalAmount -= coupon.discountAmount;
      }

      totalAmount = Math.max(0, totalAmount);
      appliedCouponId = coupon.id;
    }

    // --- 4. CREATE THE TRANSACTION ---
    const order = await this.prisma.order.create({
      data: {
        userId: userId,
        totalAmount: totalAmount,
        status: 'PENDING',
        couponId: appliedCouponId,
        items: {
          create: orderItemsData, // Injects the mixed array of Stages and Products
        },
      },
      include: {
        items: {
          include: { 
            stage: { select: { title: true } },
            product: { select: { title: true } } // Includes product titles in the response
          }
        },
        coupon: { select: { code: true } }
      }
    });

    if (appliedCouponId) {
      await this.prisma.coupon.update({
        where: { id: appliedCouponId },
        data: { usedCount: { increment: 1 } },
      });
    }

    return { message: 'Commande créée avec succès.', order };
  }

  // Allow a student to view their purchase history and download links
  async getMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId: userId },
      include: {
        items: {
          include: {
            stage: { select: { title: true, price: true } },
            product: { select: { title: true, price: true, fileUrl: true } } // The student needs to see their download link!
          }
        },
        coupon: { select: { code: true, discountPercentage: true, discountAmount: true } }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin endpoint to view all orders on the platform
  async getAllOrders() {
    return this.prisma.order.findMany({
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        items: { 
          include: { 
            stage: { select: { title: true } },
            product: { select: { title: true } }
          } 
        },
        coupon: { select: { code: true } }
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}