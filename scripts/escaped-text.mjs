// Texts saved with HTML escapes such as "&amp;" (shown as is on the pages).
// Until the input cleaning was fixed (src/common/text.ts), sanitize-html
// stored "R&D Academy" as "R&amp;D Academy" in these fields of the sign-up,
// profile, course and academy forms. Used by scripts/check-escaped-text.mjs,
// which only reads the database; tested by scripts/escaped-text.test.mjs.

// The fields that went through sanitize-html. `kind`: 'plain' for names,
// cities and phones (cleaned today by withoutHtml: "<" and ">" are dropped),
// 'text' for course texts (kept as typed today). `personal`: the value is
// about a person, so the report never prints it.
export const FIELDS = [
  { table: 'User', column: 'firstName', kind: 'plain', personal: true },
  { table: 'User', column: 'lastName', kind: 'plain', personal: true },
  { table: 'User', column: 'phone', kind: 'plain', personal: true },
  { table: 'Center', column: 'name', kind: 'plain', personal: false },
  { table: 'Center', column: 'location', kind: 'plain', personal: false },
  { table: 'Center', column: 'contactPhone', kind: 'plain', personal: true },
  { table: 'Stage', column: 'title', kind: 'text', personal: false },
  { table: 'Stage', column: 'description', kind: 'text', personal: false },
  { table: 'Stage', column: 'category', kind: 'text', personal: false },
  { table: 'Stage', column: 'level', kind: 'text', personal: false },
];

// The escapes sanitize-html writes (and two for quotes, in case)
const ESCAPE = /&(amp|lt|gt|quot|#39);/g;
// The same test for PostgreSQL (a regular expression with ~)
export const SQL_PATTERN = '&(amp|lt|gt|quot|#39);';

// The read-only query of one field: every row whose value has an escape
export function selectFor(field) {
  return `SELECT id, "${field.column}" AS value FROM "${field.table}" WHERE "${field.column}" ~ '${SQL_PATTERN}' ORDER BY id`;
}

// The escapes found in a value, with how many of each: "&amp; x2, &lt; x1"
export function escapesIn(value) {
  const counts = new Map();
  for (const match of value.matchAll(ESCAPE)) counts.set(match[0], (counts.get(match[0]) ?? 0) + 1);
  return [...counts].map(([escape, count]) => `${escape} x${count}`).join(', ');
}

// What the value would become once fixed (one level of escapes undone, like
// the forms do today): "&amp;" gives "&", quotes come back; "<" and ">" come
// back in course texts but are dropped from names, cities and phones.
export function fixedValue(value, kind) {
  return value.replace(ESCAPE, (_escape, name) => {
    if (name === 'amp') return '&';
    if (name === 'quot') return '"';
    if (name === '#39') return "'";
    if (kind === 'plain') return '';
    return name === 'lt' ? '<' : '>';
  });
}

// A value on one line, cut after `max` characters
export function preview(value, max = 70) {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 3)}...` : line;
}

// The report lines of one field. `rows`: [{ id, value }] from selectFor.
// At most `limit` rows are listed; personal values are never printed.
export function fieldReport(field, rows, limit = 20) {
  const name = `${field.table}.${field.column}`;
  if (rows.length === 0) return [`${name}: none`];
  const lines = [`${name}: ${rows.length} ${rows.length === 1 ? 'value' : 'values'} to fix`];
  for (const row of rows.slice(0, limit)) {
    if (field.personal) {
      lines.push(`  ${row.id}  (value not shown: personal)  ${escapesIn(row.value)}`);
    } else {
      lines.push(`  ${row.id}  "${preview(row.value)}" -> "${preview(fixedValue(row.value, field.kind))}"`);
    }
  }
  if (rows.length > limit) lines.push(`  ... and ${rows.length - limit} more`);
  return lines;
}

// A connection error, without the address or the password of the database
export function connectionHint(error) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'ECONNREFUSED') return 'the database does not answer (is PostgreSQL running?)';
  if (code === 'ENOTFOUND') return 'the database host is unknown (check DATABASE_URL in server/.env)';
  if (code === '28P01' || code === '28000') return 'the database refused the user or the password (check DATABASE_URL in server/.env)';
  if (code === '3D000') return 'the database named in DATABASE_URL does not exist';
  if (code === 'NO_URL') return 'DATABASE_URL is not set (server/.env)';
  return `the database could not be read${code === '' ? '' : ` (code ${code})`}`;
}
