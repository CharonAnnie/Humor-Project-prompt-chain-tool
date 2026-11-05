// Generated from the live schema via the Supabase MCP (`generate_typescript_types`).
// Regenerate after any migration. The helper types at the bottom are the
// single-schema short form of the ones the generator emits -- same behaviour for
// `public`, without ~150 lines of multi-schema generics this project never uses.
//
// `prompt_chain_runs`, `llm_responses.run_id` and the two reorder functions were
// written in by hand so the app could be built before Week 8's migration was
// applied. The migration has since been applied and these were checked against
// a fresh `generate_typescript_types` -- they match it field for field. The
// helper generics at the bottom stay in the short form rather than the
// generator's multi-schema version, which is the one deliberate difference.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      allowed_signup_domains: {
        Row: {
          created_at: string;
          domain: string;
          id: number;
          is_active: boolean;
          label: string | null;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          domain: string;
          id?: never;
          is_active?: boolean;
          label?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          domain?: string;
          id?: never;
          is_active?: boolean;
          label?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      caption_daily_stats: {
        Row: {
          caption_id: string;
          downvotes: number;
          score: number | null;
          upvotes: number;
          vote_date: string;
        };
        Insert: {
          caption_id: string;
          downvotes?: number;
          score?: number | null;
          upvotes?: number;
          vote_date: string;
        };
        Update: {
          caption_id?: string;
          downvotes?: number;
          score?: number | null;
          upvotes?: number;
          vote_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "caption_daily_stats_caption_id_fkey";
            columns: ["caption_id"];
            isOneToOne: false;
            referencedRelation: "captions";
            referencedColumns: ["id"];
          },
        ];
      };
      captions: {
        Row: {
          created_at: string;
          downvotes: number;
          generation_id: string | null;
          id: string;
          image_id: string;
          model: string | null;
          prompt: string | null;
          score: number | null;
          text: string;
          upvotes: number;
          user_id: string | null;
          voice: string | null;
        };
        Insert: {
          created_at?: string;
          downvotes?: number;
          generation_id?: string | null;
          id?: string;
          image_id: string;
          model?: string | null;
          prompt?: string | null;
          score?: number | null;
          text: string;
          upvotes?: number;
          user_id?: string | null;
          voice?: string | null;
        };
        Update: {
          created_at?: string;
          downvotes?: number;
          generation_id?: string | null;
          id?: string;
          image_id?: string;
          model?: string | null;
          prompt?: string | null;
          score?: number | null;
          text?: string;
          upvotes?: number;
          user_id?: string | null;
          voice?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "captions_generation_id_fkey";
            columns: ["generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "captions_image_id_fkey";
            columns: ["image_id"];
            isOneToOne: false;
            referencedRelation: "images";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "captions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "captions_voice_fkey";
            columns: ["voice"];
            isOneToOne: false;
            referencedRelation: "voices";
            referencedColumns: ["id"];
          },
        ];
      };
      generation_examples: {
        Row: {
          chain_id: number | null;
          created_at: string;
          expected_output: string;
          id: number;
          input_context: string;
          is_active: boolean;
          is_positive: boolean;
          label: string;
          notes: string | null;
          step_id: number | null;
          updated_at: string;
        };
        Insert: {
          chain_id?: number | null;
          created_at?: string;
          expected_output: string;
          id?: never;
          input_context: string;
          is_active?: boolean;
          is_positive?: boolean;
          label: string;
          notes?: string | null;
          step_id?: number | null;
          updated_at?: string;
        };
        Update: {
          chain_id?: number | null;
          created_at?: string;
          expected_output?: string;
          id?: never;
          input_context?: string;
          is_active?: boolean;
          is_positive?: boolean;
          label?: string;
          notes?: string | null;
          step_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_examples_chain_id_fkey";
            columns: ["chain_id"];
            isOneToOne: false;
            referencedRelation: "prompt_chains";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generation_examples_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "prompt_chain_steps";
            referencedColumns: ["id"];
          },
        ];
      };
      generations: {
        Row: {
          completed_at: string | null;
          created_at: string;
          error_message: string | null;
          id: string;
          image_id: string;
          input_tokens: number | null;
          latency_ms: number | null;
          llm_model_id: number | null;
          model: string;
          output_tokens: number | null;
          prompt_chain_id: number | null;
          raw_response: Json | null;
          response_schema: Json | null;
          status: string;
          system_instruction: string;
          user_id: string;
          user_prompt: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          image_id: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          llm_model_id?: number | null;
          model: string;
          output_tokens?: number | null;
          prompt_chain_id?: number | null;
          raw_response?: Json | null;
          response_schema?: Json | null;
          status?: string;
          system_instruction: string;
          user_id: string;
          user_prompt: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          image_id?: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          llm_model_id?: number | null;
          model?: string;
          output_tokens?: number | null;
          prompt_chain_id?: number | null;
          raw_response?: Json | null;
          response_schema?: Json | null;
          status?: string;
          system_instruction?: string;
          user_id?: string;
          user_prompt?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generations_image_id_fkey";
            columns: ["image_id"];
            isOneToOne: false;
            referencedRelation: "images";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generations_llm_model_id_fkey";
            columns: ["llm_model_id"];
            isOneToOne: false;
            referencedRelation: "llm_models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generations_prompt_chain_id_fkey";
            columns: ["prompt_chain_id"];
            isOneToOne: false;
            referencedRelation: "prompt_chains";
            referencedColumns: ["id"];
          },
        ];
      };
      images: {
        Row: {
          created_at: string;
          file_name: string | null;
          height: number | null;
          id: string;
          mime_type: string | null;
          size_bytes: number | null;
          storage_path: string;
          user_id: string | null;
          width: number | null;
        };
        Insert: {
          created_at?: string;
          file_name?: string | null;
          height?: number | null;
          id?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          storage_path: string;
          user_id?: string | null;
          width?: number | null;
        };
        Update: {
          created_at?: string;
          file_name?: string | null;
          height?: number | null;
          id?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          storage_path?: string;
          user_id?: string | null;
          width?: number | null;
        };
        Relationships: [];
      };
      llm_models: {
        Row: {
          context_tokens: number | null;
          created_at: string;
          display_name: string;
          id: number;
          input_cost_per_mtok: number | null;
          is_active: boolean;
          is_default: boolean;
          max_output_tokens: number | null;
          notes: string | null;
          output_cost_per_mtok: number | null;
          provider_id: number;
          slug: string;
          supports_json: boolean;
          supports_vision: boolean;
          updated_at: string;
        };
        Insert: {
          context_tokens?: number | null;
          created_at?: string;
          display_name: string;
          id?: never;
          input_cost_per_mtok?: number | null;
          is_active?: boolean;
          is_default?: boolean;
          max_output_tokens?: number | null;
          notes?: string | null;
          output_cost_per_mtok?: number | null;
          provider_id: number;
          slug: string;
          supports_json?: boolean;
          supports_vision?: boolean;
          updated_at?: string;
        };
        Update: {
          context_tokens?: number | null;
          created_at?: string;
          display_name?: string;
          id?: never;
          input_cost_per_mtok?: number | null;
          is_active?: boolean;
          is_default?: boolean;
          max_output_tokens?: number | null;
          notes?: string | null;
          output_cost_per_mtok?: number | null;
          provider_id?: number;
          slug?: string;
          supports_json?: boolean;
          supports_vision?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "llm_models_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "llm_providers";
            referencedColumns: ["id"];
          },
        ];
      };
      llm_providers: {
        Row: {
          api_base_url: string | null;
          created_at: string;
          docs_url: string | null;
          env_key_name: string | null;
          id: number;
          is_active: boolean;
          name: string;
          notes: string | null;
          slug: string;
          updated_at: string;
        };
        Insert: {
          api_base_url?: string | null;
          created_at?: string;
          docs_url?: string | null;
          env_key_name?: string | null;
          id?: never;
          is_active?: boolean;
          name: string;
          notes?: string | null;
          slug: string;
          updated_at?: string;
        };
        Update: {
          api_base_url?: string | null;
          created_at?: string;
          docs_url?: string | null;
          env_key_name?: string | null;
          id?: never;
          is_active?: boolean;
          name?: string;
          notes?: string | null;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      llm_responses: {
        Row: {
          chain_id: number | null;
          created_at: string;
          error_message: string | null;
          generation_id: string | null;
          id: string;
          input_tokens: number | null;
          latency_ms: number | null;
          model_id: number | null;
          output_tokens: number | null;
          request_prompt: string | null;
          response_json: Json | null;
          response_text: string | null;
          run_id: string | null;
          status: string;
          step_id: number | null;
          step_number: number | null;
          temperature: number | null;
          user_id: string | null;
        };
        Insert: {
          chain_id?: number | null;
          created_at?: string;
          error_message?: string | null;
          generation_id?: string | null;
          id?: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          model_id?: number | null;
          output_tokens?: number | null;
          request_prompt?: string | null;
          response_json?: Json | null;
          response_text?: string | null;
          run_id?: string | null;
          status?: string;
          step_id?: number | null;
          step_number?: number | null;
          temperature?: number | null;
          user_id?: string | null;
        };
        Update: {
          chain_id?: number | null;
          created_at?: string;
          error_message?: string | null;
          generation_id?: string | null;
          id?: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          model_id?: number | null;
          output_tokens?: number | null;
          request_prompt?: string | null;
          response_json?: Json | null;
          response_text?: string | null;
          run_id?: string | null;
          status?: string;
          step_id?: number | null;
          step_number?: number | null;
          temperature?: number | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "llm_responses_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "prompt_chain_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "llm_responses_chain_id_fkey";
            columns: ["chain_id"];
            isOneToOne: false;
            referencedRelation: "prompt_chains";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "llm_responses_generation_id_fkey";
            columns: ["generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "llm_responses_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "llm_models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "llm_responses_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "prompt_chain_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "llm_responses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          current_streak: number;
          first_name: string | null;
          id: string;
          is_superadmin: boolean;
          last_name: string | null;
          last_vote_date: string | null;
          longest_streak: number;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          current_streak?: number;
          first_name?: string | null;
          id: string;
          is_superadmin?: boolean;
          last_name?: string | null;
          last_vote_date?: string | null;
          longest_streak?: number;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          current_streak?: number;
          first_name?: string | null;
          id?: string;
          is_superadmin?: boolean;
          last_name?: string | null;
          last_vote_date?: string | null;
          longest_streak?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      prompt_chain_mix: {
        Row: {
          chain_id: number;
          is_enabled: boolean;
          notes: string | null;
          updated_at: string;
          weight: number;
        };
        Insert: {
          chain_id: number;
          is_enabled?: boolean;
          notes?: string | null;
          updated_at?: string;
          weight?: number;
        };
        Update: {
          chain_id?: number;
          is_enabled?: boolean;
          notes?: string | null;
          updated_at?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "prompt_chain_mix_chain_id_fkey";
            columns: ["chain_id"];
            isOneToOne: true;
            referencedRelation: "prompt_chains";
            referencedColumns: ["id"];
          },
        ];
      };
      prompt_chain_runs: {
        Row: {
          chain_id: number;
          created_at: string;
          error_message: string | null;
          final_output: string | null;
          finished_at: string | null;
          generation_id: string | null;
          id: string;
          image_id: string | null;
          input_tokens: number | null;
          latency_ms: number | null;
          output_tokens: number | null;
          seed_input: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          chain_id: number;
          created_at?: string;
          error_message?: string | null;
          final_output?: string | null;
          finished_at?: string | null;
          generation_id?: string | null;
          id?: string;
          image_id?: string | null;
          input_tokens?: number | null;
          latency_ms?: number | null;
          output_tokens?: number | null;
          seed_input?: string | null;
          status?: string;
          user_id?: string;
        };
        Update: {
          chain_id?: number;
          created_at?: string;
          error_message?: string | null;
          final_output?: string | null;
          finished_at?: string | null;
          generation_id?: string | null;
          id?: string;
          image_id?: string | null;
          input_tokens?: number | null;
          latency_ms?: number | null;
          output_tokens?: number | null;
          seed_input?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prompt_chain_runs_chain_id_fkey";
            columns: ["chain_id"];
            isOneToOne: false;
            referencedRelation: "prompt_chains";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompt_chain_runs_generation_id_fkey";
            columns: ["generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompt_chain_runs_image_id_fkey";
            columns: ["image_id"];
            isOneToOne: false;
            referencedRelation: "images";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompt_chain_runs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      prompt_chain_steps: {
        Row: {
          chain_id: number;
          created_at: string;
          id: number;
          is_active: boolean;
          max_output_tokens: number | null;
          model_id: number | null;
          name: string;
          prompt_template: string;
          purpose: string | null;
          response_schema: Json | null;
          step_number: number;
          temperature: number | null;
          updated_at: string;
        };
        Insert: {
          chain_id: number;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          max_output_tokens?: number | null;
          model_id?: number | null;
          name: string;
          prompt_template: string;
          purpose?: string | null;
          response_schema?: Json | null;
          step_number: number;
          temperature?: number | null;
          updated_at?: string;
        };
        Update: {
          chain_id?: number;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          max_output_tokens?: number | null;
          model_id?: number | null;
          name?: string;
          prompt_template?: string;
          purpose?: string | null;
          response_schema?: Json | null;
          step_number?: number;
          temperature?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prompt_chain_steps_chain_id_fkey";
            columns: ["chain_id"];
            isOneToOne: false;
            referencedRelation: "prompt_chains";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompt_chain_steps_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "llm_models";
            referencedColumns: ["id"];
          },
        ];
      };
      prompt_chains: {
        Row: {
          created_at: string;
          description: string | null;
          id: number;
          is_active: boolean;
          name: string;
          slug: string;
          style: string | null;
          updated_at: string;
          voice: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: never;
          is_active?: boolean;
          name: string;
          slug: string;
          style?: string | null;
          updated_at?: string;
          voice?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: never;
          is_active?: boolean;
          name?: string;
          slug?: string;
          style?: string | null;
          updated_at?: string;
          voice?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "prompt_chains_voice_fkey";
            columns: ["voice"];
            isOneToOne: false;
            referencedRelation: "voices";
            referencedColumns: ["id"];
          },
        ];
      };
      terms: {
        Row: {
          category: string;
          created_at: string;
          definition: string;
          example_usage: string | null;
          id: number;
          is_active: boolean;
          term: string;
          updated_at: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          definition: string;
          example_usage?: string | null;
          id?: never;
          is_active?: boolean;
          term: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          definition?: string;
          example_usage?: string | null;
          id?: never;
          is_active?: boolean;
          term?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      voices: {
        Row: {
          created_at: string;
          id: string;
          instruction: string;
          is_active: boolean;
          label: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id: string;
          instruction: string;
          is_active?: boolean;
          label: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          instruction?: string;
          is_active?: boolean;
          label?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      votes: {
        Row: {
          caption_id: string;
          created_at: string;
          id: string;
          updated_at: string;
          user_id: string;
          value: number;
          vote_date: string;
        };
        Insert: {
          caption_id: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id: string;
          value: number;
          vote_date?: string;
        };
        Update: {
          caption_id?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
          value?: number;
          vote_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "votes_caption_id_fkey";
            columns: ["caption_id"];
            isOneToOne: false;
            referencedRelation: "captions";
            referencedColumns: ["id"];
          },
        ];
      };
      whitelisted_emails: {
        Row: {
          added_by: string | null;
          created_at: string;
          email: string;
          id: number;
          is_active: boolean;
          label: string | null;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          added_by?: string | null;
          created_at?: string;
          email: string;
          id?: never;
          is_active?: boolean;
          label?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Update: {
          added_by?: string | null;
          created_at?: string;
          email?: string;
          id?: never;
          is_active?: boolean;
          label?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whitelisted_emails_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      admin_users: {
        Row: {
          avatar_url: string | null;
          current_streak: number | null;
          email: string | null;
          first_name: string | null;
          id: string | null;
          is_superadmin: boolean | null;
          last_name: string | null;
          last_sign_in_at: string | null;
          last_vote_date: string | null;
          longest_streak: number | null;
          profile_created_at: string | null;
          signed_up_at: string | null;
        };
        Relationships: [];
      };
      all_time_leaderboard: {
        Row: {
          author_avatar_url: string | null;
          author_first_name: string | null;
          author_id: string | null;
          author_last_name: string | null;
          caption_created_at: string | null;
          caption_id: string | null;
          caption_text: string | null;
          downvotes: number | null;
          image_height: number | null;
          image_id: string | null;
          image_width: number | null;
          prompt: string | null;
          rank: number | null;
          score: number | null;
          storage_path: string | null;
          upvotes: number | null;
          voice: string | null;
          voice_label: string | null;
        };
        Relationships: [];
      };
      daily_leaderboard: {
        Row: {
          author_avatar_url: string | null;
          author_first_name: string | null;
          author_id: string | null;
          author_last_name: string | null;
          caption_created_at: string | null;
          caption_id: string | null;
          caption_text: string | null;
          downvotes: number | null;
          image_height: number | null;
          image_id: string | null;
          image_width: number | null;
          prompt: string | null;
          rank: number | null;
          score: number | null;
          storage_path: string | null;
          upvotes: number | null;
          voice: string | null;
          voice_label: string | null;
          vote_date: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      bump_caption_counts: {
        Args: {
          p_caption_id: string;
          p_down_delta: number;
          p_up_delta: number;
          p_vote_date: string;
        };
        Returns: undefined;
      };
      compact_prompt_chain_steps: {
        Args: { p_chain_id: number };
        Returns: undefined;
      };
      is_signup_allowed: { Args: { p_email: string }; Returns: boolean };
      is_superadmin: { Args: never; Returns: boolean };
      reorder_prompt_chain_step: {
        Args: { p_step_id: number; p_to_position: number };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type DefaultSchema = Database["public"];

export type Tables<
  T extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]),
> = (DefaultSchema["Tables"] & DefaultSchema["Views"])[T] extends {
  Row: infer R;
}
  ? R
  : never;

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Insert: infer I } ? I : never;

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Update: infer U } ? U : never;
