// src/quizzes/dto/quiz-question.dto.ts
import { OmitType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { trimText } from '../../common/text';

export const QUIZ_TYPES = ['MULTIPLE_CHOICE', 'TRUE_FALSE'] as const;
export const QUIZ_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type QuizType = (typeof QUIZ_TYPES)[number];
export type QuizLevel = (typeof QUIZ_DIFFICULTIES)[number];

// Each answer without the spaces around (other values are left for the
// validators to refuse)
const trimEach = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? value.map((item: unknown) =>
        typeof item === 'string' ? item.trim() : item,
      )
    : value;

// An empty explanation is no explanation
const optionalText = ({ value }: { value: unknown }): unknown => {
  const text = trimText({ value });
  return text === '' ? null : text;
};

// POST /quiz-questions: one question of a module's quiz. A multiple choice
// question has 2 to 6 different answers; a true or false question gets the
// answers "True" and "False" (its `options` are not used). `correctAnswer`
// is the place of the right answer in the list, from 0.
export class CreateQuizQuestionDto {
  @IsString()
  @IsNotEmpty({ message: 'The module ID is required.' })
  moduleId: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: 'Write the question.' })
  @MaxLength(500, { message: 'The question can have at most 500 characters.' })
  text: string;

  @IsIn(QUIZ_TYPES, {
    message: 'The type is MULTIPLE_CHOICE or TRUE_FALSE.',
  })
  type: QuizType;

  @IsOptional()
  @IsIn(QUIZ_DIFFICULTIES, {
    message: 'The difficulty is EASY, MEDIUM or HARD.',
  })
  difficulty?: QuizLevel;

  @ValidateIf((dto: CreateQuizQuestionDto) => dto.type !== 'TRUE_FALSE')
  @Transform(trimEach)
  @IsArray({ message: 'Give the possible answers as a list.' })
  @ArrayMinSize(2, { message: 'Give at least 2 possible answers.' })
  @ArrayMaxSize(6, { message: 'Give at most 6 possible answers.' })
  @IsString({ each: true, message: 'Each answer must be a text.' })
  @IsNotEmpty({ each: true, message: 'An answer cannot be empty.' })
  @MaxLength(200, {
    each: true,
    message: 'An answer can have at most 200 characters.',
  })
  @ArrayUnique({ message: 'Two answers are the same.' })
  options?: string[];

  @IsInt({ message: 'Choose the right answer.' })
  @Min(0, { message: 'Choose the right answer.' })
  correctAnswer: number;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(1000, {
    message: 'The explanation can have at most 1000 characters.',
  })
  explanation?: string | null;
}

// PATCH /quiz-questions/:id: the whole question again (it stays in its
// module), with the same checks.
export class UpdateQuizQuestionDto extends OmitType(CreateQuizQuestionDto, [
  'moduleId',
] as const) {}
