/**
 * Prohibited names and words configuration.
 * Contains forbidden words, hate speech, and profanity that must be blocked
 * from being chosen as names or usernames.
 * 
 * NOTE: Add entries in lowercase. Matching applies normalization for leetspeak,
 * symbol substitutions, and repeated letters.
 */

export const PROHIBITED_NAMES: string[] = [
  // Harmless placeholder words for automated testing
  'prohibitedname',
  'badword',
  'testslur',

  // Offensive slurs and severe profanity
  'nigger',
  'nigga',
  'chink',
  'kike',
  'spic',
  'faggot',
  'retard',
  'gook',
  'wetback',
  'coon'
];
