import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Notice, ScreenContainer, TextField } from '../../components';
import { useAuth, useSupabase } from '../../context/AuthContext';
import { describeError } from '../../lib/supabase';
import { spacing, type as typography } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

/**
 * Wellbeing test (§2): creating a named, private group is the unit of sharing
 * in Compass. There is no "make this public" option here, by design — §4 sets
 * the default scope to the smallest useful circle and there is no public scope
 * to opt into.
 */
export function CreateCircleScreen({ navigation }: AppScreenProps<'CreateCircle'>) {
  const client = useSupabase();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= 80;

  async function onSubmit() {
    if (!client || !user) return;
    setProblem(null);
    setBusy(true);

    // created_by must be the caller: the circles_insert_own policy enforces it,
    // and the on_circle_created trigger then makes this user the first admin.
    const { error } = await client
      .from('circles')
      .insert({ name: trimmed, created_by: user.id });

    setBusy(false);

    if (error) {
      setProblem(describeError(error, 'We could not create that circle just now.'));
      return;
    }

    navigation.goBack();
  }

  return (
    <ScreenContainer>
      <Text style={typography.title}>Create a circle</Text>
      <Text style={styles.subtitle}>
        Only people you invite can see a circle or anything shared in it.
      </Text>

      {problem ? <Notice tone="problem">{problem}</Notice> : null}

      <TextField
        label="Circle name"
        hint="Something you will recognise, like “Family” or “Grandparents”."
        value={name}
        onChangeText={setName}
        maxLength={80}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => {
          if (canSubmit) void onSubmit();
        }}
      />

      <View style={styles.actions}>
        <Button label="Create circle" onPress={onSubmit} busy={busy} disabled={!canSubmit} />
        <Button label="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...typography.caption,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  actions: {
    gap: spacing.md,
  },
});
