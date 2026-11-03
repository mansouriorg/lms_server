import { Test, TestingModule } from '@nestjs/testing';
import { ProjectSubmissionsController } from './project-submissions.controller';
import { ProjectSubmissionsService } from './project-submissions.service';

describe('ProjectSubmissionsController', () => {
  let controller: ProjectSubmissionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectSubmissionsController],
      // The controller only passes requests to the service, so a stub is enough.
      providers: [{ provide: ProjectSubmissionsService, useValue: {} }],
    }).compile();

    controller = module.get<ProjectSubmissionsController>(
      ProjectSubmissionsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
