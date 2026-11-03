import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CentersService } from './centers.service';
import { PrismaService } from '../prisma/prisma.service';

const student = { id: 'u1', role: 'STUDENT' };
const superAdmin = { id: 's1', role: 'SUPER_ADMIN' };
const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2

// A fake Prisma with one academy (academy-1). Admin a1 belongs to it, a2 to
// academy-2. Every query is recorded.
async function setup() {
  const queries: { model: string; query: unknown }[] = [];
  const answer = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const academies: Record<string, string> = {
    a1: 'academy-1',
    a2: 'academy-2',
  };
  const center = { id: 'academy-1', name: 'Code Academy', stages: [] };
  const prisma = {
    center: {
      findUnique: answer('center.findUnique', center),
      update: answer('center.update', center),
    },
    user: {
      findUnique: (query: { where: { id: string } }) => {
        queries.push({ model: 'user.findUnique', query });
        return Promise.resolve({ centerId: academies[query.where.id] ?? null });
      },
    },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [CentersService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  const models = () => queries.map((q) => q.model);
  return {
    service: module.get<CentersService>(CentersService),
    queries,
    models,
  };
}

describe('CentersService', () => {
  it('should be defined', async () => {
    const { service } = await setup();
    expect(service).toBeDefined();
  });

  describe('academy page (GET /centers/:id)', () => {
    it('students: the academy courses, without drafts or cancelled ones', async () => {
      const { service, queries } = await setup();
      await service.findOne('academy-1', student);

      expect(queries[0].query).toMatchObject({
        include: {
          stages: { where: { status: { notIn: ['DRAFT', 'CANCELLED'] } } },
        },
      });
    });

    it('admins: every course of the academy', async () => {
      const { service, queries } = await setup();
      await service.findOne('academy-1', adminA);

      expect(queries[0].query).not.toHaveProperty(
        'include.stages.where.status',
      );
    });
  });

  describe('edit an academy (PATCH /centers/:id)', () => {
    it('center admin: can edit their own academy', async () => {
      const { service, models } = await setup();
      await service.update('academy-1', { name: 'Code Academy Tunis' }, adminA);
      expect(models()).toContain('center.update');
    });

    it('center admin: cannot edit another academy (403)', async () => {
      const { service, models } = await setup();
      await expect(
        service.update('academy-1', { name: 'Mine now' }, adminB),
      ).rejects.toThrow(ForbiddenException);
      expect(models()).not.toContain('center.update');
    });

    it('super admin: can edit every academy', async () => {
      const { service, models } = await setup();
      await service.update('academy-1', { name: 'Renamed' }, superAdmin);
      expect(models()).toContain('center.update');
    });
  });
});
