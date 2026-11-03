import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

const adminA = { id: 'a1', role: 'CENTER_ADMIN' }; // academy-1
const adminB = { id: 'a2', role: 'CENTER_ADMIN' }; // academy-2
const FILE = 'https://files.example.com/node.pdf';

// The body after validation, and the fields refused (like the app's
// ValidationPipe)
async function check<T extends object>(type: new () => T, body: object) {
  const dto = plainToInstance(type, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, fields: errors.map((error) => error.property).sort() };
}

// A fake Prisma: product p1 belongs to academy-1. Every query is recorded.
async function setup() {
  const queries: { model: string; query: unknown }[] = [];
  const record = (model: string, result: unknown) => (query: unknown) => {
    queries.push({ model, query });
    return Promise.resolve(result);
  };
  const prisma = {
    product: {
      findUnique: () =>
        Promise.resolve({ id: 'p1', centerId: 'academy-1', isActive: true }),
      findMany: record('product.findMany', []),
      update: record('product.update', { id: 'p1' }),
    },
    user: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({
          centerId: query.where.id === 'a1' ? 'academy-1' : 'academy-2',
        }),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  const queryOf = (model: string) =>
    queries.find((q) => q.model === model)?.query;
  return { service: module.get<ProductsService>(ProductsService), queryOf };
}

describe('Digital products: the form and editing (POST, PATCH /products)', () => {
  it('a new product: clean texts, a price in TND, a web link to the file', async () => {
    const ok = await check(CreateProductDto, {
      title: '  <b>Node</b> cheat sheet ',
      description: '<script>x()</script>Every command, on one page',
      price: 12.5,
      fileUrl: `  ${FILE} `,
    });
    expect(ok.fields).toEqual([]);
    expect(ok.dto.title).toBe('Node cheat sheet');
    expect(ok.dto.description).toBe('Every command, on one page');
    expect(ok.dto.fileUrl).toBe(FILE);
    const short = await check(CreateProductDto, {
      title: 'Guide',
      price: 0,
      fileUrl: 'drive.google.com/file/d/abc',
    });
    expect(short.fields).toEqual([]);
    const wrong = await check(CreateProductDto, {
      title: ' <i></i> ',
      price: 12.3456,
      fileUrl: 'javascript:alert(1)',
    });
    expect(wrong.fields).toEqual(['fileUrl', 'price', 'title']);
    const ftp = await check(CreateProductDto, {
      title: 'Guide',
      price: -1,
      fileUrl: 'ftp://files.example.com/a.zip',
    });
    expect(ftp.fields).toEqual(['fileUrl', 'price']);
  });

  it('an edit: every field is optional, with the same checks', async () => {
    expect((await check(UpdateProductDto, {})).fields).toEqual([]);
    const renamed = await check(UpdateProductDto, { title: '  New name ' });
    expect(renamed.fields).toEqual([]);
    expect(renamed.dto.title).toBe('New name');
    const wrong = await check(UpdateProductDto, {
      title: '   ',
      price: -5,
      centerId: 'academy-2',
    });
    expect(wrong.fields).toEqual(['centerId', 'price', 'title']);
  });

  it('PATCH /products/:id: the admin of its academy changes only what is sent', async () => {
    const { service, queryOf } = await setup();
    const answer = await service.update(
      'p1',
      { price: 30, isActive: false },
      adminA,
    );
    expect(answer.message).toBe('Product saved.');
    expect(queryOf('product.update')).toEqual({
      where: { id: 'p1' },
      data: { price: 30, isActive: false },
    });
  });

  it('PATCH /products/:id: another academy gets 403, nothing changes', async () => {
    const { service, queryOf } = await setup();
    await expect(
      service.update('p1', { title: 'Mine now' }, adminB),
    ).rejects.toThrow(ForbiddenException);
    expect(queryOf('product.update')).toBeUndefined();
  });

  it('the admin list says how many times each product was ordered', async () => {
    const { service, queryOf } = await setup();
    await service.findAllForAdmin(adminA);
    expect(queryOf('product.findMany')).toMatchObject({
      where: { centerId: 'academy-1' },
      include: { _count: { select: { orderItems: true } } },
    });
  });

  it('the edit route: signed in, academy admins and super admins only', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      ProductsController.prototype,
      'update',
    )?.value;
    expect(Reflect.getMetadata('__guards__', handler as object)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, handler as object)).toEqual([
      'CENTER_ADMIN',
      'SUPER_ADMIN',
    ]);
  });
});
