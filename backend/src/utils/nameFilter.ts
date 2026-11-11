import { PROHIBITED_NAMES } from '../config/prohibitedNames.js';

/**
 * Normalizes text to detect obfuscated variants (leetspeak, repeated characters, punctuation).
 */
export function normalizeForModeration(input: string): { raw: string; stripped: string; collapsed: string } {
  if (!input || typeof input !== 'string') {
    return { raw: '', stripped: '', collapsed: '' };
  }

  const raw = input.toLowerCase();

  // Leetspeak / common homoglyph substitutions
  const charMap: Record<string, string> = {
    '0': 'o',
    '1': 'i',
    '!': 'i',
    '|': 'i',
    '3': 'e',
    '4': 'a',
    '@': 'a',
    '5': 's',
    '$': 's',
    '7': 't',
    '+': 't',
    '8': 'b',
    '9': 'g',
  };

  let mapped = '';
  for (const ch of raw) {
    mapped += charMap[ch] || ch;
  }

  // Strip whitespace, hyphens, underscores, dots, asterisks, and non-alphanumerics
  const stripped = mapped.replace(/[^a-z0-9]/g, '');

  // Collapse consecutive repeated characters (e.g. "bbaaddwword" -> "badword")
  const collapsed = stripped.replace(/(.)\1+/g, '$1');

  return { raw, stripped, collapsed };
}

/**
 * Returns true if the given input contains any prohibited word.
 * Guards against Scunthorpe false positives on short words (e.g. "second" containing "coon").
 */
export function isProhibitedName(input: string): boolean {
  if (!input || typeof input !== 'string') return false;

  const { raw, stripped, collapsed } = normalizeForModeration(input);

  for (const term of PROHIBITED_NAMES) {
    const termLower = term.toLowerCase().trim();
    if (!termLower) continue;

    if (termLower.length >= 5) {
      // Substring match on raw, stripped, and collapsed forms
      const collapsedTerm = termLower.replace(/(.)\1+/g, '$1');
      if (raw.includes(termLower) || stripped.includes(termLower) || collapsed.includes(collapsedTerm)) {
        return true;
      }
    } else {
      // Short terms (<= 4 chars): match word boundaries or exact standalone tokens
      const wordBoundaryRegex = new RegExp(`(^|[^a-z0-9])${termLower}([^a-z0-9]|$)`, 'i');
      if (wordBoundaryRegex.test(raw) || stripped === termLower || collapsed === termLower) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validates that a name or username is acceptable.
 * Throws a clean 422 error without echoing or logging the rejected word.
 */
export function assertAllowedName(name: string | undefined | null): void {
  if (!name) return;
  if (isProhibitedName(name)) {
    throw { status: 422, message: 'Please choose a different name.' };
  }
}
