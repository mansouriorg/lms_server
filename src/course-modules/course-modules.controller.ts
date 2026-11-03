// src/course-modules/course-modules.controller.ts
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from 'src/generated/prisma/enums';
import { CourseModulesService } from './course-modules.service';
import { CreateCourseModuleDto } from './dto/create-course-module.dto';
import { UpdateCourseModuleDto } from './dto/update-course-module.dto';
import { MoveDto } from '../common/dto/move.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { Actor } from '../common/academy-scope';

// The modules of a course, for its editor (/center/stages/[id]). Every route:
// a valid token, an admin role, and a course of the admin's own academy
// (checked by the service). Students read modules with the course
// (GET /stages/:id).
@Controller('modules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
export class CourseModulesController {
  constructor(private readonly courseModulesService: CourseModulesService) {}

  @Post()
  create(@Body() dto: CreateCourseModuleDto, @GetUser() user: Actor) {
    return this.courseModulesService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseModuleDto,
    @GetUser() user: Actor,
  ) {
    return this.courseModulesService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: Actor) {
    return this.courseModulesService.remove(id, user);
  }

  // One place up or down: { "direction": "up" } or { "direction": "down" }
  @Post(':id/move')
  @HttpCode(200)
  move(@Param('id') id: string, @Body() dto: MoveDto, @GetUser() user: Actor) {
    return this.courseModulesService.move(id, dto.direction, user);
  }
}
