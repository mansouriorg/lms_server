import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

// The guards Nest runs for a controller method (set by @UseGuards).
function guardsOf(method: keyof LessonsController): unknown {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    LessonsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata('__guards__', handler as object);
}

// A fake Prisma: module m1 (in a course of academy-1) has the lessons l1, l2,
// l3, in that order; `lastOrder` is the highest lesson number (null: none).
// Admin a1 belongs to academy-1, a2 to academy-2. Every write is recorded.
async function setup(lastOrder: number | null = 3) {
  const calls: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    calls.push({ model, query });
    return Promise.resolve(result);
  };
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const lessons = ['l1', 'l2', 'l3'];
  const prisma = {
    module: {
      findUnique: () => Promise.resolve({ stage: { centerId: 'academy-1' } }),
    },
    lesson: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(
          lessons.includes(query.where.id)
            ? { id: query.where.id, moduleId: 'm1' }
            : null,
        ),
      findMany: answer(
        'lesson.findMany',
        lessons.map((id) => ({ id })),
      ),
      aggregate: answer('lesson.aggregate', { _max: { order: lastOrder } }),
      create: answer('lesson.create', { id: 'l4' }),
      update: answer('lesson.update', {}),
    },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ centerId: academies[query.where.id] ?? null }),
    },
    $transaction: (operations: Promise<unknown>[]) => {
      calls.push({ model: '$transaction', query: operations.length });
      return Promise.all(operations);
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [LessonsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  const models = () => calls.map((call) => call.model);
  const queriesOf = (model: string) =>
    calls.filter((call) => call.model === model).map((call) => call.query);
  return {
    service: module.get<LessonsService>(LessonsService),
    models,
    queriesOf,
  };
}

// The fields the API refuses in a request body (the ValidationPipe rules).
async function refused(dto: new () => object, body: object) {
  const errors = await validate(plainToInstance(dto, body));
  return errors.map((error) => error.property);
}

describe('Lessons: adding and ordering (POST /lessons, POST /lessons/:id/move)', () => {
  it('POST /lessons/:id/move: a token (every lesson route) and an admin role', () => {
    expect(Reflect.getMetadata('__guards__', LessonsController)).toEqual([
      JwtAuthGuard,
    ]);
    expect(guardsOf('move')).toEqual([RolesGuard]);
  });

  it('add without a number: after the last lesson of the module', async () => {
    const { service, queriesOf } = await setup(3);
    await service.create({ title: 'Hooks', moduleId: 'm1' }, adminA);
    expect(queriesOf('lesson.aggregate')).toEqual([
      { where: { moduleId: 'm1' }, _max: { order: true } },
    ]);
    expect(queriesOf('lesson.create')).toEqual([
      { data: { title: 'Hooks', moduleId: 'm1', order: 4 } },
    ]);
  });

  it('add: the first lesson is number 1; a given number is kept', async () => {
    const { service, models, queriesOf } = await setup(null);
    await service.create({ title: 'Welcome', moduleId: 'm1' }, adminA);
    await service.create({ title: 'Setup', moduleId: 'm1', order: 7 }, adminA);
    expect(queriesOf('lesson.create')).toEqual([
      { data: { title: 'Welcome', moduleId: 'm1', order: 1 } },
      { data: { title: 'Setup', moduleId: 'm1', order: 7 } },
    ]);
    expect(models().filter((model) => model === 'lesson.aggregate')).toEqual([
      'lesson.aggregate',
    ]);
  });

  it('move down: the lessons of the module are numbered again, in one transaction', async () => {
    const { service, queriesOf } = await setup();
    await expect(service.move('l1', 'down', adminA)).resolves.toEqual({
      message: 'Lesson moved.',
      order: ['l2', 'l1', 'l3'],
    });
    expect(queriesOf('lesson.findMany')).toEqual([
      {
        where: { moduleId: 'm1' },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      },
    ]);
    expect(queriesOf('$transaction')).toEqual([3]);
    expect(queriesOf('lesson.update')).toEqual([
      { where: { id: 'l2' }, data: { order: 1 } },
      { where: { id: 'l1' }, data: { order: 2 } },
      { where: { id: 'l3' }, data: { order: 3 } },
    ]);
  });

  it('move: nothing is written for the first lesson moved up; 403 for another academy; 404 if unknown', async () => {
    const { service, models } = await setup();
    await expect(service.move('l1', 'up', adminA)).resolves.toEqual({
      message: 'The lesson is already there.',
      order: ['l1', 'l2', 'l3'],
    });
    await expect(service.move('l2', 'up', adminB)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.move('nope', 'up', adminA)).rejects.toThrow(
      NotFoundException,
    );
    expect(models()).toEqual(['lesson.findMany']);
  });

  it('the form: a title, and a video link that is a full https:// (or http://) address', async () => {
    const lesson = { title: 'Hooks', moduleId: 'm1' };
    expect(await refused(CreateLessonDto, lesson)).toEqual([]);
    expect(
      await refused(CreateLessonDto, {
        ...lesson,
        videoUrl: YOUTUBE,
        duration: 12,
      }),
    ).toEqual([]);
    expect(
      await refused(CreateLessonDto, {
        ...lesson,
        videoUrl: 'youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    ).toEqual(['videoUrl']);
    expect(
      await refused(CreateLessonDto, {
        ...lesson,
        videoUrl: 'javascript:alert(1)',
      }),
    ).toEqual(['videoUrl']);
    expect(await refused(CreateLessonDto, { ...lesson, title: '   ' })).toEqual(
      ['title'],
    );
    expect(await refused(CreateLessonDto, { ...lesson, duration: 0 })).toEqual([
      'duration',
    ]);
  });

  it('editing: null removes the video link or the duration', async () => {
    expect(
      await refused(UpdateLessonDto, { videoUrl: null, duration: null }),
    ).toEqual([]);
    expect(await refused(UpdateLessonDto, { videoUrl: 'not a link' })).toEqual([
      'videoUrl',
    ]);
  });
});
