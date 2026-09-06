/**
 * Everything name-shaped lives here.
 *
 * The display name is a placeholder until the label decides. Changing it is one
 * edit in this file plus `name` in app.json — deliberately, so the decision
 * stays cheap for as long as possible.
 *
 * `bundleId` in app.json is the one value that becomes permanent, and only at
 * first store submission: an app's bundle identifier cannot be changed
 * afterwards without shipping a new listing and losing the install base. There
 * is no rush to settle it before then.
 */
export const brand = {
  /** Shown on the splash, the wordmark, and in share sheets. */
  name: 'Artist Hub',

  /** Uppercase wordmark. Kept separate so a name with lowercase styling
   *  (an "eeaao" rather than an "ARTIST HUB") does not need code changes. */
  wordmark: 'ARTIST HUB',

  tagline: 'Follow the roster, bring your people, eat free.',

  /** Where referral links point. Fill in once the domain exists — see
   *  docs/DEPLOY.md, section 3. */
  webUrl: 'https://example.com',

  /** The lounge, as fans refer to it in copy. */
  venueNoun: 'the lounge',
} as const;

/** A shareable referral link for a code. */
export function referralUrl(code: string): string {
  return `${brand.webUrl}/join/${code}`;
}

/** An artist's own trackable install link. */
export function artistInstallUrl(installCode: string): string {
  return `${brand.webUrl}/a/${installCode}`;
}
