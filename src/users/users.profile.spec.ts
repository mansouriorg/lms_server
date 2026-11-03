import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// The fields the API refuses in a request body, and why (the ValidationPipe
// rules of main.ts: whitelist and forbidNonWhitelisted).
async function refused(body: object) {
  const errors = await validate(plainToInstance(UpdateUserDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => ({
    field: error.property,
    messages: Object.values(error.constraints ?? {}),
  }));
}

// A fake Prisma that records the profile updates.
async function setup() {
  const updates: unknown[] = [];
  const prisma = {
    user: {
      update: (query: unknown) => {
        updates.push(query);
        return Promise.resolve({ id: 'u1' });
      },
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [UsersService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: module.get<UsersService>(UsersService), updates };
}

describe('My profile (GET and PATCH /users/me)', () => {
  it('a token for every route; the user is the one of the token', () => {
    expect(Reflect.getMetadata('__guards__', UsersController)).toEqual([
      JwtAuthGuard,
    ]);
  });

  it('the form: names and a phone number are accepted, "&" kept', async () => {
    await expect(
      refused({
        firstName: 'Amira',
        lastName: 'Ben Salah & Co',
        phone: '+216 20 000 000',
      }),
    ).resolves.toEqual([]);
    await expect(refused({ phone: '' })).resolves.toEqual([]);
    await expect(refused({})).resolves.toEqual([]);
  });

  it('the form: an empty name, a long name or a wrong phone number is refused', async () => {
    await expect(
      refused({ firstName: '   ', lastName: 'x'.repeat(51), phone: 'call me' }),
    ).resolves.toEqual([
      { field: 'firstName', messages: ['Please enter your first name.'] },
      {
        field: 'lastName',
        messages: ['The last name can have at most 50 characters.'],
      },
      {
        field: 'phone',
        messages: ['Please enter a valid phone number, like +216 20 000 000.'],
      },
    ]);
  });

  it('the form: the email, the role or the academy cannot be changed here', async () => {
    const fields = (
      await refused({ email: 'x@y.tn', role: 'SUPER_ADMIN', centerId: 'c1' })
    ).map((error) => error.field);
    expect(fields).toEqual(['email', 'role', 'centerId']);
  });

  it('saving: only the user of the token; an empty phone removes it', async () => {
    const { service, updates } = await setup();
    await service.updateProfile('u1', { firstName: 'Amira', phone: '' });
    expect(updates).toMatchObject([
      {
        where: { id: 'u1' },
        data: { firstName: 'Amira', phone: null },
        select: { id: true, firstName: true, lastName: true, role: true },
      },
    ]);
    expect(updates[0]).not.toHaveProperty('select.passwordHash');
  });
});
