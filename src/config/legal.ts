// The version of the Terms of Service and the Privacy Policy that people
// accept: the date shown on the pages (LEGAL_UPDATED in client/lib/legal.ts).
// When the texts change, change both together: sign-up then asks for the new
// version (src/auth/terms.spec.ts checks that they are the same).
export const TERMS_VERSION = '2026-11-01';

// A version is a date: 2026-11-01
export const TERMS_VERSION_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export const TERMS_REQUIRED =
  'Please confirm that you are 18 or older and that you accept the Terms of Service and the Privacy Policy.';

export const TERMS_VERSION_MISSING =
  'The version of the Terms of Service is missing. Reload the page and try again.';

// The page showed another version than the current one
export const TERMS_CHANGED =
  'The Terms of Service or the Privacy Policy changed since this page was opened. Reload the page and read them again.';
