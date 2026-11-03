import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectSubmissionsService } from './project-submissions.service';
import { PrismaService } from '../prisma/prisma.service';

const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };
const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

// A fake Prisma with one submission (s1) for a course of academy-1. Admin a1
// belongs to academy-1, a2 to academy-2. Every query is recorded.
async function setup(exists = true) {
  const queries: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const submission = { id: 's1', stage: { centerId: 'academy-1' } };
  const prisma = {
    projectSubmission: {
      findMany: answer('projectSubmission.findMany', []),
      findUnique: answer(
        'projectSubmission.findUnique',
        exists ? submission : null,
      ),
      update: answer('projectSubmission.update', submission),
    },
    user: {
      findUnique: (query: { where: { id: string } }) => {
        queries.push({ model: 'user.findUnique', query });
        return Promise.resolve({ centerId: academies[query.where.id] ?? null });
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
  const models = () => queries.map((q) => q.model);
  const queryOf = (model: string) =>
    queries.find((q) => q.model === model)?.query;
  return { service, models, queryOf };
}

const approve = { status: 'APPROVED' as const, feedback: 'Great work' };

describe('ProjectSubmissionsService', () => {
  it('should be defined', async () => {
    const { service } = await setup();
    expect(service).toBeDefined();
  });

  describe('assignments to review (GET /project-submissions/admin/pending)', () => {
    it('center admin: only their own academy assignments', async () => {
      const { service, queryOf } = await setup();
      await service.findAllPending(adminA);

      expect(queryOf('projectSubmission.findMany')).toMatchObject({
        where: { status: 'PENDING', stage: { centerId: 'academy-1' } },
      });
    });

    it('super admin: every academy', async () => {
      const { service, queryOf } = await setup();
      await service.findAllPending(superAdmin);

      expect(queryOf('projectSubmission.findMany')).not.toHaveProperty(
        'where.stage',
      );
    });
  });

  describe('grade an assignment (PATCH /project-submissions/:id/grade)', () => {
    it('center admin: grades their own academy assignments', async () => {
      const { service, models } = await setup();
      await service.gradeSubmission('s1', approve, adminA);
      expect(models()).toContain('projectSubmission.update');
    });

    it('center admin: cannot grade another academy assignment (403)', async () => {
      const { service, models } = await setup();
      await expect(
        service.gradeSubmission('s1', approve, adminB),
      ).rejects.toThrow(ForbiddenException);
      expect(models()).not.toContain('projectSubmission.update');
    });

    it('unknown assignment: 404', async () => {
      const { service } = await setup(false);
      await expect(
        service.gradeSubmission('s1', approve, adminA),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
