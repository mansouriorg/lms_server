// src/config/cors.ts
// Which web sites may call the API from a browser (CORS). FRONTEND_URLS lists
// them, separated by commas; spaces, capitals and a final "/" do not matter,
// so "https://lms.example.com, https://www.lms.example.com/" works.
// A page from another site gets a 403 before the request reaches any route.
import type { INestApplication } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'http';

export const REFUSED_ORIGIN_MESSAGE =
  'This website is not allowed to use the API.';

// The web app on the developer's computer, when FRONTEND_URLS is empty
const LOCAL_WEB_APP = 'http://localhost:3000';

// "http://localhost:3000, https://LMS.example.com/" ->
// ["http://localhost:3000", "https://lms.example.com"]
export function parseOrigins(frontendUrls: string | undefined): string[] {
  const origins = (frontendUrls ?? '')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, '').toLowerCase())
    .filter((url) => url !== '');
  return origins.length > 0 ? [...new Set(origins)] : [LOCAL_WEB_APP];
}

// Allowed: a request without an Origin header (curl, another server, a
// mobile app), a page of a listed site, and a page of the API itself (the
// documentation at /api, whose origin has the same host as the request).
export function originAllowed(
  origin: string | undefined,
  allowed: string[],
  host: string | undefined,
): boolean {
  if (origin === undefined) return true;
  const value = origin.toLowerCase();
  if (allowed.includes(value)) return true;
  if (host === undefined) return false;
  try {
    return new URL(value).host === host.toLowerCase();
  } catch {
    return false;
  }
}

// Answers 403, in the same shape as every other error, to a page from a site
// that is not allowed; the request never reaches a route.
export function refuseOtherOrigins(allowed: string[]) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (originAllowed(req.headers.origin, allowed, req.headers.host)) {
      next();
      return;
    }
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        statusCode: 403,
        message: REFUSED_ORIGIN_MESSAGE,
        path: req.url,
        timestamp: new Date().toISOString(),
      }),
    );
  };
}

// Used by main.ts: the refusal first, then the CORS headers that let the
// listed sites read the answers (with the sign-in token).
export function applyCors(
  app: INestApplication,
  frontendUrls: string | undefined,
): string[] {
  const allowed = parseOrigins(frontendUrls);
  app.use(refuseOtherOrigins(allowed));
  app.enableCors({
    origin: allowed,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  return allowed;
}
