import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const lonelyAdmin = { id: 'a9', role: 'CENTER_ADMIN' }; // no academy
const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };

// The guards Nest runs for a controller method (set by @UseGuards).
function guardsOf(method: keyof QuestionsController): unknown {
  const handler: unknown = Object.getOwnPropertyDescriptor(
    QuestionsController.prototype,
    method,
  )?.value;
  return Reflect.getMetadata('__guards__', handler as object);
}

// A fake Prisma: admin a1 belongs to academy-1, a9 to no academy. The
// question queries are recorded.
async function setup() {
  const queries: unknown[] = [];
  const prisma = {
    question: {
      findMany: (query: unknown) => {
        queries.push(query);
        return Promise.resolve([]);
      },
    },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({
          centerId: query.where.id === 'a1' ? 'academy-1' : null,
        }),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [QuestionsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get<QuestionsService>(QuestionsService), queries };
}

describe('The academy inbox (GET /questions/inbox)', () => {
  it('a token for every Q&A route, and an admin role for the inbox', () => {
    expect(Reflect.getMetadata('__guards__', QuestionsController)).toEqual([
      JwtAuthGuard,
    ]);
    expect(guardsOf('inbox')).toEqual([RolesGuard]);
  });

  it('an academy admin: the questions on the courses of their academy, not resolved first', async () => {
    const { service, queries } = await setup();
    await service.inbox(adminA);
    expect(queries).toMatchObject([
      {
        where: { lesson: { module: { stage: { centerId: 'academy-1' } } } },
        orderBy: [{ resolved: 'asc' }, { createdAt: 'desc' }],
        take: 200,
        include: {
          lesson: {
            select: {
              title: true,
              module: { select: { stage: { select: { title: true } } } },
            },
          },
        },
      },
    ]);
  });

  it('a super admin: every academy', async () => {
    const { service, queries } = await setup();
    await service.inbox(superAdmin);
    expect(queries).toMatchObject([{ where: {} }]);
  });

  it('an admin account without an academy: 403, nothing is read', async () => {
    const { service, queries } = await setup();
    await expect(service.inbox(lonelyAdmin)).rejects.toThrow(
      ForbiddenException,
    );
    expect(queries).toEqual([]);
  });
});
