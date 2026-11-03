import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectSubmissionsService } from './project-submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { Actor } from '../common/academy-scope';
import { Role } from 'src/generated/prisma/enums';

// Projects of courses. Every route needs a token; the user is always the one
// of the token.
@Controller('project-submissions')
@UseGuards(JwtAuthGuard)
export class ProjectSubmissionsController {
  constructor(private readonly submissionsService: ProjectSubmissionsService) {}

  // --- STUDENTS ---

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  submitProject(@GetUser('id') userId: string, @Body() dto: CreateSubmissionDto) {
    return this.submissionsService.submitProject(userId, dto);
  }

  @Get('mine')
  findMine(@GetUser('id') userId: string) {
    return this.submissionsService.findMine(userId);
  }

  @Get('my-submission/stage/:stageId')
  getMySubmission(@GetUser('id') userId: string, @Param('stageId') stageId: string) {
    return this.submissionsService.getMySubmission(userId, stageId);
  }

  // --- ACADEMY AND PLATFORM ADMINS ---

  @Get('admin/pending')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  findAllPending(@GetUser() user: Actor) {
    return this.submissionsService.findAllPending(user);
  }

  @Get('admin/reviewed')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  findReviewed(@GetUser() user: Actor) {
    return this.submissionsService.findReviewed(user);
  }

  @Patch(':id/grade')
  @UseGuards(RolesGuard)
  @Roles(Role.CENTER_ADMIN, Role.SUPER_ADMIN)
  gradeSubmission(
    @Param('id') submissionId: string,
    @Body() dto: GradeSubmissionDto,
    @GetUser() user: Actor,
  ) {
    return this.submissionsService.gradeSubmission(submissionId, dto, user);
  }
}
