/**
 * Brand tokens. Mirrors the @theme block in admin/src/index.css — change both
 * together so the dashboard and the app never drift apart.
 *
 * Gold is the primary action colour. Purple is the secondary, reserved for
 * rewards, progress and sponsor tiers so the two never compete for the same
 * job on one screen.
 */
export const colors = {
  bg: '#0A0A0A',
  surface: '#111111',
  surfaceRaised: '#171717',
  border: '#2E2E2E',

  text: '#F5F5F5',
  textMuted: '#8B8B8B',

  gold: '#FFB800',
  goldDim: '#D99C00',
  purple: '#7C3AED',
  purpleDim: '#6428D4',

  danger: '#EF4444',
  success: '#22C55E',

  // Platform colours, used only as thin accents on the listen buttons so a fan
  // recognises the destination at a glance.
  spotify: '#1DB954',
  youtube: '#FF0000',
  apple: '#FA243C',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  // Heavy, tight display face for artist names — album-cover energy.
  display: {
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
};
