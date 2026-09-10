import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type as typography } from '../theme';

/**
 * Shown when a list has nothing in it. Copy explains the state and the next
 * step honestly, without nudging or implying the user is missing out (§3).
 */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  title: typography.heading,
  body: typography.caption,
});
