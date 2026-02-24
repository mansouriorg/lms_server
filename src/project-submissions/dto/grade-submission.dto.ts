import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { SubmissionStatus } from 'src/generated/prisma/enums'; 

export class GradeSubmissionDto {
  @IsEnum(SubmissionStatus, { message: 'Statut invalide.' })
  status: SubmissionStatus;

  @IsOptional()
  @IsString()
  feedback?: string; // The instructor's code review
}