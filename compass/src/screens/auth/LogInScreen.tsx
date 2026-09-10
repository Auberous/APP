import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Notice, ScreenContainer, TextField } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { spacing, type as typography } from '../../theme';
import type { AuthScreenProps } from '../../navigation/types';

export function LogInScreen({ navigation }: AuthScreenProps<'LogIn'>) {
  const { logIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  async function onSubmit() {
    setProblem(null);
    setBusy(true);
    const result = await logIn({ email, password });
    setBusy(false);
    // On success the auth listener swaps the navigator over; nothing to do here.
    if (!result.ok) setProblem(result.message);
  }

  return (
    <ScreenContainer>
      <Text style={typography.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to see your circles.</Text>

      {problem ? <Notice tone="problem">{problem}</Notice> : null}

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
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
      />

      <View style={styles.actions}>
        <Button label="Log in" onPress={onSubmit} busy={busy} disabled={!canSubmit} />
        <Button
          label="Create an account"
          variant="quiet"
          onPress={() => navigation.navigate('SignUp')}
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
