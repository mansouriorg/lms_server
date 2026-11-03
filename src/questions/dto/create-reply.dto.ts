// src/questions/dto/create-reply.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { trimText } from '../../common/text';

// POST /questions/reply
export class CreateReplyDto {
  @IsString()
  @IsNotEmpty({ message: 'The question ID is required.' })
  questionId: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: 'Your answer cannot be empty.' })
  @MaxLength(5000, { message: 'The answer can have at most 5000 characters.' })
  body: string;
}
