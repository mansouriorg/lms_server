import { IsString, IsNotEmpty, IsUrl, IsOptional } from 'class-validator';

export class CreateSubmissionDto {
  @IsString()
  @IsNotEmpty()
  stageId: string; // The bootcamp they are submitting for

  @IsUrl({}, { message: 'Veuillez fournir un lien GitHub ou GitLab valide.' })
  @IsNotEmpty()
  repoUrl: string;

  @IsOptional()
  @IsUrl({}, { message: 'Veuillez fournir un lien web valide.' })
  liveUrl?: string;
}