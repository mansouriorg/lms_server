import { Test, TestingModule } from '@nestjs/testing';
import { ProjectSubmissionsService } from './project-submissions.service';

describe('ProjectSubmissionsService', () => {
  let service: ProjectSubmissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProjectSubmissionsService],
    }).compile();

    service = module.get<ProjectSubmissionsService>(ProjectSubmissionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
