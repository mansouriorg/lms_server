// Tests of scripts/make-platform-admin.mjs. Run from the server folder:
//   node --test scripts/make-platform-admin.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDirectAddress, maskEmail, planFor, readArgs } from './make-platform-admin.mjs';

test('the words given: one email, and --yes to make the change', () => {
  assert.deepEqual(readArgs([]), { email: '', apply: false });
  assert.deepEqual(readArgs([' Amira@Example.COM ']), { email: 'amira@example.com', apply: false });
  assert.deepEqual(readArgs(['amira@example.com', '--yes']), { email: 'amira@example.com', apply: true });
  assert.deepEqual(readArgs(['--yes', 'amira@example.com']), { email: 'amira@example.com', apply: true });
  assert.deepEqual(readArgs(['--', 'amira@example.com', '--yes']), { email: 'amira@example.com', apply: true });
  assert.match(readArgs(['amira@example.com', '--force']).error, /^Unknown option --force\./);
  assert.match(readArgs(['a@example.com', 'b@example.com']).error, /^Give one email only\./);
  assert.match(readArgs(['amira']).error, /is not an email address/);
});

test('emails are masked, only direct addresses are used', () => {
  assert.equal(maskEmail('amira@example.com'), 'a***@example.com');
  assert.equal(maskEmail('nobody'), '***');
  assert.equal(isDirectAddress('postgres://postgres:postgres@localhost:51218/template1'), true);
  assert.equal(isDirectAddress('postgresql://me:pass@db:5432/lms'), true);
  assert.equal(isDirectAddress('prisma+postgres://localhost:51213/?api_key=x'), false);
  assert.equal(isDirectAddress(undefined), false);
});

test('what happens to the account found', () => {
  const email = 'amira@example.com';
  assert.deepEqual(planFor(null, email, true), {
    change: false,
    text: 'No account with the email a***@example.com. Create it first with Sign up in the app.',
  });
  assert.equal(planFor({ id: 'u1', role: 'SUPER_ADMIN' }, email, true).change, false);
  assert.match(planFor({ id: 'u1', role: 'SUPER_ADMIN' }, email, true).text, /already a platform admin/);
  const preview = planFor({ id: 'u1', role: 'STUDENT' }, email, false);
  assert.equal(preview.change, false);
  assert.match(preview.text, /^a\*\*\*@example\.com is a student now and would become a platform admin \(SUPER_ADMIN\)/);
  assert.match(preview.text, /Nothing was changed\. To do it, run the same command with --yes at the end\.$/);
  assert.equal(preview.text.includes('amira@'), false);
  assert.deepEqual(planFor({ id: 'u1', role: 'CENTER_ADMIN' }, email, true), {
    change: true,
    text: 'a***@example.com is an academy admin now: making it a platform admin (SUPER_ADMIN).',
  });
});
