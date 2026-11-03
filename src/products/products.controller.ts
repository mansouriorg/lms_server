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
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { Actor } from '../common/academy-scope';
import { Role } from 'src/generated/prisma/enums';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // --- STUDENT CATALOG ROUTES ---

  // The store: anyone, signed in or not, sees the visible products and their
  // academy (never the download links)
  @Get()
  findAllActive() {
    return this.productsService.findAll(false);
  }

  // A product page: anyone, signed in or not (404 for a hidden product)
  @Get(':id')
  findOne(@Param('id') id: string) {
    // Active products only, without the paid download link.
    return this.productsService.findOnePublic(id);
  }

  // --- ADMIN MANAGEMENT ROUTES ---

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  create(@Body() createProductDto: CreateProductDto, @GetUser() user: Actor) {
    return this.productsService.create(createProductDto, user);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  findAllForAdmin(@GetUser() user: Actor) {
    // Inactive products too, but only the admin's own academy
    return this.productsService.findAllForAdmin(user);
  }

  // Edit a product: its title, description, price, file link or visibility
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @GetUser() user: Actor,
  ) {
    return this.productsService.update(id, updateProductDto, user);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  toggleStatus(@Param('id') id: string, @GetUser() user: Actor) {
    return this.productsService.toggleStatus(id, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  remove(@Param('id') id: string, @GetUser() user: Actor) {
    return this.productsService.remove(id, user);
  }
}