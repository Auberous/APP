/**
 * Wellbeing test (CLAUDE.md §2): a calm visual language is the point, not
 * decoration. Constitution §7 rules out red badge counters and urgent-red CTAs
 * for routine actions, so this palette has no alarm red in it at all. The
 * strongest colour available for a "leave" or "decline" action is a muted
 * clay — visible, but not manufactured urgency.
 */

export const colors = {
  background: '#FBF9F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F0EA',
  border: '#E6E1D8',
  text: '#2B2B28',
  textMuted: '#6E6A61',
  textFaint: '#938F86',
  primary: '#3F6B5B',
  primaryPressed: '#33574A',
  onPrimary: '#FFFFFF',
  primarySoft: '#EDF2EF',
  /** For genuinely consequential actions only. Deliberately not alarm red. */
  caution: '#8A5A44',
  focus: '#3F6B5B',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

/**
 * No `lineHeight` locked to a pixel value below its font size, and no fixed
 * heights on text containers: many Compass users are on older phones with the
 * system font scaled up (§7), and text must be allowed to grow.
 */
export const type = {
  title: { fontSize: 28, fontWeight: '600' as const, color: colors.text },
  heading: { fontSize: 20, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 17, fontWeight: '400' as const, color: colors.text },
  label: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  caption: { fontSize: 14, fontWeight: '400' as const, color: colors.textMuted },
} as const;

/** Minimum comfortable touch target. Applies to every pressable. */
export const MIN_TOUCH_TARGET = 48;
