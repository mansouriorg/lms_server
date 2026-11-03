// src/config/api-docs.ts
// Whether the server shows its API documentation (Swagger, at /api). It lists
// every route and the shape of every request: useful while building the app,
// but also a map of the API for an attacker. So it is on in development and
// test, and off when NODE_ENV is production, unless API_DOCS says otherwise
// ("on" or "off", checked by src/config/env.schema.ts).
export function apiDocsEnabled(
  nodeEnv: string | undefined,
  apiDocs: string | undefined,
): boolean {
  if (apiDocs === 'on') return true;
  if (apiDocs === 'off') return false;
  return nodeEnv !== 'production';
}
