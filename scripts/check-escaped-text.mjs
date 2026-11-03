// Lists the texts saved with HTML escapes such as "&amp;" (see
// scripts/escaped-text.mjs). It only reads: the queries run in a READ ONLY
// transaction, so PostgreSQL refuses any change, and the transaction is
// rolled back at the end. Run from the server folder:
//   pnpm -s check:escaped-text
// The database is the one of DATABASE_URL (server/.env), like the API; the
// address and the password are never printed.
import dotenv from 'dotenv';
import pg from 'pg';
import { FIELDS, connectionHint, fieldReport, selectFor } from './escaped-text.mjs';

dotenv.config({ quiet: true });

async function main() {
  console.log('Texts saved with HTML escapes such as "&amp;" (read only, nothing is changed):');
  if (typeof process.env.DATABASE_URL !== 'string' || process.env.DATABASE_URL === '') {
    console.log(`Could not check: ${connectionHint({ code: 'NO_URL' })}.`);
    return 1;
  }
  // At most 10 seconds to connect; an error of the connection later is
  // reported by the query that meets it
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  client.on('error', () => undefined);
  try {
    await client.connect();
  } catch (error) {
    console.log(`Could not check: ${connectionHint(error)}.`);
    return 1;
  }
  let total = 0;
  const records = new Set();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    for (const field of FIELDS) {
      const { rows } = await client.query(selectFor(field));
      total += rows.length;
      for (const row of rows) records.add(`${field.table}:${row.id}`);
      for (const line of fieldReport(field, rows)) console.log(line);
    }
    await client.query('ROLLBACK');
  } catch (error) {
    console.log(`Could not finish the check: ${connectionHint(error)}.`);
    return 1;
  } finally {
    await client.end().catch(() => undefined);
  }
  console.log(
    total === 0
      ? 'Nothing to fix: no text has HTML escapes.'
      : `${total} ${total === 1 ? 'value' : 'values'} to fix, in ${records.size} ${records.size === 1 ? 'record' : 'records'}. Nothing was changed.`,
  );
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    console.log('Could not check: an unexpected error happened.');
    process.exitCode = 1;
  },
);
