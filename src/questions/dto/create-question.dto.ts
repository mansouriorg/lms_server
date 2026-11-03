// src/questions/dto/create-question.dto.ts
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { trimText } from '../../common/text';

// POST /questions. The text is kept as typed (trimmed): the client shows it
// as text.
export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty({ message: 'The lesson ID is required.' })
  lessonId: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: 'The title is required.' })
  @MinLength(5, { message: 'The title must be at least 5 characters long.' })
  @MaxLength(150, { message: 'The title can have at most 150 characters.' })
  title: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: 'Please describe your problem.' })
  @MaxLength(5000, {
    message: 'The question can have at most 5000 characters.',
  })
  body: string;
}
