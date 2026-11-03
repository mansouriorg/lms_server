import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, academyScope } from '../common/academy-scope';
import { CreateOrderDto } from './dto/create-order.dto';
import { couponAppliesTo, couponDiscount, PricedItem } from './coupon-discount';
import { roundMillimes } from '../common/money';
import {
  CLOSED_FOR_ORDERS,
  HIDDEN_FROM_STUDENTS,
} from '../common/course-access';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    let totalAmount = 0;
    
    // Explicitly telling TypeScript what this array will hold
    const orderItemsData: { price: number; stageId?: string; productId?: string }[] = []; 

    // Ensure the cart isn't completely empty
    if ((!dto.stageIds || dto.stageIds.length === 0) && (!dto.productIds || dto.productIds.length === 0)) {
      throw new BadRequestException('Your cart is empty.');
    }

    // Every item's academy and price, so academy coupons only discount
    // their own academy's items
    const pricedItems: PricedItem[] = [];

    // --- 1. PROCESS COURSES (STAGES) ---
    if (dto.stageIds && dto.stageIds.length > 0) {
      // Draft and cancelled courses cannot be ordered: students never see them
      const stages = await this.prisma.stage.findMany({
        where: {
          id: { in: dto.stageIds },
          status: { notIn: HIDDEN_FROM_STUDENTS },
        },
      });
      if (stages.length !== dto.stageIds.length) {
        throw new NotFoundException("One or more courses do not exist.");
      }

      // Full and finished courses stay in the catalog, closed to new orders
      const closed = stages.find((stage) =>
        CLOSED_FOR_ORDERS.includes(stage.status),
      );
      if (closed !== undefined) {
        throw new ConflictException(
          `${closed.title} is ${closed.status === 'FULL' ? 'full' : 'finished'}: it cannot be ordered anymore.`,
        );
      }

      // PREVENT DUPLICATE COURSE PURCHASES
      // Updated: We now check OrderItems instead of Bookings, since Bookings are for 1-on-1s now.
      const existingCourseOrders = await this.prisma.orderItem.findMany({
        where: { 
          order: { userId: userId, status: 'PAID' },
          stageId: { in: dto.stageIds } 
        },
      });
      if (existingCourseOrders.length > 0) {
        throw new BadRequestException("You already own one or more courses in this cart.");
      }

      // One order per course at a time: two orders waiting for payment for
      // the same course could both be marked as paid.
      const pendingCourseOrders = await this.prisma.orderItem.findMany({
        where: {
          order: { userId: userId, status: 'PENDING' },
          stageId: { in: dto.stageIds },
        },
      });
      if (pendingCourseOrders.length > 0) {
        throw new ConflictException(
          'An order for this course is already waiting for payment. See your purchases.',
        );
      }

      stages.forEach(stage => {
        totalAmount += stage.price;
        orderItemsData.push({ stageId: stage.id, price: stage.price });
        pricedItems.push({ centerId: stage.centerId, price: stage.price });
      });
    }

    // --- 2. PROCESS DIGITAL PRODUCTS ---
    if (dto.productIds && dto.productIds.length > 0) {
      const products = await this.prisma.product.findMany({ 
        where: { id: { in: dto.productIds }, isActive: true } 
      });
      if (products.length !== dto.productIds.length) {
        throw new NotFoundException("One or more digital products do not exist or are not available.");
      }

      // Prevent buying the same digital download twice
      const existingProductOrders = await this.prisma.orderItem.findMany({
        where: {
          order: { userId, status: 'PAID' },
          productId: { in: dto.productIds }
        }
      });
      if (existingProductOrders.length > 0) {
        throw new BadRequestException("You already own one or more digital products in this cart.");
      }

      // Same rule for digital products
      const pendingProductOrders = await this.prisma.orderItem.findMany({
        where: {
          order: { userId, status: 'PENDING' },
          productId: { in: dto.productIds },
        },
      });
      if (pendingProductOrders.length > 0) {
        throw new ConflictException(
          'An order for this product is already waiting for payment. See your purchases.',
        );
      }

      products.forEach(product => {
        totalAmount += product.price;
        orderItemsData.push({ productId: product.id, price: product.price });
        pricedItems.push({ centerId: product.centerId, price: product.price });
      });
    }

    // --- 3. APPLY COUPONS ---
    let appliedCouponId: string | null = null;

    if (dto.couponCode) {
      // Codes are stored in capitals (see CouponsService.create)
      const code = dto.couponCode.trim().toUpperCase();
      const coupon = await this.prisma.coupon.findUnique({ where: { code } });

      if (!coupon) throw new NotFoundException('This coupon code is not valid.');
      if (!coupon.isActive) throw new BadRequestException('This coupon is not active.');
      if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new BadRequestException('This coupon has expired.');
      if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new BadRequestException("This coupon has reached its usage limit.");

      // Calculate the discount. An academy coupon only discounts that
      // academy's items; a platform-wide coupon discounts the whole cart.
      const eligibleItems = pricedItems.filter((item) =>
        couponAppliesTo(coupon, item),
      );
      if (eligibleItems.length === 0) {
        throw new BadRequestException(
          'This code is not valid for the items in your cart.',
        );
      }
      totalAmount -= couponDiscount(coupon, pricedItems);

      totalAmount = Math.max(0, totalAmount);
      appliedCouponId = coupon.id;
    }

    // --- 4. CREATE THE TRANSACTION ---
    const order = await this.prisma.order.create({
      data: {
        userId: userId,
        // In whole millimes, like every price (see common/money.ts)
        totalAmount: roundMillimes(totalAmount),
        status: 'PENDING', // Will be set to PAID after Stripe/payment gateway success
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

    // The coupon use is counted when the order is paid (see markPaid), so
    // orders that are never paid do not use up a limited coupon.

    return { message: 'Order created.', order };
  }

  // Manual payment: an admin confirms that a PENDING order was paid (cash or
  // bank transfer). This unlocks its courses and download links, and counts
  // the coupon use. A center admin may only confirm an order whose items all
  // belong to their academy; a super admin may confirm any order.
  async markPaid(orderId: string, actor: Actor) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          select: {
            stage: { select: { centerId: true } },
            product: { select: { centerId: true } },
          },
        },
      },
    });
    if (order === null) {
      throw new NotFoundException('Order not found.');
    }

    const scope = await academyScope(this.prisma, actor);
    if (scope.all === false) {
      const academies = order.items.map(
        (item) => item.stage?.centerId ?? item.product?.centerId ?? null,
      );
      if (academies.some((centerId) => centerId !== scope.centerId)) {
        throw new ForbiddenException(
          'Only a super admin can confirm an order with items from other academies.',
        );
      }
    }

    if (order.status === 'PAID') {
      throw new ConflictException('This order is already paid.');
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        'Only a pending order can be marked as paid.',
      );
    }

    // One transaction: the order only becomes PAID once, even if two admins
    // confirm it at the same time, and the coupon use is counted with it.
    const paidOrder = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'PAID' },
      });
      if (count === 0) {
        throw new ConflictException('This order is already paid.');
      }
      if (order.couponId) {
        await tx.coupon.update({
          where: { id: order.couponId },
          data: { usedCount: { increment: 1 } },
        });
      }
      return tx.order.findUnique({ where: { id: orderId } });
    });

    return { message: 'Order marked as paid.', order: paidOrder };
  }

  // Allow a student to view their purchase history and download links.
  // A download link (fileUrl) is only sent for PAID orders: an order starts
  // as PENDING before any payment, so a link there would be a free download.
  async getMyOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
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

    return orders.map((order) =>
      order.status === 'PAID'
        ? order
        : {
            ...order,
            items: order.items.map((item) => ({
              ...item,
              product: item.product && { ...item.product, fileUrl: null },
            })),
          },
    );
  }

  // Admin endpoint to view all orders on the platform
  // Super admins see every order; center admins only see orders that contain
  // one of their academy's courses or products.
  async getAllOrders(actor: Actor) {
    const scope = await academyScope(this.prisma, actor);
    return this.prisma.order.findMany({
      where: scope.all
        ? {}
        : {
            items: {
              some: {
                OR: [
                  { stage: { centerId: scope.centerId } },
                  { product: { centerId: scope.centerId } },
                ],
              },
            },
          },
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