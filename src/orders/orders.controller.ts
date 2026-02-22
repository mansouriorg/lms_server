// src/orders/orders.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  Get, 
  UseGuards 
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from 'generated/prisma/enums';

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
  getAllOrders() {
    return this.ordersService.getAllOrders();
  }
}