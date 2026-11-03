import { Test, TestingModule } from '@nestjs/testing';
import { LessonsService } from './lessons.service';
import { PrismaService } from '../prisma/prisma.service';

// A fake Prisma: the course has `total` lessons, the student completed the
// lessons in `completed`. Every query is recorded.
async function setup(total: number, completed: string[]) {
  const queries: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const prisma = {
    lesson: { count: answer('lesson.count', total) },
    progress: {
      findMany: answer(
        'progress.findMany',
        completed.map((lessonId) => ({ lessonId })),
      ),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [LessonsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get<LessonsService>(LessonsService), queries };
}

describe('Course progress (GET /lessons/stage/:stageId/progress)', () => {
  it('also sends which lessons are completed, for the course player', async () => {
    const { service, queries } = await setup(3, ['l1']);
    const result = await service.getStageProgress('u1', 'c1');
    expect(result).toMatchObject({
      total: 3,
      completed: 1,
      percentage: 33,
      completedLessonIds: ['l1'],
    });
    expect(queries[1]).toMatchObject({
      model: 'progress.findMany',
      query: {
        where: { userId: 'u1', lesson: { module: { stageId: 'c1' } } },
      },
    });
  });

  it('a course without lessons: nothing completed', async () => {
    const { service } = await setup(0, []);
    const result = await service.getStageProgress('u1', 'c1');
    expect(result).toMatchObject({
      total: 0,
      completed: 0,
      percentage: 0,
      completedLessonIds: [],
    });
  });
});
