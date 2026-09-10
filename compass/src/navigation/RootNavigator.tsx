import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured } from '../lib/env';
import { colors, type as typography } from '../theme';
import { LogInScreen } from '../screens/auth/LogInScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { CirclesScreen } from '../screens/circles/CirclesScreen';
import { CreateCircleScreen } from '../screens/circles/CreateCircleScreen';
import { InviteMemberScreen } from '../screens/circles/InviteMemberScreen';
import { SetupNeededScreen } from '../screens/SetupNeededScreen';
import type { AppStackParamList, AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

const navigationTheme: Theme = {
  dark: false,
  colors: {
    primary: colors.primary,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
  // React Navigation v7 requires a font descriptor set on the theme.
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '600' },
    heavy: { fontFamily: 'System', fontWeight: '700' },
  },
};

function AuthRoutes() {
  return (
    // Headers are hidden here because each auth screen carries its own title.
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="LogIn" component={LogInScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
    </AuthStack.Navigator>
  );
}

function AppRoutes() {
  return (
    <AppStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <AppStack.Screen name="Circles" component={CirclesScreen} options={{ title: 'Circles' }} />
      {/* Create and Invite are modals: they are short, single-purpose tasks. */}
      <AppStack.Screen
        name="CreateCircle"
        component={CreateCircleScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
      <AppStack.Screen
        name="InviteMember"
        component={InviteMemberScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
    </AppStack.Navigator>
  );
}

export function RootNavigator() {
  const { initialising, session } = useAuth();

  // Without credentials there is nothing to sign in to, so say so rather than
  // showing a login form that cannot work.
  if (!isSupabaseConfigured) {
    return <SetupNeededScreen />;
  }

  // Holding here avoids showing the login screen for a moment to someone who
  // already has a stored session.
  if (initialising) {
    return (
      <View style={styles.loading} accessibilityLabel="Opening Compass">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {session ? <AppRoutes /> : <AuthRoutes />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    ...typography.body,
  },
});
