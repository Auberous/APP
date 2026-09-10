import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type as typography } from '../theme';

/**
 * Inline message block for errors and confirmations.
 *
 * Deliberately not a red alert banner (§7) and never a badge counter. Tone is
 * plain: it says what happened and, where useful, what to do next.
 */
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'problem'; children: string }) {
  return (
    <View
      style={[styles.base, tone === 'problem' ? styles.problem : styles.info]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  info: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  problem: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.caution,
  },
  text: {
    ...typography.body,
    color: colors.text,
  },
});
