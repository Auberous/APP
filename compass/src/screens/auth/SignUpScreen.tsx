import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Notice, ScreenContainer, TextField } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { spacing, type as typography } from '../../theme';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * Onboarding is three fields and nothing else (§3: no dark patterns in
 * onboarding). There is no pre-ticked marketing consent, no "invite your
 * contacts" step, and no address-book permission request.
 */
export function SignUpScreen({ navigation }: AuthScreenProps<'SignUp'>) {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const canSubmit =
    displayName.trim().length > 0 && email.trim().length > 0 && password.length >= 8;

  async function onSubmit() {
    setProblem(null);
    setBusy(true);
    const result = await signUp({ email, password, displayName });
    setBusy(false);

    if (!result.ok) {
      setProblem(result.message);
      return;
    }

    // With email confirmation on (the Supabase default) there is no session
    // yet, so say plainly what has to happen next rather than appearing stuck.
    setConfirmationSent(true);
  }

  if (confirmationSent) {
    return (
      <ScreenContainer>
        <Text style={typography.title}>Check your email</Text>
        <Notice>
          {`We sent a confirmation link to ${email.trim()}. Open it to finish setting up your account, then come back and log in.`}
        </Notice>
        <Button label="Back to log in" variant="secondary" onPress={() => navigation.navigate('LogIn')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={typography.title}>Create your account</Text>
      <Text style={styles.subtitle}>
        Compass is for sharing with people you choose. Nothing you add is public.
      </Text>

      {problem ? <Notice tone="problem">{problem}</Notice> : null}

      <TextField
        label="Your name"
        hint="How your family and friends will see you."
        value={displayName}
        onChangeText={setDisplayName}
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        autoCorrect={false}
      />
      <TextField
        label="Password"
        hint="At least 8 characters."
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />

      <View style={styles.actions}>
        <Button label="Create account" onPress={onSubmit} busy={busy} disabled={!canSubmit} />
        <Button
          label="I already have an account"
          variant="quiet"
          onPress={() => navigation.navigate('LogIn')}
        />
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
