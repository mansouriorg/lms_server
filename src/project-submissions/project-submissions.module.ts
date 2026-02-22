import { Module } from '@nestjs/common';
import { ProjectSubmissionsService } from './project-submissions.service';
import { ProjectSubmissionsController } from './project-submissions.controller';

@Module({
  providers: [ProjectSubmissionsService],
  controllers: [ProjectSubmissionsController]
})
export class ProjectSubmissionsModule {}
