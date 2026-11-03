// Tests of scripts/escaped-text.mjs. Run from the server folder:
//   node --test scripts/escaped-text.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, connectionHint, escapesIn, fieldReport, fixedValue, preview, selectFor } from './escaped-text.mjs';

const field = (table, column) => FIELDS.find((one) => one.table === table && one.column === column);

test('the fields: names, cities and phones, and the course texts', () => {
  assert.deepEqual(
    FIELDS.map((one) => `${one.table}.${one.column}`),
    ['User.firstName', 'User.lastName', 'User.phone', 'Center.name', 'Center.location', 'Center.contactPhone', 'Stage.title', 'Stage.description', 'Stage.category', 'Stage.level'],
  );
  assert.deepEqual(FIELDS.filter((one) => one.personal).map((one) => one.column), ['firstName', 'lastName', 'phone', 'contactPhone']);
  assert.equal(
    selectFor(field('Center', 'name')),
    `SELECT id, "name" AS value FROM "Center" WHERE "name" ~ '&(amp|lt|gt|quot|#39);' ORDER BY id`,
  );
});

test('the escapes found, and the value once fixed', () => {
  assert.equal(escapesIn('R&amp;D &amp; Co &lt;3'), '&amp; x2, &lt; x1');
  assert.equal(escapesIn('R&D Academy'), '');
  assert.equal(fixedValue('R&amp;D Academy', 'plain'), 'R&D Academy');
  // One level only: "&amp;amp;" was "&amp;" typed by someone
  assert.equal(fixedValue('a &amp;amp; b', 'text'), 'a &amp; b');
  // Course texts get "<" and ">" back; names drop them, like the forms today
  assert.equal(fixedValue('List&lt;T&gt; &amp;&amp; more', 'text'), 'List<T> && more');
  assert.equal(fixedValue('Sami &lt;b&gt;', 'plain'), 'Sami b');
  assert.equal(fixedValue('Tom &quot;Code&quot; Jerry&#39;s', 'plain'), `Tom "Code" Jerry's`);
  assert.equal(fixedValue('&copy; and &nbsp; stay', 'text'), '&copy; and &nbsp; stay');
});

test('the report: values of courses and academies, never those of people', () => {
  assert.deepEqual(fieldReport(field('Stage', 'title'), []), ['Stage.title: none']);
  assert.deepEqual(fieldReport(field('Center', 'name'), [{ id: 'c1', value: 'R&amp;D Academy' }]), [
    'Center.name: 1 value to fix',
    '  c1  "R&amp;D Academy" -> "R&D Academy"',
  ]);
  const people = fieldReport(field('User', 'lastName'), [{ id: 'u1', value: 'Ben Salah &amp; Co' }]);
  assert.deepEqual(people, ['User.lastName: 1 value to fix', '  u1  (value not shown: personal)  &amp; x1']);
  assert.equal(people.join(' ').includes('Salah'), false);
  const many = Array.from({ length: 23 }, (_, i) => ({ id: `s${i}`, value: 'A &amp; B' }));
  const lines = fieldReport(field('Stage', 'category'), many);
  assert.equal(lines[0], 'Stage.category: 23 values to fix');
  assert.equal(lines.length, 22);
  assert.equal(lines[21], '  ... and 3 more');
  assert.equal(preview(`Line one\n\nline two ${'x'.repeat(80)}`).length, 70);
});

test('connection problems: what to check, never the address', () => {
  assert.equal(connectionHint({ code: 'ECONNREFUSED' }), 'the database does not answer (is PostgreSQL running?)');
  assert.equal(connectionHint({ code: '28P01', message: 'password authentication failed for user "lms"' }), 'the database refused the user or the password (check DATABASE_URL in server/.env)');
  assert.equal(connectionHint({ code: 'NO_URL' }), 'DATABASE_URL is not set (server/.env)');
  assert.equal(connectionHint(new Error('postgres://lms:secret@db/lms')), 'the database could not be read');
  assert.equal(connectionHint({ code: '42P01' }), 'the database could not be read (code 42P01)');
});
