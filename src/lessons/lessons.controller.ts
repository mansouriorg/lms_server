import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from 'src/generated/prisma/enums'; // Adjust if your Prisma enums are located elsewhere

@Controller('lessons')
@UseGuards(JwtAuthGuard) // Requires login for EVERYTHING
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  // --- ADMIN / INSTRUCTOR ONLY: Curriculum Management ---

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  create(@Body() createLessonDto: CreateLessonDto) {
    return this.lessonsService.create(createLessonDto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() updateLessonDto: UpdateLessonDto) {
    return this.lessonsService.update(id, updateLessonDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.lessonsService.remove(id);
  }

  // --- STUDENTS & ADMINS: Learning Experience ---

  // UPDATED: Now fetches lessons by Module ID instead of Stage ID
  @Get('module/:moduleId')
  findAllByModule(@Param('moduleId') moduleId: string) {
    return this.lessonsService.findAllByModule(moduleId);
  }

  @Post(':id/complete')
  markAsCompleted(
    @Param('id') lessonId: string,
    @GetUser('id') userId: string // Extremely secure: Extracted directly from JWT
  ) {
    return this.lessonsService.markAsCompleted(userId, lessonId);
  }

  // --- Get Progress Endpoint ---

  // This remains attached to the stageId since progress spans the entire course
  @Get('stage/:stageId/progress')
  getStageProgress(
    @Param('stageId') stageId: string,
    @GetUser('id') userId: string // Securely extracted from the JWT
  ) {
    return this.lessonsService.getStageProgress(userId, stageId);
  }
}