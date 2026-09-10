import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Notice, ScreenContainer } from '../components';
import { missingEnvVars } from '../lib/env';
import { colors, radius, spacing, type as typography } from '../theme';

/**
 * Shown instead of the app when Supabase credentials are absent.
 *
 * Phase 1 is expected to run before a real project exists. A white screen or a
 * crash would be the dishonest option; this says exactly what is missing and
 * how to supply it.
 */
export function SetupNeededScreen() {
  const missing = missingEnvVars();

  return (
    <ScreenContainer>
      <Text style={typography.title}>Compass needs a Supabase project</Text>
      <Notice>
        The app is running, but it has no database to talk to yet, so accounts and circles are
        unavailable.
      </Notice>

      <Text style={styles.heading}>Missing configuration</Text>
      <View style={styles.block}>
        {missing.map((name) => (
          <Text key={name} style={styles.mono}>
            {name}
          </Text>
        ))}
      </View>

      <Text style={styles.heading}>How to set it up</Text>
      <Text style={typography.body}>
        1. Copy <Text style={styles.monoInline}>.env.example</Text> to{' '}
        <Text style={styles.monoInline}>.env</Text> and fill in your project URL and anon key
        (Supabase dashboard → Project Settings → API).
      </Text>
      <Text style={typography.body}>
        2. Apply <Text style={styles.monoInline}>supabase/migrations/0001_initial_schema.sql</Text>{' '}
        to the project — it creates the tables and the row-level security policies.
      </Text>
      <Text style={typography.body}>
        3. Restart the dev server with <Text style={styles.monoInline}>npx expo start --clear</Text>,
        since these values are read at build time.
      </Text>
      <Text style={styles.footnote}>
        The anon key is safe to ship in the app. Never put the service-role key here.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: {
    ...typography.heading,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  block: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  mono: {
    ...typography.body,
    fontFamily: 'monospace',
  },
  monoInline: {
    fontFamily: 'monospace',
  },
  footnote: {
    ...typography.caption,
    marginTop: spacing.xl,
  },
});
