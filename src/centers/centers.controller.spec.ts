import { Test, TestingModule } from '@nestjs/testing';
import { CentersController } from './centers.controller';
import { CentersService } from './centers.service';

describe('CentersController', () => {
  let controller: CentersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CentersController],
      // The controller only passes requests to the service, so a stub is enough.
      providers: [{ provide: CentersService, useValue: {} }],
    }).compile();

    controller = module.get<CentersController>(CentersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
