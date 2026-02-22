// src/project-submissions/project-submissions.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  UseGuards 
} from '@nestjs/common';
import { ProjectSubmissionsService } from './project-submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Role } from 'generated/prisma/enums';

@Controller('project-submissions')
@UseGuards(JwtAuthGuard) // Requires a valid JWT token for all routes
export class ProjectSubmissionsController {
  constructor(private readonly submissionsService: ProjectSubmissionsService) {}

  // --- STUDENT ROUTES ---

  @Post()
  submitProject(
    @GetUser('id') userId: string, // Securely extracted from token
    @Body() dto: CreateSubmissionDto
  ) {
    return this.submissionsService.submitProject(userId, dto);
  }

  @Get('my-submission/stage/:stageId')
  getMySubmission(
    @GetUser('id') userId: string,
    @Param('stageId') stageId: string
  ) {
    return this.submissionsService.getMySubmission(userId, stageId);
  }

  // --- ADMIN / MENTOR ROUTES ---

  @Get('admin/pending')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  findAllPending() {
    return this.submissionsService.findAllPending();
  }

  @Patch(':id/grade')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  gradeSubmission(
    @Param('id') submissionId: string,
    @Body() dto: GradeSubmissionDto
  ) {
    return this.submissionsService.gradeSubmission(submissionId, dto);
  }
}