// src/quizzes/practice.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { CheckAnswerDto } from './dto/check-answer.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { CourseViewer } from '../common/course-access';

// The quizzes in the course player: for every signed-in user who may open
// the course (the buyers, the academy's admins; see common/course-access.ts).
// The right answer of a question is only sent once the student answered it.
@Controller('quizzes')
@UseGuards(JwtAuthGuard)
export class QuizPracticeController {
  constructor(private readonly quizzesService: QuizzesService) {}

  // The questions of a module's quiz, without the right answers
  @Get('module/:moduleId')
  forModule(
    @Param('moduleId') moduleId: string,
    @GetUser() user: CourseViewer,
  ) {
    return this.quizzesService.forStudent(moduleId, user);
  }

  // Is this the right answer? With the right one and the explanation
  @Post('questions/:id/check')
  @HttpCode(200)
  check(
    @Param('id') id: string,
    @Body() dto: CheckAnswerDto,
    @GetUser() user: CourseViewer,
  ) {
    return this.quizzesService.check(id, dto.answer, user);
  }

  // Saves the score of a finished quiz (graded here), with the best one
  @Post('module/:moduleId/attempts')
  submitAttempt(
    @Param('moduleId') moduleId: string,
    @Body() dto: SubmitAttemptDto,
    @GetUser() user: CourseViewer,
  ) {
    return this.quizzesService.submitAttempt(moduleId, dto.answers, user);
  }

  // The viewer's best score at each module quiz of a course
  @Get('course/:stageId/results')
  courseResults(
    @Param('stageId') stageId: string,
    @GetUser() user: CourseViewer,
  ) {
    return this.quizzesService.courseResults(stageId, user);
  }
}
