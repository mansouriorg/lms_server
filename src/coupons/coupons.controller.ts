// src/coupons/coupons.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { Actor } from '../common/academy-scope';
import { Role } from 'src/generated/prisma/enums';

@Controller('coupons')
@UseGuards(JwtAuthGuard, RolesGuard) // Secures the entire controller
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  // Create a new discount code
  @Post()
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  create(@Body() createCouponDto: CreateCouponDto, @GetUser() user: Actor) {
    return this.couponsService.create(createCouponDto, user);
  }

  // View all coupons and their usage stats
  @Get()
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  findAll(@GetUser() user: Actor) {
    return this.couponsService.findAll(user);
  }

  // Quickly pause or unpause a coupon
  @Patch(':id/toggle')
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  toggleStatus(@Param('id') id: string, @GetUser() user: Actor) {
    return this.couponsService.toggleStatus(id, user);
  }

  // Delete a coupon that no order used (409 for a used one: pause it)
  @Delete(':id')
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  remove(@Param('id') id: string, @GetUser() user: Actor) {
    return this.couponsService.remove(id, user);
  }
}