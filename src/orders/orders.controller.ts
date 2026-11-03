// src/orders/orders.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  Get, 
  UseGuards 
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Param, Patch } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { Actor } from '../common/academy-scope';
import { Role } from 'src/generated/prisma/enums';

@Controller('orders')
@UseGuards(JwtAuthGuard) // Requires a valid JWT token for all routes
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // --- STUDENT ROUTES ---

  @Post()
  createOrder(
    @GetUser('id') userId: string, // Securely extracted from the token
    @Body() createOrderDto: CreateOrderDto
  ) {
    return this.ordersService.createOrder(userId, createOrderDto);
  }

  @Get('my-orders')
  getMyOrders(@GetUser('id') userId: string) {
    return this.ordersService.getMyOrders(userId);
  }

  // --- ADMIN ROUTES ---

  @Get('admin/all')
  @UseGuards(RolesGuard) // Enforces role-based access
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  getAllOrders(@GetUser() user: Actor) {
    return this.ordersService.getAllOrders(user);
  }

  // An admin confirms a cash or bank transfer payment (see markPaid)
  @Patch(':id/mark-paid')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  markPaid(@Param('id') id: string, @GetUser() user: Actor) {
    return this.ordersService.markPaid(id, user);
  }
}