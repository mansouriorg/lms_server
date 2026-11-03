// src/quizzes/quizzes.module.ts
import { Module } from '@nestjs/common';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';
import { QuizPracticeController } from './practice.controller';

// GET /quiz-questions/course/:stageId, POST, PATCH and DELETE /quiz-questions
// (academies); GET /quizzes/module/:moduleId and
// POST /quizzes/questions/:id/check (students)
@Module({
  controllers: [QuizzesController, QuizPracticeController],
  providers: [QuizzesService],
})
export class QuizzesModule {}
