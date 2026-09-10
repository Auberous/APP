import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type as typography, MIN_TOUCH_TARGET } from '../theme';

type Variant = 'primary' | 'secondary' | 'quiet' | 'caution';

/**
 * `caution` is for actions with a real consequence (leaving a circle, logging
 * out). It uses a muted clay rather than an alarm red: §7 rules out
 * urgent-red CTAs, and §3 rules out confirm-shaming, so the button's job is to
 * be clear, not frightening.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  busy?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const inactive = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant].container,
        pressed && !inactive ? variantStyles[variant].pressed : null,
        inactive ? styles.inactive : null,
      ]}
    >
      <View style={styles.content}>
        {busy ? (
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? colors.onPrimary : colors.primary}
          />
        ) : null}
        <Text style={[styles.label, variantStyles[variant].label]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    // Wraps instead of clipping when the system font size is large.
    flexWrap: 'wrap',
  },
  label: {
    ...typography.label,
    textAlign: 'center',
  },
  inactive: {
    opacity: 0.5,
  },
});

const variantStyles: Record<
  Variant,
  { container: object; pressed: object; label: object }
> = {
  primary: {
    container: { backgroundColor: colors.primary, borderColor: colors.primary },
    pressed: { backgroundColor: colors.primaryPressed, borderColor: colors.primaryPressed },
    label: { color: colors.onPrimary },
  },
  secondary: {
    container: { backgroundColor: colors.surface, borderColor: colors.border },
    pressed: { backgroundColor: colors.surfaceMuted },
    label: { color: colors.text },
  },
  quiet: {
    container: { backgroundColor: 'transparent', borderColor: 'transparent' },
    pressed: { backgroundColor: colors.surfaceMuted },
    label: { color: colors.primary },
  },
  caution: {
    container: { backgroundColor: 'transparent', borderColor: colors.caution },
    pressed: { backgroundColor: colors.surfaceMuted },
    label: { color: colors.caution },
  },
};
