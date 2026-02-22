// src/questions/questions.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  UseGuards 
} from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('questions')
@UseGuards(JwtAuthGuard) // Requires a valid JWT token for all interactions
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  // --- QUESTIONS ---

  @Post()
  askQuestion(
    @GetUser('id') userId: string,
    @Body() createQuestionDto: CreateQuestionDto
  ) {
    return this.questionsService.askQuestion(userId, createQuestionDto);
  }

  @Get('lesson/:lessonId')
  getQuestionsByLesson(@Param('lessonId') lessonId: string) {
    return this.questionsService.getQuestionsByLesson(lessonId);
  }

  // --- REPLIES ---

  @Post('reply')
  replyToQuestion(
    @GetUser('id') userId: string,
    @Body() createReplyDto: CreateReplyDto
  ) {
    return this.questionsService.replyToQuestion(userId, createReplyDto);
  }

  @Patch(':questionId/replies/:replyId/accept')
  acceptAnswer(
    @GetUser('id') userId: string,
    @Param('questionId') questionId: string,
    @Param('replyId') replyId: string
  ) {
    // This securely passes the userId down so the service can verify 
    // that only the author of the question is allowed to accept an answer.
    return this.questionsService.acceptAnswer(userId, questionId, replyId);
  }
}