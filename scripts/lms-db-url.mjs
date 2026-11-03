// The direct address of this app's local database "lms" (prisma dev), read
// from `prisma dev ls`. Prisma chooses the ports of a local database when it
// creates it (on this computer: 51217 to 51220), so they are not written in
// the project. Run from the server folder:
//   node scripts/lms-db-url.mjs        prints the address (exit 1: lms is not running)
//   node scripts/lms-db-url.mjs --env  says whether server/.env points to lms (no address printed)
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

// The user and the password are the fixed ones of Prisma's local database
export function urlForPort(port) {
  return `postgres://postgres:postgres@localhost:${port}/template1?sslmode=disable`;
}

// Text styles (bold...) of the terminal, removed to read the rows of the table
const STYLES = /\x1b\[[0-9;]*m/g;
// A row of the table: the name of a local database, then its status
const ROW = /^\s*([A-Za-z0-9_.-]+)\s+(running|not_running)(\s|$)/;
// A direct address (not the prisma+postgres:// kind): its port
const TCP = /(^|[^+a-z])postgres:\/\/[^@\s]+@(localhost|127\.0\.0\.1):([0-9]+)\//;

// The database port of the local database `name` in the output of
// `prisma dev ls`, or null when it is not listed or not running
export function portFromList(output, name) {
  let inside = false;
  for (const line of output.split(/\r?\n/)) {
    const row = line.replace(STYLES, '').match(ROW);
    if (row) {
      if (inside) return null;
      inside = row[1] === name && row[2] === 'running';
    }
    if (inside) {
      const tcp = line.match(TCP);
      if (tcp) return Number(tcp[3]);
    }
  }
  return null;
}

// Whether an address points to the database on `port` (only the kind and the
// port are told, never the user, the password or a key)
export function envReport(address, port) {
  if (typeof address !== 'string' || address === '') return 'server/.env has no DATABASE_URL.';
  let url;
  try {
    url = new URL(address);
  } catch {
    return 'server/.env has a DATABASE_URL that is not a valid address.';
  }
  const kind = url.protocol.replace(':', '');
  const direct = kind === 'postgres' || kind === 'postgresql';
  if (direct && url.port === String(port)) return `server/.env points to lms: yes (port ${port}).`;
  return `server/.env points to lms: no (it has the ${kind} kind, port ${url.port || 'default'}; lms is on port ${port}).`;
}

function main() {
  const list = spawnSync('pnpm', ['exec', 'prisma', 'dev', 'ls'], { encoding: 'utf8' });
  const port = portFromList(`${list.stdout ?? ''}\n${list.stderr ?? ''}`, 'lms');
  if (port === null) {
    console.error('The local database lms is not running (pnpm -s db:start starts it).');
    return 1;
  }
  if (process.argv.includes('--env')) {
    dotenv.config({ quiet: true });
    console.log(envReport(process.env.DATABASE_URL, port));
    return 0;
  }
  console.log(urlForPort(port));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
