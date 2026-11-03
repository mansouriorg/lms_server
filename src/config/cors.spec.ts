import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { request } from 'http';
import { join } from 'path';
import {
  REFUSED_ORIGIN_MESSAGE,
  applyCors,
  originAllowed,
  parseOrigins,
} from './cors';

const WEB_APP = 'https://lms.example.com';
let routeCalls = 0;

@Controller('ping')
class PingController {
  @Get()
  ping() {
    routeCalls += 1;
    return 'pong';
  }
}

type Answer = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

// Sends one real HTTP request (no keep-alive), with the given headers.
function send(
  method: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers, agent: false }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

describe('CORS: which web sites may call the API (FRONTEND_URLS)', () => {
  it('the list: spaces, capitals, a final "/" and repeats do not matter', () => {
    expect(
      parseOrigins(' http://localhost:3000 , https://LMS.example.com/ ,,'),
    ).toEqual(['http://localhost:3000', WEB_APP]);
    expect(parseOrigins(`${WEB_APP},${WEB_APP}/`)).toEqual([WEB_APP]);
    expect(parseOrigins('')).toEqual(['http://localhost:3000']);
    expect(parseOrigins(undefined)).toEqual(['http://localhost:3000']);
  });

  it('allowed: no Origin, a listed site, the API itself; nothing else', () => {
    const allowed = [WEB_APP];
    expect(originAllowed(undefined, allowed, 'api.example.com')).toBe(true);
    expect(originAllowed(WEB_APP, allowed, 'api.example.com')).toBe(true);
    expect(
      originAllowed('https://api.example.com', allowed, 'api.example.com'),
    ).toBe(true);
    for (const origin of ['https://evil.example.com', 'null', '', 'x:y']) {
      expect(originAllowed(origin, allowed, 'api.example.com')).toBe(false);
    }
    expect(originAllowed('https://evil.example.com', allowed, undefined)).toBe(
      false,
    );
  });

  it('main.ts uses applyCors, and no longer answers 500 to other sites', () => {
    const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');
    expect(main).toContain(
      "applyCors(app, configService.get<string>('FRONTEND_URLS'));",
    );
    expect(main).not.toContain('Blocked by CORS policy');
    expect(main).not.toContain('enableCors(');
  });

  describe('real HTTP requests', () => {
    let app: INestApplication;
    let base: string;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        controllers: [PingController],
      }).compile();
      app = module.createNestApplication({ logger: false });
      applyCors(app, `http://localhost:3000, ${WEB_APP}/`);
      await app.listen(0, '127.0.0.1');
      base = await app.getUrl();
      routeCalls = 0;
    });

    afterEach(async () => {
      await app.close();
    });

    it('a listed site: answered, and allowed to read the answer', async () => {
      const answer = await send('GET', `${base}/ping`, { Origin: WEB_APP });
      expect(answer.status).toBe(200);
      expect(answer.headers['access-control-allow-origin']).toBe(WEB_APP);
      expect(answer.headers['access-control-allow-credentials']).toBe('true');
      const preflight = await send('OPTIONS', `${base}/ping`, {
        Origin: WEB_APP,
        'Access-Control-Request-Method': 'PATCH',
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers['access-control-allow-methods']).toContain(
        'PATCH',
      );
    });

    it('another site: 403 with a readable message; the route is not run', async () => {
      const answer = await send('GET', `${base}/ping`, {
        Origin: 'https://evil.example.com',
      });
      expect(answer.status).toBe(403);
      expect(answer.headers['access-control-allow-origin']).toBeUndefined();
      const body = JSON.parse(answer.body) as {
        statusCode: number;
        message: string;
        path: string;
      };
      expect(body).toMatchObject({
        statusCode: 403,
        message: REFUSED_ORIGIN_MESSAGE,
        path: '/ping',
      });
      const preflight = await send('OPTIONS', `${base}/ping`, {
        Origin: 'https://evil.example.com',
        'Access-Control-Request-Method': 'DELETE',
      });
      expect(preflight.status).toBe(403);
      expect(routeCalls).toBe(0);
    });

    it('no Origin (curl, a server) and the API pages themselves: answered', async () => {
      expect((await send('GET', `${base}/ping`)).status).toBe(200);
      const own = await send('GET', `${base}/ping`, { Origin: base });
      expect(own.status).toBe(200);
      expect(routeCalls).toBe(2);
    });
  });
});
