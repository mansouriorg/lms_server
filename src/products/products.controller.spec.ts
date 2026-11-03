import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  let controller: ProductsController;
  // Every service call the controller makes: [method, ...arguments].
  const calls: unknown[][] = [];
  const admin = { id: 'a1', role: 'CENTER_ADMIN' };

  beforeEach(async () => {
    calls.length = 0;
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push([method, ...args]);
        return Promise.resolve({});
      };
    const service = {
      findAll: record('findAll'),
      findOne: record('findOne'),
      findOnePublic: record('findOnePublic'),
      findAllForAdmin: record('findAllForAdmin'),
      toggleStatus: record('toggleStatus'),
      remove: record('remove'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: service }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /products uses the store catalog (no download links)', async () => {
    await controller.findAllActive();
    expect(calls).toEqual([['findAll', false]]);
  });

  it('GET /products/:id uses the store lookup (no download link)', async () => {
    await controller.findOne('p1');
    expect(calls).toEqual([['findOnePublic', 'p1']]);
  });

  it('GET /products/admin/all uses the academy-scoped admin catalog', async () => {
    await controller.findAllForAdmin(admin);
    expect(calls).toEqual([['findAllForAdmin', admin]]);
  });

  it('PATCH and DELETE pass the logged-in admin to the ownership check', async () => {
    await controller.toggleStatus('p1', admin);
    await controller.remove('p1', admin);
    expect(calls).toEqual([
      ['toggleStatus', 'p1', admin],
      ['remove', 'p1', admin],
    ]);
  });
});
