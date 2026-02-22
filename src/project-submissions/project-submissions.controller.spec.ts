import { Test, TestingModule } from '@nestjs/testing';
import { ProjectSubmissionsController } from './project-submissions.controller';

describe('ProjectSubmissionsController', () => {
  let controller: ProjectSubmissionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectSubmissionsController],
    }).compile();

    controller = module.get<ProjectSubmissionsController>(ProjectSubmissionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
