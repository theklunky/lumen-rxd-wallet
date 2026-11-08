/**
 * Password policy, aligned with NIST SP 800-63B §5.1.1 ("Memorized Secret
 * Verifiers").
 *
 *  - Minimum length of 8 characters is *required*; up to 1024 are accepted
 *    (NIST requires at least 64) and nothing is ever truncated.
 *  - No composition rules: no forced uppercase/digits/symbols — length and
 *    unpredictability are what matter.
 *  - New passwords are compared against a blocklist of commonly used /
 *    breached values, repeated characters, simple sequences and keyboard
 *    walks, instead of enforcing character classes.
 *  - Length is counted in Unicode code points, so emoji and other characters
 *    count as themselves.
 *  - Paste stays enabled (password managers are encouraged).
 *
 * Rate limiting of failed unlock attempts (§5.1.1.2) lives in the unlock view.
 */

/** Hard minimum (NIST 800-63B §5.1.1 requires at least 8). */
export const MIN_PASSWORD_LENGTH = 8;
/** Advisory minimum shown in the UI (NIST 800-63-4 moves single-factor secrets to 15). */
export const RECOMMENDED_PASSWORD_LENGTH = 12;
/** Generous ceiling; well above the 64 characters NIST requires us to accept. */
export const MAX_PASSWORD_LENGTH = 1024;

/**
 * Commonly used / previously breached secrets plus wallet-specific terms.
 * Compared exactly (case-insensitive, NFKC-normalised) — substring matches
 * only ever produce a suggestion, never a rejection.
 */
const COMMON_PASSWORDS: readonly string[] = [
  "password", "password1", "password12", "password123", "password1234",
  "passw0rd", "p@ssw0rd", "p@ssword", "passphrase", "pass", "secret",
  "letmein", "letmein1", "welcome", "welcome1", "welcome123", "admin",
  "administrator", "root", "toor", "login", "guest", "user", "test",
  "test1234", "testing", "changeme", "changeit", "default", "temp1234",
  "iloveyou", "sunshine", "princess", "dragon", "monkey", "football",
  "baseball", "superman", "batman", "trustno1", "master", "shadow",
  "michael", "jennifer", "hunter2", "qwerty", "qwerty123", "qwertyuiop",
  "qwerty1234", "asdfghjk", "asdfghjkl", "zxcvbnm", "zxcvbnm1", "1q2w3e4r",
  "1qaz2wsx", "qazwsxedc", "abc12345", "abc123456", "abcd1234",
  "abcd123456", "a1b2c3d4", "12345678", "123456789", "1234567890",
  "0123456789", "11111111", "00000000", "88888888", "87654321", "11223344",
  "12121212", "bitcoin", "bitcoin123", "satoshi", "nakamoto", "blockchain",
  "crypto", "cryptocurrency", "wallet", "wallet123", "mywallet",
  "seedphrase", "mnemonic", "recovery", "recoveryphrase", "rxd",
  "radiant", "radiant123", "lumen", "lumen123", "lumenrxd", "glyph",
  "photon", "electrum",
];

/** Exact-match context words: the app, its coin and its vocabulary. */
const CONTEXT_WORDS: readonly string[] = [
  "lumen", "lumenrxd", "lumenwallet", "lumenrxdwallet", "rxd", "radiant",
  "radiantcore", "wallet", "glyph", "wave", "photon", "photons",
];

/** Substrings that prompt a *suggestion* (never a hard rejection). */
const DISCOURAGED_SUBSTRINGS: readonly string[] = [
  "password", "passphrase", "secret", "qwerty", "letmein", "admin",
  "wallet", "lumen", "radiant", "rxd",
];

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];

export interface PasswordAssessment {
  /** True when every hard requirement is satisfied. */
  ok: boolean;
  /** Hard failures — the password cannot be used. */
  problems: string[];
  /** Advisory hints (length, reuse, discouraged words). */
  suggestions: string[];
  /** Length in Unicode code points. */
  length: number;
  /** First problem, ready to display. */
  message: string | null;
}

/** Count characters the way NIST does: one per code point, not UTF-16 unit. */
export function passwordLength(password: string): number {
  return [...password].length;
}

/** Normalise only for comparison; the stored secret is used verbatim. */
function normalizeForComparison(password: string): string {
  return password.normalize("NFKC").toLowerCase();
}

function isRepeatedCharacter(password: string): boolean {
  return /^(.)\1+$/su.test(password);
}

function isSimpleSequence(password: string): boolean {
  const value = password.toLowerCase();
  if (value.length < 4) return false;
  const sequences = [...KEYBOARD_ROWS, "abcdefghijklmnopqrstuvwxyz", "0123456789"];
  for (const seq of sequences) {
    const variants = [seq, [...seq].reverse().join("")];
    for (const variant of variants) {
      for (let i = 0; i + value.length <= variant.length; i++) {
        if (variant.slice(i, i + value.length) === value) return true;
      }
    }
  }
  return false;
}

/**
 * Assess a candidate password. Hard rules: length bounds, blocklist,
 * repetition and sequences. Everything else is guidance only.
 */
export function assessPassword(password: string): PasswordAssessment {
  const length = passwordLength(password);
  const problems: string[] = [];
  const suggestions: string[] = [];
  const normalized = normalizeForComparison(password);

  if (length < MIN_PASSWORD_LENGTH) {
    problems.push(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters — yours is ${length}.`,
    );
  } else if (length > MAX_PASSWORD_LENGTH) {
    problems.push(
      `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer — yours is ${length}.`,
    );
  }

  if (password.length > 0) {
    if (COMMON_PASSWORDS.includes(normalized) || CONTEXT_WORDS.includes(normalized)) {
      problems.push(
        "That password is on the list of commonly used or breached passwords — choose something unique.",
      );
    }
    if (isRepeatedCharacter(password)) {
      problems.push("Avoid repeating one character — use a longer, more varied password.");
    }
    if (isSimpleSequence(password)) {
      problems.push("Avoid simple sequences or keyboard patterns (e.g. 12345678, qwerty).");
    }
    if (length < RECOMMENDED_PASSWORD_LENGTH) {
      suggestions.push(
        `At least ${RECOMMENDED_PASSWORD_LENGTH} characters is recommended — longer is meaningfully stronger.`,
      );
    }
    if (DISCOURAGED_SUBSTRINGS.some((word) => normalized.includes(word))) {
      suggestions.push(
        "Avoid words like “wallet”, “password”, “lumen” or “rxd” — they are the first things guessed.",
      );
    }
    const distinct = new Set([...normalized]).size;
    if (length >= MIN_PASSWORD_LENGTH && distinct <= Math.max(3, Math.floor(length / 3))) {
      suggestions.push("Use more distinct characters — repeated patterns are easy to guess.");
    }
  }

  suggestions.push("A short sentence of several words is strong and easy to remember.");
  suggestions.push("Don’t reuse a password from another service.");

  return {
    ok: problems.length === 0,
    problems,
    suggestions,
    length,
    message: problems[0] ?? null,
  };
}

