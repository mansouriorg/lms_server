import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { request } from 'http';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { RATE_LIMITS } from './rate-limits';

// A route without its own limit, to check the general one.
@Controller('ping')
class PingController {
  @Get()
  ping() {
    return 'pong';
  }
}

// Sends one real HTTP request (no keep-alive) and returns the status code.
function send(method: string, url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, agent: false }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });
}

async function sendMany(times: number, method: string, url: string) {
  const statuses: number[] = [];
  for (let i = 0; i < times; i += 1) {
    statuses.push(await send(method, url));
  }
  return statuses;
}

describe('rate limits (real HTTP requests through the throttler)', () => {
  let app: INestApplication;
  let base: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([RATE_LIMITS.default])],
      controllers: [AuthController, PingController],
      providers: [
        // The real AuthService needs a database; these tests only count requests.
        {
          provide: AuthService,
          useValue: { login: () => ({}), register: () => ({}) },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sign in: 10 attempts per minute, then 429', async () => {
    const statuses = await sendMany(11, 'POST', `${base}/auth/login`);
    expect(statuses.slice(0, 10)).toEqual(new Array<number>(10).fill(200));
    expect(statuses[10]).toBe(429);
  });

  it('sign up: 10 attempts per minute, then 429', async () => {
    const statuses = await sendMany(11, 'POST', `${base}/auth/register`);
    expect(statuses.slice(0, 10)).toEqual(new Array<number>(10).fill(201));
    expect(statuses[10]).toBe(429);
  });

  it('other routes: far more than the old limit of 10 per minute', async () => {
    const statuses = await sendMany(40, 'GET', `${base}/ping`);
    expect(statuses).toEqual(new Array<number>(40).fill(200));
  });
});
