import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

const LINK = 'https://files.example.com/react-cheat-sheet.pdf';

// One order as the database returns it for GET /orders/my-orders:
// a course and a digital product with its paid download link.
function order(id: string, status: string) {
  return {
    id,
    status,
    items: [
      {
        id: `${id}-course`,
        stage: { title: 'React basics', price: 120 },
        product: null,
      },
      {
        id: `${id}-file`,
        stage: null,
        product: { title: 'React cheat sheet', price: 25, fileUrl: LINK },
      },
    ],
  };
}

describe('OrdersService', () => {
  let service: OrdersService;
  const rows = [
    order('o1', 'PAID'),
    order('o2', 'PENDING'),
    order('o3', 'FAILED'),
    order('o4', 'REFUNDED'),
  ];
  const queries: unknown[] = [];

  beforeEach(async () => {
    queries.length = 0;
    // A fake Prisma: records the query and returns the rows above.
    const prisma = {
      order: {
        findMany: (query: unknown) => {
          queries.push(query);
          return Promise.resolve(rows);
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMyOrders (download links)', () => {
    it('only reads the orders of the logged-in student', async () => {
      await service.getMyOrders('student-1');
      expect(queries).toHaveLength(1);
      expect(queries[0]).toMatchObject({ where: { userId: 'student-1' } });
    });

    it('sends the download link for a PAID order', async () => {
      const [paid] = await service.getMyOrders('student-1');
      expect(paid.status).toBe('PAID');
      expect(paid.items[1].product).toHaveProperty('fileUrl', LINK);
    });

    it('never sends it for a PENDING, FAILED or REFUNDED order', async () => {
      const [, ...others] = await service.getMyOrders('student-1');
      expect(others.map((o) => o.status)).toEqual([
        'PENDING',
        'FAILED',
        'REFUNDED',
      ]);
      for (const o of others) {
        expect(o.items[1].product).toHaveProperty('fileUrl', null);
        expect(JSON.stringify(o)).not.toContain(LINK);
      }
    });

    it('keeps everything else in the order', async () => {
      const result = await service.getMyOrders('student-1');
      expect(result).toHaveLength(4);
      expect(result[1].items[0].stage).toEqual({
        title: 'React basics',
        price: 120,
      });
      expect(result[1].items[0].product).toBeNull();
      expect(result[1].items[1].product).toEqual({
        title: 'React cheat sheet',
        price: 25,
        fileUrl: null,
      });
    });

    it('does not change the data it received', async () => {
      await service.getMyOrders('student-1');
      expect(rows[1].items[1].product).toHaveProperty('fileUrl', LINK);
    });
  });
});
