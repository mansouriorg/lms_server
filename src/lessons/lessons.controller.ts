import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { MoveDto } from '../common/dto/move.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { CourseViewer } from '../common/course-access';
import type { Actor } from '../common/academy-scope';
import { Role } from 'src/generated/prisma/enums'; // Adjust if your Prisma enums are located elsewhere

@Controller('lessons')
@UseGuards(JwtAuthGuard) // Requires login for EVERYTHING
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  // --- ADMIN / INSTRUCTOR ONLY: Curriculum Management ---

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  create(@Body() createLessonDto: CreateLessonDto, @GetUser() user: Actor) {
    return this.lessonsService.create(createLessonDto, user);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateLessonDto: UpdateLessonDto,
    @GetUser() user: Actor,
  ) {
    return this.lessonsService.update(id, updateLessonDto, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  remove(@Param('id') id: string, @GetUser() user: Actor) {
    return this.lessonsService.remove(id, user);
  }

  // One place up or down inside its module: { "direction": "up" | "down" }
  @Post(':id/move')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  move(
    @Param('id') id: string,
    @Body() dto: MoveDto,
    @GetUser() user: Actor,
  ) {
    return this.lessonsService.move(id, dto.direction, user);
  }

  // --- STUDENTS & ADMINS: Learning Experience ---

  // UPDATED: Now fetches lessons by Module ID instead of Stage ID
  @Get('module/:moduleId')
  findAllByModule(
    @Param('moduleId') moduleId: string,
    @GetUser() user: CourseViewer, // Only viewers who can open the course
  ) {
    return this.lessonsService.findAllByModule(moduleId, user);
  }

  @Post(':id/complete')
  markAsCompleted(
    @Param('id') lessonId: string,
    @GetUser() user: CourseViewer, // From the JWT; must be able to open the course
  ) {
    return this.lessonsService.markAsCompleted(user, lessonId);
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