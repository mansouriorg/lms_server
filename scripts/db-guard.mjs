// Read only. Before the migrations are applied to the local database lms
// (scripts/setup-local-db.sh), this checks that the database at LMS_URL (the
// address scripts/lms-db-url.mjs found) is empty, or holds migrations of this
// app and nothing else, so the tables of another project are never touched.
// Exit code 0: go on; 1: stop.
import fs from 'node:fs';
import pg from 'pg';

const LMS_URL = process.env.LMS_URL ?? '';

const local = new Set(fs.readdirSync('prisma/migrations').filter((name) => /^[0-9]{14}_/.test(name)));
const client = new pg.Client({ connectionString: LMS_URL, connectionTimeoutMillis: 10000 });
client.on('error', () => undefined);
let code = 1;
try {
  if (LMS_URL === '') throw Object.assign(new Error('no address'), { code: 'NO_ADDRESS' });
  await client.connect();
  await client.query('BEGIN TRANSACTION READ ONLY');
  const tables = (
    await client.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    )
  ).rows.map((row) => row.name);
  if (tables.length === 0) {
    console.log('The database is new and empty: the app tables can be created.');
    code = 0;
  } else if (tables.includes('_prisma_migrations') === false) {
    console.log(`The database holds ${tables.length} tables and no migration history: it is not this app's.`);
  } else {
    const names = (await client.query('SELECT migration_name AS name FROM _prisma_migrations')).rows.map((row) => row.name);
    const foreign = names.filter((name) => local.has(name) === false);
    if (foreign.length === 0) {
      console.log(`The database already holds this app (${names.length} of its migrations): only the missing ones are applied.`);
      code = 0;
    } else {
      console.log(`The database holds migrations that are not this app's: ${foreign.join(', ')}.`);
    }
  }
  await client.query('ROLLBACK');
} catch (error) {
  console.log(`The database could not be read (code ${error.code ?? 'unknown'}).`);
} finally {
  await client.end().catch(() => undefined);
}
process.exitCode = code;
