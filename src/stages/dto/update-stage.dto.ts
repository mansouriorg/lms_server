// src/stages/dto/update-stage.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateStageDto } from './create-stage.dto';
import { IsOptional, IsEnum } from 'class-validator';
import { StageStatus } from 'src/generated/prisma/enums';

// PartialType copies CreateStageDto but makes every field optional!
export class UpdateStageDto extends PartialType(CreateStageDto) {
  
  // We add 'status' here because admins might want to change it from DRAFT to PUBLISHED
  @IsOptional()
  @IsEnum(StageStatus, { message: 'Invalid status.' })
  status?: StageStatus;
}