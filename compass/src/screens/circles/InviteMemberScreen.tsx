import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Notice, ScreenContainer, TextField } from '../../components';
import { useAuth, useSupabase } from '../../context/AuthContext';
import { describeError } from '../../lib/supabase';
import { spacing, type as typography } from '../../theme';
import type { AppScreenProps } from '../../navigation/types';

/** Good enough to catch a typo; the database check and Supabase both re-validate. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteMemberScreen({ navigation, route }: AppScreenProps<'InviteMember'>) {
  const { circleId, circleName } = route.params;
  const client = useSupabase();
  const { user } = useAuth();

  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = email.trim();
  const canSubmit = LOOKS_LIKE_EMAIL.test(trimmed);

  async function onSubmit() {
    if (!client || !user) return;
    setProblem(null);
    setSent(null);
    setBusy(true);

    const { error } = await client
      .from('circle_invites')
      .insert({ circle_id: circleId, email: trimmed, invited_by: user.id });

    setBusy(false);

    if (error) {
      // The unique index on (circle_id, lower(email)) for un-accepted invites
      // is what surfaces a duplicate. Say so plainly instead of showing a
      // constraint name.
      const isDuplicate =
        'code' in (error as object) && (error as { code?: string }).code === '23505';
      setProblem(
        isDuplicate
          ? `There is already an open invitation to ${trimmed} for this circle.`
          : describeError(error, 'We could not create that invitation just now.'),
      );
      return;
    }

    setSent(trimmed);
    setEmail('');
  }

  return (
    <ScreenContainer>
      <Text style={typography.title}>Invite someone</Text>
      <Text style={styles.subtitle}>They will be able to see everything shared in {circleName}.</Text>

      {problem ? <Notice tone="problem">{problem}</Notice> : null}
      {sent ? (
        <Notice>
          {/*
            Honest about what actually happened (§7). Phase 1 records the
            invitation; it does not send an email yet, and saying otherwise
            would be an overclaim.
          */}
          {`Invitation recorded for ${sent}. Compass does not send invitation emails yet, so let them know directly — it will be waiting when they sign in with that address.`}
        </Notice>
      ) : null}

      <TextField
        label="Their email"
        hint="We only use this to match the invitation to their account."
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => {
          if (canSubmit) void onSubmit();
        }}
      />

      <View style={styles.actions}>
        <Button label="Send invitation" onPress={onSubmit} busy={busy} disabled={!canSubmit} />
        <Button label="Done" variant="secondary" onPress={() => navigation.goBack()} />
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
