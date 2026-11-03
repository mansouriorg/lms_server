// src/quizzes/dto/submit-attempt.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

// One answer of a finished quiz: the question, and the place of the answer
// chosen in its list (from 0)
export class AttemptAnswerDto {
  @IsString()
  @IsNotEmpty({ message: 'The question ID is required.' })
  questionId: string;

  @IsInt({ message: 'Choose one of the answers.' })
  @Min(0, { message: 'Choose one of the answers.' })
  answer: number;
}

// POST /quizzes/module/:moduleId/attempts: one answer per question of the
// quiz. The server grades them and saves the score.
export class SubmitAttemptDto {
  @IsArray({ message: 'Send the answers as a list.' })
  @ArrayMinSize(1, { message: 'Answer the questions of the quiz.' })
  @ArrayMaxSize(50, { message: 'A quiz has at most 50 questions.' })
  @ValidateNested({ each: true })
  @Type(() => AttemptAnswerDto)
  answers: AttemptAnswerDto[];
}
