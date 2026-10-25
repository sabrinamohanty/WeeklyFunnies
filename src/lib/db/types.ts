export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      avatar_drafts: {
        Row: {
          attempts: number;
          created_at: string;
          draft_path: string | null;
          error: string | null;
          selfie_expires_at: string;
          selfie_path: string | null;
          status: Database["public"]["Enums"]["generation_status"];
          tweaks: Json | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          created_at?: string;
          draft_path?: string | null;
          error?: string | null;
          selfie_expires_at: string;
          selfie_path?: string | null;
          status?: Database["public"]["Enums"]["generation_status"];
          tweaks?: Json | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          draft_path?: string | null;
          error?: string | null;
          selfie_expires_at?: string;
          selfie_path?: string | null;
          status?: Database["public"]["Enums"]["generation_status"];
          tweaks?: Json | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "avatar_drafts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      editions: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          issue_number: number;
          paper_id: string;
          published_at: string | null;
          saved_at: string | null;
          status: Database["public"]["Enums"]["edition_status"];
          updated_at: string;
          week_end: string | null;
          week_start: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          issue_number?: number;
          paper_id: string;
          published_at?: string | null;
          saved_at?: string | null;
          status?: Database["public"]["Enums"]["edition_status"];
          updated_at?: string;
          week_end?: never;
          week_start: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          issue_number?: number;
          paper_id?: string;
          published_at?: string | null;
          saved_at?: string | null;
          status?: Database["public"]["Enums"]["edition_status"];
          updated_at?: string;
          week_end?: never;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "editions_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
        ];
      };
      highlights: {
        Row: {
          created_at: string;
          id: string;
          in_comic: boolean;
          notices: string[];
          page_id: string;
          position: number;
          serious: boolean;
          text: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          in_comic?: boolean;
          notices?: string[];
          page_id: string;
          position: number;
          serious?: boolean;
          text: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          in_comic?: boolean;
          notices?: string[];
          page_id?: string;
          position?: number;
          serious?: boolean;
          text?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "highlights_page_id_user_id_fkey";
            columns: ["page_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "pages";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      horoscopes: {
        Row: {
          created_at: string;
          sign: string;
          text: string;
          week_start: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          sign: string;
          text: string;
          week_start: string;
        };
        Update: {
          created_at?: string;
          sign?: string;
          text?: string;
          week_start?: string;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          code_hash: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          paper_id: string;
          revoked_at: string | null;
          use_count: number;
        };
        ComputedFields: never;
        Insert: {
          code_hash: string;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          id?: string;
          paper_id: string;
          revoked_at?: string | null;
          use_count?: number;
        };
        Update: {
          code_hash?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          paper_id?: string;
          revoked_at?: string | null;
          use_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
        ];
      };
      page_papers: {
        Row: {
          edition_id: string;
          page_id: string;
          paper_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          edition_id: string;
          page_id: string;
          paper_id: string;
          user_id: string;
        };
        Update: {
          edition_id?: string;
          page_id?: string;
          paper_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "page_papers_edition_id_paper_id_fkey";
            columns: ["edition_id", "paper_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id", "paper_id"];
          },
          {
            foreignKeyName: "page_papers_page_id_user_id_fkey";
            columns: ["page_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "pages";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "page_papers_paper_id_user_id_fkey";
            columns: ["paper_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "paper_members";
            referencedColumns: ["paper_id", "user_id"];
          },
        ];
      };
      pages: {
        Row: {
          approved_at: string | null;
          comic_title: string | null;
          created_at: string;
          generated_at: string | null;
          id: string;
          notices: string[];
          redraws_used: number;
          regenerations_used: number;
          rewrites_used: number;
          status: Database["public"]["Enums"]["page_status"];
          style: string;
          updated_at: string;
          user_id: string;
          week_end: string | null;
          week_start: string;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          comic_title?: string | null;
          created_at?: string;
          generated_at?: string | null;
          id?: string;
          notices?: string[];
          redraws_used?: number;
          regenerations_used?: number;
          rewrites_used?: number;
          status?: Database["public"]["Enums"]["page_status"];
          style?: string;
          updated_at?: string;
          user_id: string;
          week_end?: never;
          week_start: string;
        };
        Update: {
          approved_at?: string | null;
          comic_title?: string | null;
          created_at?: string;
          generated_at?: string | null;
          id?: string;
          notices?: string[];
          redraws_used?: number;
          regenerations_used?: number;
          rewrites_used?: number;
          status?: Database["public"]["Enums"]["page_status"];
          style?: string;
          updated_at?: string;
          user_id?: string;
          week_end?: never;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      panels: {
        Row: {
          caption: string | null;
          dialogue: NonNullable<Json>;
          error: string | null;
          highlight_id: string;
          idx: number;
          page_id: string;
          scene: string;
          status: Database["public"]["Enums"]["generation_status"];
          storage_path: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          caption?: string | null;
          dialogue?: NonNullable<Json>;
          error?: string | null;
          highlight_id: string;
          idx: number;
          page_id: string;
          scene: string;
          status?: Database["public"]["Enums"]["generation_status"];
          storage_path?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          caption?: string | null;
          dialogue?: NonNullable<Json>;
          error?: string | null;
          highlight_id?: string;
          idx?: number;
          page_id?: string;
          scene?: string;
          status?: Database["public"]["Enums"]["generation_status"];
          storage_path?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "panels_highlight_id_user_id_fkey";
            columns: ["highlight_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "highlights";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "panels_page_id_user_id_fkey";
            columns: ["page_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "pages";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      paper_members: {
        Row: {
          joined_at: string;
          paper_id: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          joined_at?: string;
          paper_id: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Update: {
          joined_at?: string;
          paper_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "paper_members_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "paper_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      papers: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "papers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      photos: {
        Row: {
          byte_size: number;
          created_at: string;
          height: number;
          highlight_id: string;
          id: string;
          position: number;
          storage_path: string;
          user_id: string;
          width: number;
        };
        ComputedFields: never;
        Insert: {
          byte_size: number;
          created_at?: string;
          height: number;
          highlight_id: string;
          id?: string;
          position: number;
          storage_path: string;
          user_id: string;
          width: number;
        };
        Update: {
          byte_size?: number;
          created_at?: string;
          height?: number;
          highlight_id?: string;
          id?: string;
          position?: number;
          storage_path?: string;
          user_id?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "photos_highlight_id_user_id_fkey";
            columns: ["highlight_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "highlights";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          avatar_traits: Json | null;
          birthday: string | null;
          city_admin1: string | null;
          city_country: string | null;
          city_country_code: string | null;
          city_name: string | null;
          created_at: string;
          id: string;
          last_active_at: string;
          lat: number | null;
          lng: number | null;
          logged_out_at: string | null;
          look: string | null;
          name: string | null;
          style: string;
          timezone: string | null;
          updated_at: string;
          zodiac_sign: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          avatar_traits?: Json | null;
          birthday?: string | null;
          city_admin1?: string | null;
          city_country?: string | null;
          city_country_code?: string | null;
          city_name?: string | null;
          created_at?: string;
          id: string;
          last_active_at?: string;
          lat?: number | null;
          lng?: number | null;
          logged_out_at?: string | null;
          look?: string | null;
          name?: string | null;
          style?: string;
          timezone?: string | null;
          updated_at?: string;
          zodiac_sign?: never;
        };
        Update: {
          avatar_path?: string | null;
          avatar_traits?: Json | null;
          birthday?: string | null;
          city_admin1?: string | null;
          city_country?: string | null;
          city_country_code?: string | null;
          city_name?: string | null;
          created_at?: string;
          id?: string;
          last_active_at?: string;
          lat?: number | null;
          lng?: number | null;
          logged_out_at?: string | null;
          look?: string | null;
          name?: string | null;
          style?: string;
          timezone?: string | null;
          updated_at?: string;
          zodiac_sign?: never;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          count: number;
          key: string;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          count: number;
          key: string;
          window_start: string;
        };
        Update: {
          count?: number;
          key?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      reactions: {
        Row: {
          created_at: string;
          edition_id: string;
          reaction: Database["public"]["Enums"]["reaction_kind"];
          story_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          edition_id: string;
          reaction: Database["public"]["Enums"]["reaction_kind"];
          story_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          edition_id?: string;
          reaction?: Database["public"]["Enums"]["reaction_kind"];
          story_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reactions_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "editions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      storage_deletions: {
        Row: {
          attempts: number;
          bucket: string;
          enqueued_at: string;
          path: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          bucket: string;
          enqueued_at?: string;
          path: string;
        };
        Update: {
          attempts?: number;
          bucket?: string;
          enqueued_at?: string;
          path?: string;
        };
        Relationships: [];
      };
      stories: {
        Row: {
          body: string;
          headline: string;
          highlight_id: string;
          id: string;
          page_id: string;
          section: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          headline: string;
          highlight_id: string;
          id?: string;
          page_id: string;
          section: string;
          user_id: string;
        };
        Update: {
          body?: string;
          headline?: string;
          highlight_id?: string;
          id?: string;
          page_id?: string;
          section?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stories_highlight_id_user_id_fkey";
            columns: ["highlight_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "highlights";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "stories_page_id_user_id_fkey";
            columns: ["page_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "pages";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_paper: { Args: { p_name: string; p_user: string }; Returns: string };
      join_paper: { Args: { p_code_hash: string; p_user: string }; Returns: string };
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      rate_limit_prune: { Args: { p_older_than_seconds?: number }; Returns: number };
      save_edition: {
        Args: { p_days: number; p_edition: string; p_saved: boolean };
        Returns: {
          created_at: string;
          expires_at: string | null;
          id: string;
          issue_number: number;
          paper_id: string;
          published_at: string | null;
          saved_at: string | null;
          status: Database["public"]["Enums"]["edition_status"];
          updated_at: string;
          week_end: string | null;
          week_start: string;
        };
        SetofOptions: {
          from: "*";
          to: "editions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      edition_status: "draft" | "published";
      generation_status: "pending" | "generating" | "ready" | "failed";
      member_role: "owner" | "member";
      page_status: "writing" | "generated" | "approved";
      reaction_kind: "ha" | "aww" | "hooray";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      edition_status: ["draft", "published"],
      generation_status: ["pending", "generating", "ready", "failed"],
      member_role: ["owner", "member"],
      page_status: ["writing", "generated", "approved"],
      reaction_kind: ["ha", "aww", "hooray"],
    },
  },
} as const;
