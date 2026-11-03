// src/questions/questions.controller.ts
// Questions and answers under a lesson. Every route needs a valid token; the
// service checks that the user may open the course (common/course-access.ts).
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from 'src/generated/prisma/enums';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { CourseViewer } from '../common/course-access';

@Controller('questions')
@UseGuards(JwtAuthGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  // --- THE ACADEMY INBOX (admins) ---

  // The questions on the courses of the admin's academy (every academy for a
  // super admin), the ones not resolved first
  @Get('inbox')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  inbox(@GetUser() user: CourseViewer) {
    return this.questionsService.inbox(user);
  }

  // --- QUESTIONS ---

  @Post()
  askQuestion(@GetUser() user: CourseViewer, @Body() dto: CreateQuestionDto) {
    return this.questionsService.askQuestion(user, dto);
  }

  @Get('lesson/:lessonId')
  getQuestionsByLesson(
    @GetUser() user: CourseViewer,
    @Param('lessonId') lessonId: string,
  ) {
    return this.questionsService.getQuestionsByLesson(user, lessonId);
  }

  // --- ANSWERS ---

  @Post('reply')
  replyToQuestion(@GetUser() user: CourseViewer, @Body() dto: CreateReplyDto) {
    return this.questionsService.replyToQuestion(user, dto);
  }

  // The author of the question, or an admin of the course's academy
  @Patch(':questionId/replies/:replyId/accept')
  acceptAnswer(
    @GetUser() user: CourseViewer,
    @Param('questionId') questionId: string,
    @Param('replyId') replyId: string,
  ) {
    return this.questionsService.acceptAnswer(user, questionId, replyId);
  }
}
