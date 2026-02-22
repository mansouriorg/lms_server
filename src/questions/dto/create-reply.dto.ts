// src/questions/dto/create-reply.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateReplyDto {
  @IsString()
  @IsNotEmpty({ message: 'L\'ID de la question est requis.' })
  questionId: string;

  @IsString()
  @IsNotEmpty({ message: 'Votre réponse ne peut pas être vide.' })
  body: string;
}