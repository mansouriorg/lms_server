import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  FEEDBACK_NEEDED,
  NO_PROJECT,
  ProjectSubmissionsService,
} from './project-submissions.service';
import { ProjectSubmissionsController } from './project-submissions.controller';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { CreateStageDto } from '../stages/dto/create-stage.dto';
import { UpdateStageDto } from '../stages/dto/update-stage.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

const BRIEF = 'Build a todo app with React and send the link to its code.';
const REPO = 'https://github.com/amira/todo';

// The fields refused in a body, and why (the ValidationPipe rules of main.ts)
async function refused(dto: new () => object, body: object) {
  const errors = await validate(plainToInstance(dto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => ({
    field: error.property,
    messages: Object.values(error.constraints ?? {}),
  }));
}
const fields = async (dto: new () => object, body: object) =>
  (await refused(dto, body)).map((error) => error.field);

type Course = { id: string; title: string; projectBrief: string | null };
type Sent = { id: string; stageId: string; status: string };

// A fake Prisma: the courses `courses`, the student u1 bought `bought` (paid
// orders, newest first) and sent `sent`. Every query is recorded.
async function setup(courses: Course[], bought: string[], sent: Sent[] = []) {
  type Query = Record<string, unknown>;
  const queries: { model: string; query: Query }[] = [];
  function record(model: string, answer: (query: Query) => unknown) {
    return (query: Query) => {
      queries.push({ model, query });
      return Promise.resolve(answer(query));
    };
  }
  const course = (id: string) => courses.find((item) => item.id === id);
  type Where = { where: { stageId?: string; id?: string } };
  const stageOf = (query: Query) => course((query as Where).where.id) ?? null;
  const paidItems = () =>
    bought.map((id) => ({
      stage: { ...course(id), center: { name: 'Code Academy' } },
    }));
  const prisma = {
    orderItem: {
      findFirst: record('orderItem.findFirst', (query) => {
        const id = (query as Where).where.stageId;
        return bought.includes(id) ? { id: 'item-' + id } : null;
      }),
      findMany: record('orderItem.findMany', paidItems),
    },
    stage: { findUnique: record('stage.findUnique', stageOf) },
    projectSubmission: {
      findUnique: record('projectSubmission.findUnique', (query) => {
        const key = query.where as { userId_stageId: { stageId: string } };
        const id = key.userId_stageId.stageId;
        return sent.find((item) => item.stageId === id) ?? null;
      }),
      findMany: record('projectSubmission.findMany', () => sent),
      create: record('projectSubmission.create', () => ({ id: 'new' })),
      update: record('projectSubmission.update', () => ({ id: 'old' })),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ProjectSubmissionsService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return {
    service: module.get<ProjectSubmissionsService>(ProjectSubmissionsService),
    models: () => queries.map((item) => item.model),
    queryOf: (model: string) =>
      queries.find((item) => item.model === model)?.query,
  };
}

const REACT = { id: 'c1', title: 'React', projectBrief: BRIEF };
const NODE = { id: 'c2', title: 'Node', projectBrief: null };

describe('Projects of courses (briefs, sending, reviews)', () => {
  it('course form: a brief is optional, an empty one removes it', async () => {
    const course = { title: 'React', price: 100 };
    expect(await fields(CreateStageDto, course)).toEqual([]);
    const withBrief = { ...course, projectBrief: `  ${BRIEF} ` };
    const created = plainToInstance(CreateStageDto, withBrief);
    expect(created.projectBrief).toBe(BRIEF);
    const empty = plainToInstance(UpdateStageDto, { projectBrief: '  ' });
    expect(empty.projectBrief).toBeNull();
    const tooLong = { projectBrief: 'x'.repeat(4001) };
    const errors = await fields(UpdateStageDto, tooLong);
    expect(errors).toEqual(['projectBrief']);
  });

  it('sending form: full https links only, an empty site link is no link', async () => {
    const body = { stageId: 'c1', repoUrl: REPO };
    expect(await fields(CreateSubmissionDto, body)).toEqual([]);
    const noSite = plainToInstance(CreateSubmissionDto, {
      ...body,
      liveUrl: ' ',
    });
    expect(noSite.liveUrl).toBeUndefined();
    const noScheme = { stageId: 'c1', repoUrl: 'github.com/x' };
    expect(await fields(CreateSubmissionDto, noScheme)).toEqual(['repoUrl']);
    const plainHttp = { ...body, liveUrl: 'http://todo.example.com' };
    expect(await fields(CreateSubmissionDto, plainHttp)).toEqual(['liveUrl']);
    const extra = { ...body, status: 'APPROVED', userId: 'u2' };
    const unknown = await fields(CreateSubmissionDto, extra);
    expect(unknown).toEqual(['status', 'userId']);
  });

  it('review form: approved or needs work, never back to pending', async () => {
    const ok = { status: 'NEEDS_WORK', feedback: 'Add tests.' };
    expect(await fields(GradeSubmissionDto, ok)).toEqual([]);
    const pending = { status: 'PENDING' };
    expect(await fields(GradeSubmissionDto, pending)).toEqual(['status']);
    const long = { status: 'APPROVED', feedback: 'x'.repeat(2001) };
    expect(await fields(GradeSubmissionDto, long)).toEqual(['feedback']);
  });

  it('only students send projects; the admin routes need an admin role', () => {
    const roles = (name: string): unknown => {
      const route: unknown = Object.getOwnPropertyDescriptor(
        ProjectSubmissionsController.prototype,
        name,
      )?.value;
      return Reflect.getMetadata(ROLES_KEY, route as object);
    };
    expect(roles('submitProject')).toEqual(['STUDENT']);
    expect(roles('findAllPending')).toEqual(['CENTER_ADMIN', 'SUPER_ADMIN']);
    expect(roles('findReviewed')).toEqual(['CENTER_ADMIN', 'SUPER_ADMIN']);
    expect(roles('gradeSubmission')).toEqual(['CENTER_ADMIN', 'SUPER_ADMIN']);
  });

  it('sending: only for a bought course that has a project', async () => {
    const { service, models } = await setup([REACT, NODE], ['c2']);
    await expect(
      service.submitProject('u1', { stageId: 'c1', repoUrl: REPO }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.submitProject('u1', { stageId: 'c2', repoUrl: REPO }),
    ).rejects.toThrow(NO_PROJECT);
    await expect(
      service.submitProject('u1', { stageId: 'c2', repoUrl: REPO }),
    ).rejects.toThrow(BadRequestException);
    expect(models()).not.toContain('projectSubmission.create');
  });

  it('sending: the first time creates it, with no site link when none', async () => {
    const { service, queryOf } = await setup([REACT], ['c1']);
    const answer = await service.submitProject('u1', {
      stageId: 'c1',
      repoUrl: REPO,
    });
    expect(answer.message).toBe('Project sent. The academy will review it.');
    expect(queryOf('projectSubmission.create')).toMatchObject({
      data: { userId: 'u1', stageId: 'c1', repoUrl: REPO, liveUrl: null },
    });
  });

  it('sending again: back to pending after "Needs work", refused once approved', async () => {
    const needsWork = { id: 's1', stageId: 'c1', status: 'NEEDS_WORK' };
    const first = await setup([REACT], ['c1'], [needsWork]);
    await first.service.submitProject('u1', { stageId: 'c1', repoUrl: REPO });
    expect(first.queryOf('projectSubmission.update')).toMatchObject({
      where: { id: 's1' },
      data: { repoUrl: REPO, liveUrl: null, status: 'PENDING' },
    });
    const approved = { id: 's1', stageId: 'c1', status: 'APPROVED' };
    const second = await setup([REACT], ['c1'], [approved]);
    await expect(
      second.service.submitProject('u1', { stageId: 'c1', repoUrl: REPO }),
    ).rejects.toThrow(ConflictException);
    expect(second.models()).not.toContain('projectSubmission.update');
  });

  it('my projects: bought courses with a project, or with a project sent', async () => {
    const OLD = { id: 'c3', title: 'Old', projectBrief: null };
    const sent = [{ id: 's3', stageId: 'c3', status: 'APPROVED' }];
    const { service, queryOf } = await setup(
      [REACT, NODE, OLD],
      ['c1', 'c2', 'c3', 'c1'],
      sent,
    );
    const mine = await service.findMine('u1');
    expect(mine.map((item) => item.course.id)).toEqual(['c1', 'c3']);
    const sentIds = mine.map((item) => item.submission?.id ?? null);
    expect(sentIds).toEqual([null, 's3']);
    expect(mine[0]).toMatchObject({
      course: { title: 'React', center: { name: 'Code Academy' } },
      brief: BRIEF,
    });
    expect(queryOf('orderItem.findMany')).toMatchObject({
      where: { order: { userId: 'u1', status: 'PAID' } },
    });
    expect(queryOf('projectSubmission.findMany')).toMatchObject({
      where: { userId: 'u1' },
    });
  });
});

describe('Reviews of projects (academy admins)', () => {
  const admin = { id: 'p1', role: 'SUPER_ADMIN' };
  const FOUND = { id: 's1', stage: { centerId: 'academy-1' } };

  async function reviewSetup() {
    const updates: Record<string, unknown>[] = [];
    const lists: Record<string, unknown>[] = [];
    const prisma = {
      projectSubmission: {
        findUnique: () => Promise.resolve(FOUND),
        update: (query: Record<string, unknown>) => {
          updates.push(query);
          return Promise.resolve({ id: 's1' });
        },
        findMany: (query: Record<string, unknown>) => {
          lists.push(query);
          return Promise.resolve([]);
        },
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectSubmissionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const service = module.get<ProjectSubmissionsService>(
      ProjectSubmissionsService,
    );
    return { service, updates, lists };
  }

  it('asking for changes needs feedback; approving does not', async () => {
    const { service, updates } = await reviewSetup();
    await expect(
      service.gradeSubmission('s1', { status: 'NEEDS_WORK' }, admin),
    ).rejects.toThrow(FEEDBACK_NEEDED);
    expect(updates).toEqual([]);
    const changes = { status: 'NEEDS_WORK' as const, feedback: 'Add tests.' };
    await service.gradeSubmission('s1', changes, admin);
    await service.gradeSubmission('s1', { status: 'APPROVED' }, admin);
    expect(updates).toMatchObject([
      { data: { status: 'NEEDS_WORK', feedback: 'Add tests.' } },
      { data: { status: 'APPROVED', feedback: null } },
    ]);
  });

  it('the lists: to review the oldest first, reviewed the newest first', async () => {
    const { service, lists } = await reviewSetup();
    await service.findAllPending(admin);
    await service.findReviewed(admin);
    expect(lists).toMatchObject([
      { where: { status: 'PENDING' }, orderBy: { updatedAt: 'asc' } },
      {
        where: { status: { in: ['APPROVED', 'NEEDS_WORK'] } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      },
    ]);
    // The student and the course come with each project, never a password
    expect(lists[0]).toHaveProperty('select.user.select.email', true);
    expect(lists[0]).toHaveProperty('select.stage.select.projectBrief', true);
    expect(lists[0]).not.toHaveProperty('select.user.select.passwordHash');
  });
});
