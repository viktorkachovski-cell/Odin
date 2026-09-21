export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      households: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          seed_locale: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          seed_locale: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          seed_locale?: string
        }
        Relationships: []
      }
      lists: {
        Row: {
          created_at: string
          created_by: string
          household_id: string
          id: string
          kind: string
          seed_key: string | null
          status: string
          subtitle: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          household_id: string
          id?: string
          kind: string
          seed_key?: string | null
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          household_id?: string
          id?: string
          kind?: string
          seed_key?: string | null
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lists_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          household_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_ref: string | null
          created_at: string
          display_name: string
          locale: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_ref?: string | null
          created_at?: string
          display_name: string
          locale?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_ref?: string | null
          created_at?: string
          display_name?: string
          locale?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee_id: string | null
          completed: boolean
          created_at: string
          due_at: string | null
          household_id: string
          id: string
          list_id: string
          sort_order: number
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          assignee_id?: string | null
          completed?: boolean
          created_at?: string
          due_at?: string | null
          household_id: string
          id?: string
          list_id: string
          sort_order: number
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          assignee_id?: string | null
          completed?: boolean
          created_at?: string
          due_at?: string | null
          household_id?: string
          id?: string
          list_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_membership_fk"
            columns: ["household_id", "assignee_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["household_id", "user_id"]
          },
          {
            foreignKeyName: "tasks_list_fk"
            columns: ["household_id", "list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_list: {
        Args: { expected_version: number; list_id: string; request_id: string }
        Returns: Json
      }
      delete_task: {
        Args: { expected_version: number; request_id: string; task_id: string }
        Returns: Json
      }
      claim_task: {
        Args: { expected_version: number; request_id: string; task_id: string }
        Returns: Json
      }
      copy_template: {
        Args: { request_id: string; template_id: string }
        Returns: Json
      }
      create_household: {
        Args: { name: string; request_id: string; seed_locale: string }
        Returns: Json
      }
      create_invitation: { Args: { request_id: string }; Returns: Json }
      create_list: {
        Args: { request_id: string; subtitle?: string; title: string }
        Returns: Json
      }
      create_task: {
        Args: {
          assignee_id?: string
          due_at?: string
          list_id: string
          request_id: string
          title: string
        }
        Returns: Json
      }
      get_home: { Args: { p_cursor?: string; p_limit?: number }; Returns: Json }
      get_list: {
        Args: { p_cursor?: string; p_limit?: number; p_list_id: string }
        Returns: Json
      }
      get_members: { Args: never; Returns: Json }
      get_my_household: { Args: never; Returns: Json }
      get_my_tasks: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: Json
      }
      get_unassigned: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: Json
      }
      redeem_invitation: {
        Args: { request_id: string; token: string }
        Returns: Json
      }
      revoke_invitation: {
        Args: { invitation_id: string; request_id: string }
        Returns: Json
      }
      set_task_completed: {
        Args: {
          completed: boolean
          expected_version: number
          request_id: string
          task_id: string
        }
        Returns: Json
      }
      update_list: {
        Args: {
          expected_version: number
          list_id: string
          request_id: string
          subtitle?: string
          title: string
        }
        Returns: Json
      }
      update_profile: {
        Args: {
          avatar_ref?: string
          display_name: string
          locale: string
          request_id: string
        }
        Returns: Json
      }
      update_task: {
        Args: {
          assignee_id?: string
          due_at?: string
          expected_version: number
          request_id: string
          task_id: string
          title: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
