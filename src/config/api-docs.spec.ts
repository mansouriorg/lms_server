import { readFileSync } from 'fs';
import { join } from 'path';
import { apiDocsEnabled } from './api-docs';
import { envSchema } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/lms',
  FRONTEND_URLS: 'http://localhost:3000',
  JWT_SECRET: 'a'.repeat(32),
};

describe('API documentation (Swagger at /api)', () => {
  it('on in development and test, off in production', () => {
    expect(apiDocsEnabled('development', undefined)).toBe(true);
    expect(apiDocsEnabled('test', undefined)).toBe(true);
    expect(apiDocsEnabled(undefined, undefined)).toBe(true);
    expect(apiDocsEnabled('production', undefined)).toBe(false);
    expect(apiDocsEnabled('production', '')).toBe(false);
  });

  it('API_DOCS=on or API_DOCS=off decides, whatever NODE_ENV is', () => {
    expect(apiDocsEnabled('production', 'on')).toBe(true);
    expect(apiDocsEnabled('development', 'off')).toBe(false);
    expect(apiDocsEnabled('test', 'off')).toBe(false);
  });

  it('API_DOCS is on, off or not set; anything else stops the server', () => {
    for (const API_DOCS of [undefined, 'on', 'off', '']) {
      expect(envSchema.validate({ ...valid, API_DOCS }).error).toBeUndefined();
    }
    const wrong = envSchema.validate({ ...valid, API_DOCS: 'yes' });
    expect(wrong.error?.message).toContain('API_DOCS');
  });

  it('main.ts sets up the documentation only when it is on', () => {
    const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');
    expect(main).toContain('const docs = apiDocsEnabled(');
    expect(main).toMatch(/if \(docs\) \{[^}]*SwaggerModule\.setup\('api'/);
    expect(main.split('SwaggerModule.setup(')).toHaveLength(2);
  });
});
