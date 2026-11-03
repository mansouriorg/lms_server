// src/quizzes/dto/check-answer.dto.ts
import { IsInt, Min } from 'class-validator';

// POST /quizzes/questions/:id/check: the answer the student chose, by its
// place in the list of answers (from 0)
export class CheckAnswerDto {
  @IsInt({ message: 'Choose one of the answers.' })
  @Min(0, { message: 'Choose one of the answers.' })
  answer: number;
}
