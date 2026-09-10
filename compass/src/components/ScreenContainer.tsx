import React, { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

/**
 * Standard page frame: safe-area aware, generous padding, and a *bounded*
 * scroll view.
 *
 * Note (§3): this scrolls a single screen's own content to the end and stops.
 * There is no onEndReached hook here and no page-fetching — nothing in this
 * component can grow a list as you approach the bottom.
 */
export function ScreenContainer({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + spacing.lg,
    paddingBottom: insets.bottom + spacing.xl,
    paddingLeft: insets.left + spacing.lg,
    paddingRight: insets.right + spacing.lg,
  };

  if (!scroll) {
    return <View style={[styles.root, padding, style]}>{children}</View>;
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[padding, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
