import { envSchema } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/lms',
  FRONTEND_URLS: 'http://localhost:3000',
  JWT_SECRET: 'a'.repeat(32),
};

describe('environment variables (checked when the server starts)', () => {
  it('a complete configuration passes, with defaults for the rest', () => {
    const result = envSchema.validate(valid);
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      value: { NODE_ENV: 'development', PORT: 3001 },
    });
  });

  it('no JWT_SECRET: the server refuses to start', () => {
    const result = envSchema.validate({
      DATABASE_URL: valid.DATABASE_URL,
      FRONTEND_URLS: valid.FRONTEND_URLS,
    });
    expect(result.error?.message).toContain('JWT_SECRET');
  });

  it('a JWT_SECRET shorter than 32 characters: refused', () => {
    const result = envSchema.validate({ ...valid, JWT_SECRET: 'change-me' });
    expect(result.error?.message).toContain('32');
  });

  it('no DATABASE_URL: refused', () => {
    const result = envSchema.validate({ ...valid, DATABASE_URL: undefined });
    expect(result.error?.message).toContain('DATABASE_URL');
  });
});
