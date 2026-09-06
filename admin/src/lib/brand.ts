/**
 * Mirrors mobile/src/brand.ts. The display name is a placeholder until the
 * label decides; changing it is one edit in each file.
 */
export const brand = {
  name: 'Artist Hub',
  wordmark: 'ARTIST HUB',
  /** Where referral and artist install links point. Fill in once the domain
   *  exists — see docs/DEPLOY.md, section 3. */
  webUrl: 'https://example.com',
} as const;

export function artistInstallUrl(installCode: string): string {
  return `${brand.webUrl}/a/${installCode}`;
}
