// src/common/text.ts
// For @Transform in DTOs. The client shows every text it gets as text (React
// escapes it), so nothing is stored as HTML. Other values (a number, null)
// are left as they are, for the validators to refuse them with a 400.

// tsconfig.json has no esModuleInterop, so this package must be imported this
// way: a default import is undefined at run time and every request crashes.
import * as sanitizeHtml from 'sanitize-html';

// Course, module and lesson texts: only the spaces around are removed. They
// are kept as typed, because they can contain code such as `List<T>` or
// `a && b` (sanitize-html would store "List" and "a &amp;&amp; b").
export const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

// Email addresses: no spaces around, in lower case.
export const emailText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

// Names, cities and phone numbers: they never need HTML, so tags are removed
// (with what is inside <script> and <style>), and so are "<" and ">". "&"
// stays "&": sanitize-html alone stores "R&D" as "R&amp;D", which the pages
// then show as is. A value saved that way before is fixed when it is sent
// again. The spaces around are removed.
export const withoutHtml = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const cleaned = sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return cleaned
    .replace(/&(amp|lt|gt);/g, (_entity, name: string) =>
      name === 'amp' ? '&' : '',
    )
    .trim();
};
