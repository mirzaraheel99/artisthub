/**
 * Pure referral-code parsing, free of any Expo or React Native import so it can
 * be unit-tested in plain Node.
 *
 * Codes are 7 characters from an alphabet that deliberately excludes 0 O 1 I L,
 * because they are read aloud across a loud room and typed off screenshots.
 * The generator never produces those glyphs, so a code containing one was
 * mistyped — rejecting it beats attributing the referral to nobody.
 */
const CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/;

export function normalizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/**
 * Pulls a referral code out of a link. Both shapes have to work, because a
 * link shared into a group chat opens the web page on a phone that does not
 * have the app yet, and the custom scheme once it does:
 *
 *   artisthub://join/ABC2345
 *   artisthub://ABC2345
 *   https://example.com/join/ABC2345
 *   https://example.com/?ref=ABC2345
 */
export function codeFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  for (const key of ['ref', 'code', 'r']) {
    const value = parsed.searchParams.get(key);
    if (value) {
      const code = normalizeCode(value);
      if (code) return code;
    }
  }

  // For a custom scheme the first segment lands in the host rather than the
  // path, so both are treated as candidate segments.
  const segments = [parsed.hostname, ...parsed.pathname.split('/')].filter(Boolean);

  const joinIndex = segments.findIndex((s) => s.toLowerCase() === 'join');
  if (joinIndex !== -1 && segments[joinIndex + 1]) {
    return normalizeCode(segments[joinIndex + 1]);
  }

  // A bare artisthub://ABC2345, which is also what someone types by hand.
  if (segments.length === 1) return normalizeCode(segments[0]);

  return null;
}
