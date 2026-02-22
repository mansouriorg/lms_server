// src/products/products.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards 
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from 'generated/prisma/enums';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // --- STUDENT CATALOG ROUTES ---

  // Anyone logged in can view the active store catalog
  @Get()
  @UseGuards(JwtAuthGuard)
  findAllActive() {
    return this.productsService.findAll(false);
  }

  // Anyone logged in can view a specific product's details
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  // --- ADMIN MANAGEMENT ROUTES ---

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  findAllForAdmin() {
    return this.productsService.findAll(true); // Fetches inactive products too
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  toggleStatus(@Param('id') id: string) {
    return this.productsService.toggleStatus(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}