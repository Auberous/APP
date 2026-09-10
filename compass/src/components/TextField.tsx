import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing, type as typography, MIN_TOUCH_TARGET } from '../theme';

/**
 * Labelled input. The label is a real <Text> tied to the field rather than a
 * placeholder standing in for one: placeholder-only fields disappear as soon
 * as you type, which is a genuine accessibility problem (§7).
 */
export function TextField({
  label,
  hint,
  value,
  onChangeText,
  ...inputProps
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (next: string) => void;
} & Omit<TextInputProps, 'value' | 'onChangeText'>) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.input}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={label}
        accessibilityHint={hint}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  label: typography.label,
  hint: typography.caption,
  input: {
    ...typography.body,
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
});
