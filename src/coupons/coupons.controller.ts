// src/coupons/coupons.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  UseGuards 
} from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'generated/prisma/enums';

@Controller('coupons')
@UseGuards(JwtAuthGuard, RolesGuard) // Secures the entire controller
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  // Create a new discount code
  @Post()
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  create(@Body() createCouponDto: CreateCouponDto) {
    return this.couponsService.create(createCouponDto);
  }

  // View all coupons and their usage stats
  @Get()
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  findAll() {
    return this.couponsService.findAll();
  }

  // Quickly pause or unpause a coupon
  @Patch(':id/toggle')
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  toggleStatus(@Param('id') id: string) {
    return this.couponsService.toggleStatus(id);
  }
}