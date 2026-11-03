// src/quizzes/quizzes.controller.ts
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
import { QuizzesService } from './quizzes.service';
import {
  CreateQuizQuestionDto,
  UpdateQuizQuestionDto,
} from './dto/quiz-question.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { Actor } from '../common/academy-scope';

// The quiz questions of the modules, for the academy's Quizzes page
// (/center/questions). Every route: a valid token, an admin role, and a
// course of the admin's own academy (checked by the service).
@Controller('quiz-questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  // The modules of a course, each with its questions and right answers
  @Get('course/:stageId')
  findForCourse(@Param('stageId') stageId: string, @GetUser() user: Actor) {
    return this.quizzesService.findForCourse(stageId, user);
  }

  // The students of a course with their best score at each module quiz
  @Get('course/:stageId/results')
  resultsForCourse(@Param('stageId') stageId: string, @GetUser() user: Actor) {
    return this.quizzesService.resultsForCourse(stageId, user);
  }

  @Post()
  create(@Body() dto: CreateQuizQuestionDto, @GetUser() user: Actor) {
    return this.quizzesService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuizQuestionDto,
    @GetUser() user: Actor,
  ) {
    return this.quizzesService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: Actor) {
    return this.quizzesService.remove(id, user);
  }
}
