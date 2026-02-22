// src/questions/dto/create-question.dto.ts
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty({ message: 'L\'ID de la leçon est requis.' })
  lessonId: string;

  @IsString()
  @IsNotEmpty({ message: 'Le titre est requis.' })
  @MinLength(5, { message: 'Le titre doit faire au moins 5 caractères.' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'La description de votre problème est requise.' })
  body: string;
}