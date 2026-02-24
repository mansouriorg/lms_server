// src/centers/centers.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { Role } from 'src/generated/prisma/enums';
import { CentersService } from './centers.service';
import { CreateCenterDto } from './dto/create-center.dto';
import { UpdateCenterDto } from './dto/update-center.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('centers')
@UseGuards(JwtAuthGuard) // Requires login globally
export class CentersController {
  constructor(private readonly centersService: CentersService) {}

  // --- ADMIN ONLY ROUTES ---

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTER_ADMIN)
  create(@Body() createCenterDto: CreateCenterDto) {
    return this.centersService.create(createCenterDto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTER_ADMIN)
  update(@Param('id') id: string, @Body() updateCenterDto: UpdateCenterDto) {
    return this.centersService.update(id, updateCenterDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN) // Perhaps only a Super Admin should delete a whole center
  remove(@Param('id') id: string) {
    return this.centersService.remove(id);
  }

  // --- GENERAL AUTHENTICATED ROUTES ---

  @Get()
  findAll() {
    return this.centersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.centersService.findOne(id);
  }
}