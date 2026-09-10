/**
 * Hand-written mirror of supabase/migrations/0001_initial_schema.sql.
 *
 * Written in the exact shape `supabase gen types typescript` emits — including
 * `Relationships` and the empty `Views`/`CompositeTypes` members that
 * supabase-js requires — so that once real credentials exist this file can be
 * replaced by the generated output as a drop-in and the two cannot drift.
 *
 * Note what is absent, and must stay absent (§3): no like or reaction counts,
 * no follower counts, no view/engagement columns, no ranking score.
 */

export type CircleRole = 'admin' | 'member';

/**
 * These are `type` aliases, not `interface`s, and must stay that way.
 * supabase-js constrains every table's Row to `Record<string, unknown>`.
 * TypeScript gives type aliases an implicit index signature but does not give
 * one to interfaces, so declaring these as interfaces makes the whole schema
 * fail the constraint — at which point every query silently degrades to
 * `never` rather than reporting the real problem.
 */

export type UserRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export type CircleRow = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export type CircleMemberRow = {
  circle_id: string;
  user_id: string;
  role: CircleRole;
  joined_at: string;
}

export type CircleInviteRow = {
  id: string;
  circle_id: string;
  email: string;
  invited_by: string;
  accepted_at: string | null;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          display_name?: string;
          avatar_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'users_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      circles: {
        Row: CircleRow;
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'circles_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      circle_members: {
        Row: CircleMemberRow;
        Insert: {
          circle_id: string;
          user_id: string;
          role?: CircleRole;
          joined_at?: string;
        };
        Update: {
          role?: CircleRole;
        };
        Relationships: [
          {
            foreignKeyName: 'circle_members_circle_id_fkey';
            columns: ['circle_id'];
            isOneToOne: false;
            referencedRelation: 'circles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'circle_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      circle_invites: {
        Row: CircleInviteRow;
        Insert: {
          id?: string;
          circle_id: string;
          email: string;
          invited_by: string;
          created_at?: string;
        };
        // Accepting an invite goes through the accept_circle_invite function,
        // not a client update: there is no UPDATE policy on this table.
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: 'circle_invites_circle_id_fkey';
            columns: ['circle_id'];
            isOneToOne: false;
            referencedRelation: 'circles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'circle_invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_circle_invite: {
        Args: { p_invite_id: string };
        Returns: string;
      };
      is_circle_member: {
        Args: { p_circle_id: string };
        Returns: boolean;
      };
      is_circle_admin: {
        Args: { p_circle_id: string };
        Returns: boolean;
      };
      shares_circle_with: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      has_pending_circle_invite: {
        Args: { p_circle_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      circle_role: CircleRole;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
