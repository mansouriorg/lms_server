// src/stages/stages.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { Role } from 'src/generated/prisma/enums';
import { StagesService } from './stages.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto'; // <-- Added this import
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('stages')
@UseGuards(JwtAuthGuard) // 1. REQUIREMENT: Must be logged in to access ANYTHING in this controller
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  // --- ADMIN ONLY ROUTES ---
  
  @Post()
  @UseGuards(RolesGuard) // 2. REQUIREMENT: Must pass the roles check
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN) // 3. REQUIREMENT: Must be an Admin
  create(@Body() createStageDto: CreateStageDto) {
    return this.stagesService.create(createStageDto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN) // Only Admins can update
  update(@Param('id') id: string, @Body() updateStageDto: UpdateStageDto) {
    return this.stagesService.update(id, updateStageDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN) // Only Admins can delete
  remove(@Param('id') id: string) {
    return this.stagesService.remove(id);
  }

  // --- GENERAL AUTHENTICATED ROUTES (Students & Admins) ---

  @Get()
  // No RolesGuard here, so standard STUDENT tokens are allowed
  findAll() {
    return this.stagesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stagesService.findOne(id);
  }
}