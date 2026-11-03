import { Test, TestingModule } from '@nestjs/testing';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

describe('LessonsController', () => {
  let controller: LessonsController;
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
      findAllByModule: record('findAllByModule'),
      markAsCompleted: record('markAsCompleted'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LessonsController],
      providers: [{ provide: LessonsService, useValue: service }],
    }).compile();

    controller = module.get<LessonsController>(LessonsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /lessons/module/:moduleId passes the logged-in user to the access check', async () => {
    await controller.findAllByModule('m1', student);
    expect(calls).toEqual([['findAllByModule', 'm1', student]]);
  });

  it('POST /lessons/:id/complete passes the logged-in user to the access check', async () => {
    await controller.markAsCompleted('l1', student);
    expect(calls).toEqual([['markAsCompleted', student, 'l1']]);
  });
});
