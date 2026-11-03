import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { PrismaService } from '../prisma/prisma.service';

const author = { id: 'u1', role: 'STUDENT' }; // bought the course, asked q1
const buyer = { id: 'u3', role: 'STUDENT' }; // bought the course too
const stranger = { id: 'u2', role: 'STUDENT' }; // did not buy it
const ownAdmin = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const otherAdmin = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

// Lesson l1 is in course c1 (academy-1, 120 TND). Question q1 (by u1) is on
// l1 and has the answers r1 and r2; answer r9 belongs to another question.
const course = {
  id: 'c1',
  centerId: 'academy-1',
  price: 120,
  status: 'ACTIVE',
};
const withCourse = { module: { stage: course } };

// A fake Prisma: u1 and u3 have a PAID order for c1. Every write is recorded.
async function setup() {
  const calls: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    calls.push({ model, query });
    return Promise.resolve(result);
  };
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const replies: Record<string, string> = { r1: 'q1', r2: 'q1', r9: 'q9' };
  const prisma = {
    lesson: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(query.where.id === 'l1' ? withCourse : null),
    },
    question: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(
          query.where.id === 'q1'
            ? { id: 'q1', userId: 'u1', lesson: withCourse }
            : null,
        ),
      findMany: answer('question.findMany', []),
      create: answer('question.create', { id: 'q2' }),
      update: answer('question.update', { id: 'q1', resolved: true }),
    },
    reply: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve(
          query.where.id in replies
            ? { questionId: replies[query.where.id] }
            : null,
        ),
      create: answer('reply.create', { id: 'r3' }),
      update: answer('reply.update', {}),
      updateMany: answer('reply.updateMany', { count: 1 }),
    },
    orderItem: {
      count: (query: { where: { order: { userId: string } } }) =>
        Promise.resolve(
          ['u1', 'u3'].includes(query.where.order.userId) ? 1 : 0,
        ),
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
    providers: [QuestionsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  const models = () => calls.map((call) => call.model);
  const queriesOf = (model: string) =>
    calls.filter((call) => call.model === model).map((call) => call.query);
  return {
    service: module.get<QuestionsService>(QuestionsService),
    models,
    queriesOf,
  };
}

const newQuestion = {
  lessonId: 'l1',
  title: 'Why does my state not update?',
  body: 'I call setCount twice and it only adds 1.',
};

describe('Questions and answers: only for those who can open the course', () => {
  it('reading the questions of a lesson: buyers and the academy admins; 403 otherwise; 404 for an unknown lesson', async () => {
    const { service, models } = await setup();
    await service.getQuestionsByLesson(buyer, 'l1');
    await service.getQuestionsByLesson(ownAdmin, 'l1');
    expect(models()).toEqual(['question.findMany', 'question.findMany']);
    await expect(service.getQuestionsByLesson(stranger, 'l1')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.getQuestionsByLesson(otherAdmin, 'l1'),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.getQuestionsByLesson(buyer, 'nope')).rejects.toThrow(
      NotFoundException,
    );
    expect(models()).toHaveLength(2);
  });

  it('asking: a buyer can, someone who did not buy the course cannot (403, nothing saved)', async () => {
    const { service, queriesOf } = await setup();
    await expect(service.askQuestion(stranger, newQuestion)).rejects.toThrow(
      ForbiddenException,
    );
    expect(queriesOf('question.create')).toEqual([]);
    await service.askQuestion(buyer, newQuestion);
    expect(queriesOf('question.create')).toEqual([
      { data: { userId: 'u3', ...newQuestion } },
    ]);
  });

  it('answering: the academy admin can, a student who did not buy the course cannot; 404 for an unknown question', async () => {
    const { service, models } = await setup();
    const reply = { questionId: 'q1', body: 'React batches the updates.' };
    await expect(service.replyToQuestion(stranger, reply)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.replyToQuestion(ownAdmin, { ...reply, questionId: 'nope' }),
    ).rejects.toThrow(NotFoundException);
    expect(models()).toEqual([]);
    await service.replyToQuestion(ownAdmin, reply);
    expect(models()).toEqual(['reply.create']);
  });

  it('accepting: the author marks one answer, the others are unmarked, the question is resolved', async () => {
    const { service, queriesOf } = await setup();
    await service.acceptAnswer(author, 'q1', 'r2');
    expect(queriesOf('$transaction')).toEqual([3]);
    expect(queriesOf('reply.updateMany')).toEqual([
      {
        where: { questionId: 'q1', isAcceptedAnswer: true },
        data: { isAcceptedAnswer: false },
      },
    ]);
    expect(queriesOf('reply.update')).toEqual([
      { where: { id: 'r2' }, data: { isAcceptedAnswer: true } },
    ]);
    expect(queriesOf('question.update')).toEqual([
      { where: { id: 'q1' }, data: { resolved: true } },
    ]);
  });

  it('accepting: an answer of another question is refused (404), and so is another student (403)', async () => {
    const { service, models } = await setup();
    await expect(service.acceptAnswer(author, 'q1', 'r9')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.acceptAnswer(buyer, 'q1', 'r1')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.acceptAnswer(otherAdmin, 'q1', 'r1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(models()).toEqual([]);
  });

  it('accepting: an admin of the course academy can do it for the author', async () => {
    const { service, models } = await setup();
    await service.acceptAnswer(ownAdmin, 'q1', 'r1');
    expect(models()).toContain('$transaction');
  });

  it('the controller passes the signed-in user, not only their ID', async () => {
    const seen: unknown[][] = [];
    const service = {
      acceptAnswer: (...args: unknown[]) => {
        seen.push(args);
        return Promise.resolve({});
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuestionsController],
      providers: [{ provide: QuestionsService, useValue: service }],
    }).compile();
    const controller = module.get<QuestionsController>(QuestionsController);
    await controller.acceptAnswer(ownAdmin, 'q1', 'r1');
    expect(seen).toEqual([[ownAdmin, 'q1', 'r1']]);
  });

  it('the form: the title and the question are trimmed, and not too long', async () => {
    const problems = async (body: object) =>
      (await validate(plainToInstance(CreateQuestionDto, body))).map(
        (error) => error.property,
      );
    expect(await problems(newQuestion)).toEqual([]);
    expect(await problems({ ...newQuestion, title: '   Why   ' })).toEqual([
      'title',
    ]);
    expect(await problems({ ...newQuestion, body: 'x'.repeat(5001) })).toEqual([
      'body',
    ]);
  });
});
