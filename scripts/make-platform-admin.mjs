// Makes an existing account a platform admin (role SUPER_ADMIN): the first
// one cannot be made from the app. Run from the server folder:
//   pnpm -s admin:make                      how many accounts and platform admins (read only)
//   pnpm -s admin:make you@example.com      what would change (read only)
//   pnpm -s admin:make you@example.com --yes   makes the change
// The database is the one of DATABASE_URL (server/.env), like the API. It
// must be a direct postgres:// address. Only the role of that one account
// changes; the email is shown masked, no other value is printed.
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const USAGE = 'Usage: pnpm -s admin:make you@example.com (shows what would change), then the same with --yes.';

// The email and whether to make the change, or the reason the words are refused
export function readArgs(given) {
  // A lone "--" (pnpm may pass it on) is not a word of its own
  const words = given.filter((word) => word !== '--');
  const flags = words.filter((word) => word.startsWith('--'));
  const rest = words.filter((word) => word.startsWith('--') === false);
  const unknown = flags.filter((flag) => flag !== '--yes');
  if (unknown.length > 0) return { error: `Unknown option ${unknown[0]}. ${USAGE}` };
  if (rest.length > 1) return { error: `Give one email only. ${USAGE}` };
  const email = rest.length === 0 ? '' : rest[0].trim().toLowerCase();
  if (email !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) === false) {
    return { error: `"${maskEmail(email)}" is not an email address. ${USAGE}` };
  }
  return { email, apply: flags.includes('--yes') };
}

// "amira@example.com" is shown as "a***@example.com"
export function maskEmail(email) {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

// Only a direct address reaches the database with the pg driver
export function isDirectAddress(address) {
  return typeof address === 'string' && /^postgres(ql)?:\/\//.test(address);
}

// What the command says about the account found (null: no account)
export function planFor(account, email, apply) {
  const shown = maskEmail(email);
  if (account === null) return { change: false, text: `No account with the email ${shown}. Create it first with Sign up in the app.` };
  if (account.role === 'SUPER_ADMIN') return { change: false, text: `${shown} is already a platform admin: nothing to change.` };
  const before = account.role === 'CENTER_ADMIN' ? 'an academy admin' : 'a student';
  if (apply === false) {
    return {
      change: false,
      text: `${shown} is ${before} now and would become a platform admin (SUPER_ADMIN), who manages every academy. Nothing was changed. To do it, run the same command with --yes at the end.`,
    };
  }
  return { change: true, text: `${shown} is ${before} now: making it a platform admin (SUPER_ADMIN).` };
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.error) {
    console.log(args.error);
    return 1;
  }
  dotenv.config({ quiet: true });
  if (isDirectAddress(process.env.DATABASE_URL) === false) {
    console.log('server/.env must point to the database with a direct postgres:// address (see the README, Local database).');
    return 1;
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  client.on('error', () => undefined);
  try {
    await client.connect();
  } catch (error) {
    console.log(`The database does not answer (code ${error.code ?? 'unknown'}): is it running? (pnpm -s db:start)`);
    return 1;
  }
  try {
    // This app's accounts have a "role" column (another project's may not)
    const columns = await client.query(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User' AND column_name IN ('role', 'email')",
    );
    if (columns.rows.length < 2) {
      console.log('This database does not hold the accounts of this app: nothing was changed.');
      return 1;
    }
    const counts = await client.query(
      "SELECT count(*)::int AS accounts, count(*) FILTER (WHERE role = 'SUPER_ADMIN')::int AS admins FROM \"User\"",
    );
    console.log(`Accounts: ${counts.rows[0].accounts}. Platform admins: ${counts.rows[0].admins}.`);
    if (args.email === '') {
      console.log(USAGE);
      return 0;
    }
    const found = await client.query('SELECT id, role FROM "User" WHERE lower(email) = $1', [args.email]);
    const plan = planFor(found.rows[0] ?? null, args.email, args.apply);
    console.log(plan.text);
    if (plan.change === false) return found.rows.length === 0 ? 1 : 0;
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE "User" SET role = 'SUPER_ADMIN', "updatedAt" = now() WHERE id = $1 AND role <> 'SUPER_ADMIN' RETURNING id`,
      [found.rows[0].id],
    );
    await client.query('COMMIT');
    console.log(
      updated.rows.length === 1
        ? `Done: ${maskEmail(args.email)} is now a platform admin. Reload the app in your browser: it opens the admin space.`
        : 'Nothing was changed: the account changed meanwhile.',
    );
    return 0;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.log(`Stopped, nothing was changed (code ${error.code ?? 'unknown'}).`);
    return 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      console.log('Stopped: an unexpected error happened, nothing was changed.');
      process.exitCode = 1;
    },
  );
}
