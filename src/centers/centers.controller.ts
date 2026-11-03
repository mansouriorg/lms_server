// src/centers/centers.controller.ts
// Academies. Anyone may read them, like the course catalog; only super
// admins create or delete one and choose its admins, and a center admin
// edits only their own.
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from 'src/generated/prisma/enums';
import { CentersService } from './centers.service';
import { CreateCenterDto } from './dto/create-center.dto';
import { AddAcademyAdminDto } from './dto/add-academy-admin.dto';
import { UpdateCenterDto } from './dto/update-center.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { Actor } from '../common/academy-scope';
import type { CourseViewer } from '../common/course-access';

@Controller('centers')
export class CentersController {
  constructor(private readonly centersService: CentersService) {}

  // --- ADMIN ROUTES: a valid token (JwtAuthGuard), then an admin role ---

  // A new academy: super admins only. An academy admin account is linked to
  // one academy; an academy created by a center admin had no admin at all.
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  create(@Body() createCenterDto: CreateCenterDto) {
    return this.centersService.create(createCenterDto);
  }

  // A center admin edits only their own academy (checked in the service)
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CENTER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateCenterDto: UpdateCenterDto,
    @GetUser() user: Actor,
  ) {
    return this.centersService.update(id, updateCenterDto, user);
  }

  // Super admins only, and only an academy without courses, digital
  // products or coupons (409 otherwise)
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.centersService.remove(id);
  }

  // The Academies page of platform admins: every academy with its admins
  @Get('admin/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  overview() {
    return this.centersService.overview();
  }

  // An existing account (by email) becomes an admin of the academy
  @Post(':id/admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  addAdmin(@Param('id') id: string, @Body() dto: AddAcademyAdminDto) {
    return this.centersService.addAdmin(id, dto.email);
  }

  // The account stops being an admin of the academy (a student again)
  @Delete(':id/admins/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  removeAdmin(@Param('id') id: string, @Param('userId') userId: string) {
    return this.centersService.removeAdmin(id, userId);
  }

  // --- PUBLIC ROUTES: visitors too (user is null without a valid token) ---

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll() {
    return this.centersService.findAll();
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param('id') id: string, @GetUser() user: CourseViewer | null) {
    // Visitors and students do not see the academy's draft courses
    return this.centersService.findOne(id, user);
  }
}
