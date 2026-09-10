import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, Notice } from '../../components';
import { useAuth, useSupabase } from '../../context/AuthContext';
import { describeError } from '../../lib/supabase';
import { colors, radius, spacing, type as typography, MIN_TOUCH_TARGET } from '../../theme';
import type { CircleRole } from '../../types/database';
import type { AppScreenProps } from '../../navigation/types';

interface CircleSummary {
  id: string;
  name: string;
  memberCount: number;
  myRole: CircleRole;
}

interface PendingInvite {
  id: string;
  circleId: string;
  circleName: string;
}

export function CirclesScreen({ navigation }: AppScreenProps<'Circles'>) {
  const client = useSupabase();
  const { user, logOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [circles, setCircles] = useState<CircleSummary[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client || !user) return;
    setProblem(null);

    // Three plain reads. RLS decides what comes back, so there are no
    // ownership filters here to get wrong — the database is the gate (§8).
    //
    // `circles` returns both the circles the user belongs to and any they have
    // a pending invite to; membership rows are what tell the two apart.
    const [circlesResult, membersResult, invitesResult] = await Promise.all([
      client.from('circles').select('id, name, created_at').order('created_at', { ascending: false }),
      client.from('circle_members').select('circle_id, user_id, role'),
      client
        .from('circle_invites')
        .select('id, circle_id')
        .is('accepted_at', null)
        .ilike('email', user.email ?? ''),
    ]);

    const failure = circlesResult.error ?? membersResult.error ?? invitesResult.error;
    if (failure) {
      setProblem(describeError(failure, 'We could not load your circles just now.'));
      setLoading(false);
      return;
    }

    const circleRows = circlesResult.data ?? [];
    const memberRows = membersResult.data ?? [];
    const inviteRows = invitesResult.data ?? [];

    const nameById = new Map(circleRows.map((c) => [c.id, c.name]));
    const myMemberships = new Map(
      memberRows.filter((m) => m.user_id === user.id).map((m) => [m.circle_id, m.role]),
    );

    setCircles(
      circleRows
        .filter((c) => myMemberships.has(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          memberCount: memberRows.filter((m) => m.circle_id === c.id).length,
          myRole: myMemberships.get(c.id) as CircleRole,
        })),
    );

    setInvites(
      inviteRows
        // An invite to a circle you already joined is not actionable.
        .filter((i) => !myMemberships.has(i.circle_id))
        .map((i) => ({
          id: i.id,
          circleId: i.circle_id,
          circleName: nameById.get(i.circle_id) ?? 'A circle',
        })),
    );

    setLoading(false);
  }, [client, user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-read when returning from Create or Invite, so the list is never stale.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onAccept(invite: PendingInvite) {
    if (!client) return;
    setActingOn(invite.id);
    const { error } = await client.rpc('accept_circle_invite', { p_invite_id: invite.id });
    setActingOn(null);
    if (error) {
      setProblem(describeError(error, 'We could not join that circle just now.'));
      return;
    }
    await load();
  }

  async function onDecline(invite: PendingInvite) {
    if (!client) return;
    setActingOn(invite.id);
    const { error } = await client.from('circle_invites').delete().eq('id', invite.id);
    setActingOn(null);
    if (error) {
      setProblem(describeError(error, 'We could not decline that invitation just now.'));
      return;
    }
    await load();
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        paddingHorizontal: spacing.lg,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={colors.primary}
        />
      }
    >
      {problem ? <Notice tone="problem">{problem}</Notice> : null}

      {invites.length > 0 ? (
        <View style={styles.section}>
          <Text style={typography.heading}>Invitations</Text>
          {invites.map((invite) => (
            <View key={invite.id} style={styles.card}>
              <Text style={typography.body}>
                You have been invited to join <Text style={styles.strong}>{invite.circleName}</Text>.
              </Text>
              <View style={styles.inviteActions}>
                <View style={styles.grow}>
                  <Button
                    label="Join"
                    onPress={() => void onAccept(invite)}
                    busy={actingOn === invite.id}
                    accessibilityHint={`Join the circle ${invite.circleName}`}
                  />
                </View>
                <View style={styles.grow}>
                  <Button
                    label="Decline"
                    variant="secondary"
                    onPress={() => void onDecline(invite)}
                    busy={actingOn === invite.id}
                    accessibilityHint={`Decline the invitation to ${invite.circleName}`}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={typography.heading}>Your circles</Text>

        {loading ? (
          <Text style={typography.caption}>Loading your circles…</Text>
        ) : circles.length === 0 ? (
          <EmptyState
            title="No circles yet"
            body="A circle is a small group you share with — like your immediate family. Create one to get started."
          />
        ) : (
          circles.map((circle) => (
            <View key={circle.id} style={styles.card}>
              <Text style={typography.label}>{circle.name}</Text>
              <Text style={typography.caption}>
                {circle.memberCount === 1 ? 'Just you so far' : `${circle.memberCount} members`}
                {circle.myRole === 'admin' ? ' · you can invite people' : ''}
              </Text>
              {circle.myRole === 'admin' ? (
                <Pressable
                  onPress={() =>
                    navigation.navigate('InviteMember', {
                      circleId: circle.id,
                      circleName: circle.name,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Invite someone to ${circle.name}`}
                  style={({ pressed }) => [styles.inlineAction, pressed && styles.inlineActionPressed]}
                >
                  <Text style={styles.inlineActionLabel}>Invite someone</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </View>

      {/*
        The list ends here, plainly and visibly. There is no onEndReached and
        nothing further to fetch — §3 bans infinite scroll, and §7 asks for a
        session that can actually finish.
      */}
      {!loading && circles.length > 0 ? (
        <Text style={styles.endOfList}>That is all your circles.</Text>
      ) : null}

      <View style={styles.footerActions}>
        <Button label="Create a circle" onPress={() => navigation.navigate('CreateCircle')} />
        {/*
          Logging out takes one tap and asks nothing. It is trivially
          reversible, so a confirmation dialog here would be friction for its
          own sake (§3).
        */}
        <Button label="Log out" variant="caution" onPress={() => void logOut()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  section: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  strong: {
    fontWeight: '600',
  },
  inviteActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  grow: {
    flex: 1,
  },
  inlineAction: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  inlineActionPressed: {
    opacity: 0.6,
  },
  inlineActionLabel: {
    ...typography.label,
    color: colors.primary,
  },
  endOfList: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  footerActions: {
    gap: spacing.md,
  },
});
