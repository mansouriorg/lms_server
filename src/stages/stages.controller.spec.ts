import { Test, TestingModule } from '@nestjs/testing';
import { StagesController } from './stages.controller';
import { StagesService } from './stages.service';

describe('StagesController', () => {
  let controller: StagesController;
  // Every service call the controller makes: [method, ...arguments].
  const calls: unknown[][] = [];
  const student = { id: 'u1', role: 'STUDENT' };

  beforeEach(async () => {
    calls.length = 0;
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push([method, ...args]);
        return Promise.resolve({});
      };
    const service = {
      findAll: record('findAll'),
      findOne: record('findOne'),
      findOneForViewer: record('findOneForViewer'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StagesController],
      providers: [{ provide: StagesService, useValue: service }],
    }).compile();

    controller = module.get<StagesController>(StagesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /stages passes the logged-in user (students see no drafts)', async () => {
    await controller.findAll(student);
    expect(calls).toEqual([['findAll', student]]);
  });

  it('GET /stages/:id uses the access-checked lookup', async () => {
    await controller.findOne('c1', student);
    expect(calls).toEqual([['findOneForViewer', 'c1', student]]);
  });
});
