// Tests of scripts/lms-db-url.mjs. Run from the server folder:
//   node --test scripts/lms-db-url.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envReport, portFromList, urlForPort } from './lms-db-url.mjs';

const B = (text) => `\x1b[1m${text}\x1b[0m`;
const LINK = (target, text) => `\x1b]8;;${target}\x1b\\${text}\x1b]8;;\x1b\\`;
const TCP = 'postgres://postgres:postgres@localhost:51218/template1?sslmode=disable&connection_limit=10';
const HTTP = 'prisma+postgres://localhost:51217/?api_key=eyJuYW1lIjoibG1zIn0';

// What `prisma dev ls` printed on this computer (with its styles and links)
const LISTED = [
  ` ${B('name')}     ${B('status')}       ${B('urls')}`,
  ' default  not_running',
  ` lms      running      ${B('DATABASE_URL')}:`,
  `                       ${LINK(HTTP, HTTP)}`,
  `                       ${B('STREAM')}: ${LINK('http://127.0.0.1:51220/v1/stream/prisma-wal', 'http://127.0.0.1:51220/v1/stream/prisma-')}`,
  `                       ${B('TCP')}:`,
  `                       ${LINK(TCP, 'postgres://postgres:postgres@localhost:51218/...')}`,
  `                       ${B('Terminal')}: ${LINK('psql -h localhost -p 51218', 'psql -h localhost -p 51218 ...')}`,
].join('\n');

test('the port of lms in the list, not the one of another database', () => {
  assert.equal(portFromList(LISTED, 'lms'), 51218);
  assert.equal(portFromList(LISTED, 'default'), null);
  // Another database running before lms: its port is not taken
  const both = LISTED.replace(' default  not_running', ` default  running      ${B('TCP')}:\n   postgres://postgres:postgres@localhost:51214/template1`);
  assert.equal(portFromList(both, 'default'), 51214);
  assert.equal(portFromList(both, 'lms'), 51218);
  // Without styles or links, on Windows line ends
  assert.equal(portFromList(' name status urls\r\n lms running\r\n   TCP: postgres://postgres:postgres@localhost:51318/template1\r\n', 'lms'), 51318);
});

test('lms stopped, missing, or only the prisma+postgres kind: no port', () => {
  assert.equal(portFromList(' name status urls\n default  not_running\n lms      not_running', 'lms'), null);
  assert.equal(portFromList(' name status urls\n default  running  postgres://postgres:postgres@localhost:51214/x', 'lms'), null);
  assert.equal(portFromList(` lms running ${HTTP}`, 'lms'), null);
  assert.equal(portFromList('', 'lms'), null);
  assert.equal(urlForPort(51218), 'postgres://postgres:postgres@localhost:51218/template1?sslmode=disable');
});

test('does server/.env point to lms? Only the kind and the port are told', () => {
  assert.equal(envReport(urlForPort(51218), 51218), 'server/.env points to lms: yes (port 51218).');
  const other = envReport('prisma+postgres://localhost:51213/?api_key=SECRET', 51218);
  assert.equal(other, 'server/.env points to lms: no (it has the prisma+postgres kind, port 51213; lms is on port 51218).');
  assert.equal(other.includes('SECRET'), false);
  const wrongPort = envReport('postgresql://me:pass@localhost:51214/template1', 51218);
  assert.equal(wrongPort, 'server/.env points to lms: no (it has the postgresql kind, port 51214; lms is on port 51218).');
  assert.equal(wrongPort.includes('pass'), false);
  assert.equal(envReport(undefined, 51218), 'server/.env has no DATABASE_URL.');
  assert.equal(envReport('not an address', 51218), 'server/.env has a DATABASE_URL that is not a valid address.');
});
