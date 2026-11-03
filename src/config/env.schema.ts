// src/config/env.schema.ts
// The environment variables the server needs (see server/.env.example).
// The server refuses to start when one is missing or wrong: ConfigModule in
// app.module.ts validates them with this schema.
import * as Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3001),
  DATABASE_URL: Joi.string().required(),
  // Comma-separated web app origins allowed to call the API (CORS)
  FRONTEND_URLS: Joi.string().required(),
  // Signs the login tokens: at least 32 random characters
  // (for example the output of `openssl rand -hex 32`)
  JWT_SECRET: Joi.string().min(32).required(),
  // The API documentation at /api: "on" or "off". When it is not set, the
  // documentation is on, except when NODE_ENV is production
  // (src/config/api-docs.ts).
  API_DOCS: Joi.string().valid('on', 'off').allow(''),
});
