import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** Routes available before sign-in. */
export type AuthStackParamList = {
  LogIn: undefined;
  SignUp: undefined;
};

/** Routes available once signed in. Phase 1 is Circles only. */
export type AppStackParamList = {
  Circles: undefined;
  CreateCircle: undefined;
  InviteMember: { circleId: string; circleName: string };
};

export type AuthScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<
  AuthStackParamList,
  T
>;

export type AppScreenProps<T extends keyof AppStackParamList> = NativeStackScreenProps<
  AppStackParamList,
  T
>;
