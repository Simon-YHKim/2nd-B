// GENERATED FILE -- do not hand-edit. Regenerate instead:
//   supabase gen types typescript --project-id zoacryukmdeivmolvyhj > src/lib/supabase/types.gen.ts
//   npm run type-check   # then fix anything the new types newly surface
//
// Regenerated 2026-08-20 against the live schema, which is now at 0137. The
// previous copy was generated at 0132 and had gone stale in the one way that
// matters for a generated file: it described a database that no longer exists.
// It still declared refund_reasoning_spend, which 0135 DROPPED, and it knew
// nothing of credit_ledger / credit_balance / credit_skus / credit_backfill_0135
// (0134-0135), reasoning_runs.credit_entry_ids (0135),
// paddle_webhook_events.provider / provider_conflict (0133) and .refund_review
// (0136), or spend_credits / expire_credit_lots / credit_summary_self.
//
// Drift here never breaks the build, which is exactly why it is worth closing:
// code touching an untyped table or RPC silently falls back to `any`, so the
// cost is type safety and the file never announces the loss.
//
// The schema SoT is db/migrations, NOT this file.

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
      ai_audit_log: {
        Row: {
          created_at: string
          id: string
          key_combo: string | null
          latency_ms: number
          model_used: string
          output_hash: string
          prompt_hash: string
          purpose: string | null
          reasoning_effort: string | null
          reasoning_vendor: string | null
          safety_zone: Database["public"]["Enums"]["safety_zone"]
          total_tokens: number | null
          user_id: string | null
          vertex_backend: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          key_combo?: string | null
          latency_ms: number
          model_used: string
          output_hash: string
          prompt_hash: string
          purpose?: string | null
          reasoning_effort?: string | null
          reasoning_vendor?: string | null
          safety_zone: Database["public"]["Enums"]["safety_zone"]
          total_tokens?: number | null
          user_id?: string | null
          vertex_backend: boolean
        }
        Update: {
          created_at?: string
          id?: string
          key_combo?: string | null
          latency_ms?: number
          model_used?: string
          output_hash?: string
          prompt_hash?: string
          purpose?: string | null
          reasoning_effort?: string | null
          reasoning_vendor?: string | null
          safety_zone?: Database["public"]["Enums"]["safety_zone"]
          total_tokens?: number | null
          user_id?: string | null
          vertex_backend?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_self_service_log: {
        Row: {
          action: string
          created_at: string
          effective_from: string | null
          eligibility: string | null
          eligibility_detail: Json | null
          id: string
          outcome: string
          paddle_adjustment_event_at: string | null
          paddle_adjustment_event_id: string | null
          paddle_adjustment_id: string | null
          paddle_adjustment_status: string | null
          paddle_subscription_id: string | null
          paddle_transaction_id: string | null
          provider_error: string | null
          provider_ref: string | null
          provider_refund_cents: number | null
          provider_refunded_at: string | null
          provider_status: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          effective_from?: string | null
          eligibility?: string | null
          eligibility_detail?: Json | null
          id?: string
          outcome?: string
          paddle_adjustment_event_at?: string | null
          paddle_adjustment_event_id?: string | null
          paddle_adjustment_id?: string | null
          paddle_adjustment_status?: string | null
          paddle_subscription_id?: string | null
          paddle_transaction_id?: string | null
          provider_error?: string | null
          provider_ref?: string | null
          provider_refund_cents?: number | null
          provider_refunded_at?: string | null
          provider_status?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          effective_from?: string | null
          eligibility?: string | null
          eligibility_detail?: Json | null
          id?: string
          outcome?: string
          paddle_adjustment_event_at?: string | null
          paddle_adjustment_event_id?: string | null
          paddle_adjustment_id?: string | null
          paddle_adjustment_status?: string | null
          paddle_subscription_id?: string | null
          paddle_transaction_id?: string | null
          provider_error?: string | null
          provider_ref?: string | null
          provider_refund_cents?: number | null
          provider_refunded_at?: string | null
          provider_status?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_self_service_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_usage: {
        Row: {
          ad_bonus: number
          count: number
          day: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_bonus?: number
          count?: number
          day: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_bonus?: number
          count?: number
          day?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clipper_template_moderation: {
        Row: {
          hidden_at: string | null
          report_count: number
          template_id: string
          updated_at: string
        }
        Insert: {
          hidden_at?: string | null
          report_count?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          hidden_at?: string | null
          report_count?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clipper_template_moderation_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: true
            referencedRelation: "clipper_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      clipper_templates: {
        Row: {
          ai_properties: Json
          base_kind: string
          created_at: string
          default_tags: string[]
          id: string
          is_shared: boolean
          name: Json
          owner_id: string
          slug: string
          target_category: string
          triggers: string[]
          updated_at: string
          what: Json
          wiki_target: string
        }
        Insert: {
          ai_properties?: Json
          base_kind: string
          created_at?: string
          default_tags?: string[]
          id?: string
          is_shared?: boolean
          name?: Json
          owner_id: string
          slug: string
          target_category?: string
          triggers?: string[]
          updated_at?: string
          what?: Json
          wiki_target?: string
        }
        Update: {
          ai_properties?: Json
          base_kind?: string
          created_at?: string
          default_tags?: string[]
          id?: string
          is_shared?: boolean
          name?: Json
          owner_id?: string
          slug?: string
          target_category?: string
          triggers?: string[]
          updated_at?: string
          what?: Json
          wiki_target?: string
        }
        Relationships: [
          {
            foreignKeyName: "clipper_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          max_uses: number
          room_id: string
          token_hash: string
          used_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          max_uses?: number
          room_id: string
          token_hash: string
          used_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          max_uses?: number
          room_id?: string
          token_hash?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_invites_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "community_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      community_message_reports: {
        Row: {
          created_at: string
          id: string
          message_id: string
          reason: string
          reporter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          reason: string
          reporter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          reason?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_message_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          room_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          room_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          room_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "community_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_profiles: {
        Row: {
          alias: string
          created_at: string
          user_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          user_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_room_members: {
        Row: {
          joined_at: string
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: string
          room_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "community_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_rooms: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          last_message_at: string
          title: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          last_message_at?: string
          title?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          last_message_at?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_changes: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          pref_key: string
          ua_hash: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          pref_key: string
          ua_hash?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          pref_key?: string
          ua_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_changes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          age_band: string
          consent_version: string
          created_at: string
          id: string
          ip_hash: string | null
          llm_processing_ack: boolean
          locale: string
          minor_tier: string | null
          optional_consents: Json
          overseas_transfer_ack: boolean
          policy_version: string
          purposes: Json
          required_ack: boolean
          safety_notice_ack: boolean | null
          sensitive_data_ack: boolean
          terms_version: string
          ua_hash: string | null
          user_id: string
        }
        Insert: {
          age_band: string
          consent_version: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          llm_processing_ack?: boolean
          locale: string
          minor_tier?: string | null
          optional_consents?: Json
          overseas_transfer_ack?: boolean
          policy_version: string
          purposes?: Json
          required_ack?: boolean
          safety_notice_ack?: boolean | null
          sensitive_data_ack?: boolean
          terms_version: string
          ua_hash?: string | null
          user_id: string
        }
        Update: {
          age_band?: string
          consent_version?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          llm_processing_ack?: boolean
          locale?: string
          minor_tier?: string | null
          optional_consents?: Json
          overseas_transfer_ack?: boolean
          policy_version?: string
          purposes?: Json
          required_ack?: boolean
          safety_notice_ack?: boolean | null
          sensitive_data_ack?: boolean
          terms_version?: string
          ua_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "clipper_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_backfill_0135: {
        Row: {
          captured_at: string
          decision: string
          lot_id: string | null
          month_bucket: string
          reward_consumed_at_cutover: number
          reward_credits_at_cutover: number
          user_id: string
        }
        Insert: {
          captured_at?: string
          decision: string
          lot_id?: string | null
          month_bucket: string
          reward_consumed_at_cutover: number
          reward_credits_at_cutover: number
          user_id: string
        }
        Update: {
          captured_at?: string
          decision?: string
          lot_id?: string | null
          month_bucket?: string
          reward_consumed_at_cutover?: number
          reward_credits_at_cutover?: number
          user_id?: string
        }
        Relationships: []
      }
      credit_balance: {
        Row: {
          balance_available: number
          lifetime_granted: number
          lifetime_spent: number
          next_expiry_at: string | null
          next_expiry_units: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_available?: number
          lifetime_granted?: number
          lifetime_spent?: number
          next_expiry_at?: string | null
          next_expiry_units?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_available?: number
          lifetime_granted?: number
          lifetime_spent?: number
          next_expiry_at?: string | null
          next_expiry_units?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_balance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          amount_cents: number | null
          created_at: string
          currency: string | null
          feature: string | null
          id: string
          idempotency_key: string | null
          kind: string
          lot_expires_at: string | null
          lot_id: string
          lot_opened_at: string
          memo: string | null
          provider: string | null
          provider_event_id: string | null
          sku: string | null
          units: number
          user_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          feature?: string | null
          id?: string
          idempotency_key?: string | null
          kind: string
          lot_expires_at?: string | null
          lot_id: string
          lot_opened_at: string
          memo?: string | null
          provider?: string | null
          provider_event_id?: string | null
          sku?: string | null
          units: number
          user_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          feature?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          lot_expires_at?: string | null
          lot_id?: string
          lot_opened_at?: string
          memo?: string | null
          provider?: string | null
          provider_event_id?: string | null
          sku?: string | null
          units?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_skus: {
        Row: {
          active: boolean
          created_at: string
          price_krw: number
          sku: string
          units: number
          validity_days: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          price_krw: number
          sku: string
          units: number
          validity_days?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          price_krw?: number
          sku?: string
          units?: number
          validity_days?: number | null
        }
        Relationships: []
      }
      crisis_events: {
        Row: {
          classifier_confidence: number | null
          created_at: string
          id: string
          locale: string
          notes: string | null
          occurred_at: string
          resolved: boolean
          routing_template_version: string
          trigger_categories: string[]
          user_id_hash: string | null
          zone: string
        }
        Insert: {
          classifier_confidence?: number | null
          created_at?: string
          id?: string
          locale: string
          notes?: string | null
          occurred_at?: string
          resolved?: boolean
          routing_template_version: string
          trigger_categories?: string[]
          user_id_hash?: string | null
          zone: string
        }
        Update: {
          classifier_confidence?: number | null
          created_at?: string
          id?: string
          locale?: string
          notes?: string | null
          occurred_at?: string
          resolved?: boolean
          routing_template_version?: string
          trigger_categories?: string[]
          user_id_hash?: string | null
          zone?: string
        }
        Relationships: []
      }
      esm_responses: {
        Row: {
          context_tags: string[]
          created_at: string
          id: string
          prompt_kind: string
          scale_value: number | null
          user_id: string
        }
        Insert: {
          context_tags?: string[]
          created_at?: string
          id?: string
          prompt_kind: string
          scale_value?: number | null
          user_id: string
        }
        Update: {
          context_tags?: string[]
          created_at?: string
          id?: string
          prompt_kind?: string
          scale_value?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "esm_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gemini_spend_daily: {
        Row: {
          calls: number
          day: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calls?: number
          day: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calls?: number
          day?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gemini_spend_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_consents: {
        Row: {
          child_user_id: string
          consent_method: string
          consent_scope: string
          guardian_email: string
          guardian_name: string | null
          id: string
          requested_at: string
          revoked_at: string | null
          verification_token_hash: string | null
          verified_at: string | null
        }
        Insert: {
          child_user_id: string
          consent_method?: string
          consent_scope?: string
          guardian_email: string
          guardian_name?: string | null
          id?: string
          requested_at?: string
          revoked_at?: string | null
          verification_token_hash?: string | null
          verified_at?: string | null
        }
        Update: {
          child_user_id?: string
          consent_method?: string
          consent_scope?: string
          guardian_email?: string
          guardian_name?: string | null
          id?: string
          requested_at?: string
          revoked_at?: string | null
          verification_token_hash?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardian_consents_child_user_id_fkey"
            columns: ["child_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      health_samples: {
        Row: {
          created_at: string | null
          ended_at: string | null
          external_id: string | null
          id: string
          metadata: Json
          metric_type: string
          source: string
          started_at: string
          unit: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          metric_type: string
          source: string
          started_at: string
          unit: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          metric_type?: string
          source?: string
          started_at?: string
          unit?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "health_samples_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      informant_consents: {
        Row: {
          consent_at: string
          created_at: string
          gdpr_lawful_basis: string
          guardian_consent_at: string | null
          guardian_verification_token_hash: string | null
          id: string
          informant_is_minor: boolean
          invitation_id: string
          ip_hash: string | null
          llm_processing_ack: boolean
          overseas_transfer_ack: boolean
          subject_user_id: string
          ua_hash: string | null
          withdrawn_at: string | null
        }
        Insert: {
          consent_at: string
          created_at?: string
          gdpr_lawful_basis?: string
          guardian_consent_at?: string | null
          guardian_verification_token_hash?: string | null
          id?: string
          informant_is_minor?: boolean
          invitation_id: string
          ip_hash?: string | null
          llm_processing_ack?: boolean
          overseas_transfer_ack?: boolean
          subject_user_id: string
          ua_hash?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          consent_at?: string
          created_at?: string
          gdpr_lawful_basis?: string
          guardian_consent_at?: string | null
          guardian_verification_token_hash?: string | null
          id?: string
          informant_is_minor?: boolean
          invitation_id?: string
          ip_hash?: string | null
          llm_processing_ack?: boolean
          overseas_transfer_ack?: boolean
          subject_user_id?: string
          ua_hash?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "informant_consents_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "peer_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "informant_consents_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_log: {
        Row: {
          content_hash: string | null
          dropped_at: string
          id: string
          reason: string | null
          stage: string
          survivor_id: string | null
          user_id: string
        }
        Insert: {
          content_hash?: string | null
          dropped_at?: string
          id?: string
          reason?: string | null
          stage: string
          survivor_id?: string | null
          user_id: string
        }
        Update: {
          content_hash?: string | null
          dropped_at?: string
          id?: string
          reason?: string | null
          stage?: string
          survivor_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_log_survivor_id_fkey"
            columns: ["survivor_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          added_by: string | null
          age_range: string | null
          application_notes: string | null
          authors: string[] | null
          created_at: string
          doi: string | null
          framework: string | null
          id: string
          locale: string | null
          summary_en: string | null
          summary_ko: string | null
          title: string
          url: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          added_by?: string | null
          age_range?: string | null
          application_notes?: string | null
          authors?: string[] | null
          created_at?: string
          doi?: string | null
          framework?: string | null
          id?: string
          locale?: string | null
          summary_en?: string | null
          summary_ko?: string | null
          title: string
          url?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          added_by?: string | null
          age_range?: string | null
          application_notes?: string | null
          authors?: string[] | null
          created_at?: string
          doi?: string | null
          framework?: string | null
          id?: string
          locale?: string | null
          summary_en?: string | null
          summary_ko?: string | null
          title?: string
          url?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_sources_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      memorized_patterns: {
        Row: {
          created_at: string
          evidence_batches: string[]
          id: string
          pattern_kind: string
          recorded_zone: string
          summary: string
          triggers: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          evidence_batches?: string[]
          id?: string
          pattern_kind: string
          recorded_zone: string
          summary: string
          triggers?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          evidence_batches?: string[]
          id?: string
          pattern_kind?: string
          recorded_zone?: string
          summary?: string
          triggers?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memorized_patterns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          body_en: string
          body_ko: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notice_kind"]
          min_app_version: string | null
          published_at: string
          title_en: string
          title_ko: string
          withdrawn_at: string | null
        }
        Insert: {
          body_en: string
          body_ko: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notice_kind"]
          min_app_version?: string | null
          published_at?: string
          title_en: string
          title_ko: string
          withdrawn_at?: string | null
        }
        Update: {
          body_en?: string
          body_ko?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notice_kind"]
          min_app_version?: string | null
          published_at?: string
          title_en?: string
          title_ko?: string
          withdrawn_at?: string | null
        }
        Relationships: []
      }
      ops_daily_brief: {
        Row: {
          brief: Json
          created_at: string
          day: string
          user_id: string
        }
        Insert: {
          brief?: Json
          created_at?: string
          day: string
          user_id: string
        }
        Update: {
          brief?: Json
          created_at?: string
          day?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_daily_brief_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_ledger: {
        Row: {
          amount_krw: number
          category: string
          created_at: string
          id: string
          kind: string
          note: string | null
          occurred_on: string
          user_id: string
        }
        Insert: {
          amount_krw: number
          category?: string
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          occurred_on?: string
          user_id: string
        }
        Update: {
          amount_krw?: number
          category?: string
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          occurred_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_meal_plan: {
        Row: {
          created_at: string
          id: string
          kcal: number | null
          plan_date: string
          slot: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kcal?: number | null
          plan_date: string
          slot: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kcal?: number | null
          plan_date?: string
          slot?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_meal_plan_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_milestones: {
        Row: {
          created_at: string
          domain_id: string
          id: string
          note: string | null
          status: string
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain_id: string
          id?: string
          note?: string | null
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          domain_id?: string
          id?: string
          note?: string | null
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_milestones_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_reading: {
        Row: {
          authors: Json
          created_at: string
          current_page: number
          id: string
          status: string
          title: string
          total_pages: number | null
          updated_at: string
          user_id: string
          volume_id: string
        }
        Insert: {
          authors?: Json
          created_at?: string
          current_page?: number
          id?: string
          status?: string
          title: string
          total_pages?: number | null
          updated_at?: string
          user_id: string
          volume_id: string
        }
        Update: {
          authors?: Json
          created_at?: string
          current_page?: number
          id?: string
          status?: string
          title?: string
          total_pages?: number | null
          updated_at?: string
          user_id?: string
          volume_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_reading_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_routine_logs: {
        Row: {
          completed_on: string
          created_at: string
          id: string
          routine_id: string
          source_sample_id: string | null
          user_id: string
        }
        Insert: {
          completed_on: string
          created_at?: string
          id?: string
          routine_id: string
          source_sample_id?: string | null
          user_id: string
        }
        Update: {
          completed_on?: string
          created_at?: string
          id?: string
          routine_id?: string
          source_sample_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_routine_logs_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "ops_routines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_routine_logs_source_sample_id_fkey"
            columns: ["source_sample_id"]
            isOneToOne: false
            referencedRelation: "health_samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_routine_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_routines: {
        Row: {
          active: boolean
          checklist: Json
          created_at: string
          domain_id: string
          duration_minutes: number | null
          id: string
          reason: string | null
          recurrence: string
          reminder_time: string | null
          title: string
          user_id: string
          weekday: number | null
        }
        Insert: {
          active?: boolean
          checklist?: Json
          created_at?: string
          domain_id: string
          duration_minutes?: number | null
          id?: string
          reason?: string | null
          recurrence?: string
          reminder_time?: string | null
          title: string
          user_id: string
          weekday?: number | null
        }
        Update: {
          active?: boolean
          checklist?: Json
          created_at?: string
          domain_id?: string
          duration_minutes?: number | null
          id?: string
          reason?: string | null
          recurrence?: string
          reminder_time?: string | null
          title?: string
          user_id?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_routines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      paddle_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          occurred_at: string | null
          paddle_subscription_id: string | null
          paddle_transaction_id: string | null
          payment_card_brand: string | null
          payment_card_last4: string | null
          payment_method: string | null
          processed_at: string
          provider: string
          provider_conflict: boolean
          raw_payload: Json | null
          refund_review: boolean
          scheduled_cancel_at: string | null
          stale_entitlement: boolean
          user_id: string | null
        }
        Insert: {
          event_id: string
          event_type: string
          occurred_at?: string | null
          paddle_subscription_id?: string | null
          paddle_transaction_id?: string | null
          payment_card_brand?: string | null
          payment_card_last4?: string | null
          payment_method?: string | null
          processed_at?: string
          provider?: string
          provider_conflict?: boolean
          raw_payload?: Json | null
          refund_review?: boolean
          scheduled_cancel_at?: string | null
          stale_entitlement?: boolean
          user_id?: string | null
        }
        Update: {
          event_id?: string
          event_type?: string
          occurred_at?: string | null
          paddle_subscription_id?: string | null
          paddle_transaction_id?: string | null
          payment_card_brand?: string | null
          payment_card_last4?: string | null
          payment_method?: string | null
          processed_at?: string
          provider?: string
          provider_conflict?: boolean
          raw_payload?: Json | null
          refund_review?: boolean
          scheduled_cancel_at?: string | null
          stale_entitlement?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paddle_webhook_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_invitations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invite_token_hash: string
          invited_label: string | null
          relation_kind: string
          responded_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          invite_token_hash: string
          invited_label?: string | null
          relation_kind: string
          responded_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invite_token_hash?: string
          invited_label?: string | null
          relation_kind?: string
          responded_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_invitations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_observations: {
        Row: {
          created_at: string
          id: string
          informant_consent_id: string
          invitation_id: string
          ratings: Json
          subject_user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          informant_consent_id: string
          invitation_id: string
          ratings: Json
          subject_user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          informant_consent_id?: string
          invitation_id?: string
          ratings?: Json
          subject_user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "peer_observations_informant_consent_id_fkey"
            columns: ["informant_consent_id"]
            isOneToOne: false
            referencedRelation: "informant_consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_observations_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "peer_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_observations_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_entity: {
        Row: {
          created_at: string
          embedding: string | null
          id: string
          kind: string
          label: string
          name: string
          props: Json
          sublabel: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          id?: string
          kind?: string
          label: string
          name: string
          props?: Json
          sublabel?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          id?: string
          kind?: string
          label?: string
          name?: string
          props?: Json
          sublabel?: string | null
          user_id?: string
        }
        Relationships: []
      }
      persona_reasoning_trace: {
        Row: {
          created_at: string
          detail: Json
          entity_id: string | null
          id: string
          source: string
          step: number
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          entity_id?: string | null
          id?: string
          source: string
          step: number
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: Json
          entity_id?: string | null
          id?: string
          source?: string
          step?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_reasoning_trace_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "persona_entity"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_relation: {
        Row: {
          created_at: string
          dst: string
          id: string
          props: Json
          rel_type: string
          src: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          dst: string
          id?: string
          props?: Json
          rel_type: string
          src: string
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          dst?: string
          id?: string
          props?: Json
          rel_type?: string
          src?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "persona_relation_dst_fkey"
            columns: ["dst"]
            isOneToOne: false
            referencedRelation: "persona_entity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_relation_src_fkey"
            columns: ["src"]
            isOneToOne: false
            referencedRelation: "persona_entity"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          created_at: string
          id: string
          markdown_export: string | null
          patterns: Json | null
          traits: Json
          user_id: string
          values: Json | null
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          markdown_export?: string | null
          patterns?: Json | null
          traits: Json
          user_id: string
          values?: Json | null
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          markdown_export?: string | null
          patterns?: Json | null
          traits?: Json
          user_id?: string
          values?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "personas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reasoning_run_proposals: {
        Row: {
          kind: string
          ordinal: number
          payload: Json
          run_id: string
          status: string
          updated_at: string
        }
        Insert: {
          kind?: string
          ordinal: number
          payload: Json
          run_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          kind?: string
          ordinal?: number
          payload?: Json
          run_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reasoning_run_proposals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "reasoning_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      reasoning_runs: {
        Row: {
          created_at: string
          credit_entry_ids: string[] | null
          error_code: string | null
          id: string
          idempotency_key: string
          item_count: number
          month_bucket: string
          spend: string
          status: string
          trigger_kind: string
          updated_at: string
          user_id: string
          week_bucket: string
        }
        Insert: {
          created_at?: string
          credit_entry_ids?: string[] | null
          error_code?: string | null
          id?: string
          idempotency_key: string
          item_count?: number
          month_bucket: string
          spend: string
          status?: string
          trigger_kind: string
          updated_at?: string
          user_id: string
          week_bucket: string
        }
        Update: {
          created_at?: string
          credit_entry_ids?: string[] | null
          error_code?: string | null
          id?: string
          idempotency_key?: string
          item_count?: number
          month_bucket?: string
          spend?: string
          status?: string
          trigger_kind?: string
          updated_at?: string
          user_id?: string
          week_bucket?: string
        }
        Relationships: []
      }
      records: {
        Row: {
          ai_followup: Json | null
          audit_period: string | null
          body: string
          conclusion: string | null
          created_at: string
          embedding: string | null
          id: string
          kind: Database["public"]["Enums"]["record_kind"]
          prompt: string | null
          self_context_id: string | null
          structured: Json | null
          summary: string | null
          tags: string[]
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_followup?: Json | null
          audit_period?: string | null
          body: string
          conclusion?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          kind: Database["public"]["Enums"]["record_kind"]
          prompt?: string | null
          self_context_id?: string | null
          structured?: Json | null
          summary?: string | null
          tags?: string[]
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_followup?: Json | null
          audit_period?: string | null
          body?: string
          conclusion?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["record_kind"]
          prompt?: string | null
          self_context_id?: string | null
          structured?: Json | null
          summary?: string | null
          tags?: string[]
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "records_self_context_id_fkey"
            columns: ["self_context_id"]
            isOneToOne: false
            referencedRelation: "self_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recreation_items: {
        Row: {
          category: string
          created_at: string
          id: string
          note: string | null
          occurred_on: string | null
          rating: number | null
          status: string
          tags: string[]
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on?: string | null
          rating?: number | null
          status?: string
          tags?: string[]
          title: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          note?: string | null
          occurred_on?: string | null
          rating?: number | null
          status?: string
          tags?: string[]
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recreation_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      relation_people: {
        Row: {
          closeness: number | null
          contact_cadence: string | null
          created_at: string
          display_name: string
          id: string
          last_interaction_on: string | null
          note: string | null
          relation_kind: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          closeness?: number | null
          contact_cadence?: string | null
          created_at?: string
          display_name: string
          id?: string
          last_interaction_on?: string | null
          note?: string | null
          relation_kind?: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          closeness?: number | null
          contact_cadence?: string | null
          created_at?: string
          display_name?: string
          id?: string
          last_interaction_on?: string | null
          note?: string | null
          relation_kind?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relation_people_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_events: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          customer_relation_type: Database["public"]["Enums"]["customer_relation"]
          external_id: string | null
          id: string
          is_related_party: boolean
          month_bucket: string
          occurred_at: string
          source: string
          user_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          customer_relation_type: Database["public"]["Enums"]["customer_relation"]
          external_id?: string | null
          id?: string
          is_related_party: boolean
          month_bucket: string
          occurred_at: string
          source: string
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_relation_type?: Database["public"]["Enums"]["customer_relation"]
          external_id?: string | null
          id?: string
          is_related_party?: boolean
          month_bucket?: string
          occurred_at?: string
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rewarded_ssv_txns: {
        Row: {
          granted_at: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          transaction_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewarded_ssv_txns_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_flags: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      self_contexts: {
        Row: {
          context_kind: string
          created_at: string
          id: string
          label: string
          user_id: string
        }
        Insert: {
          context_kind: string
          created_at?: string
          id?: string
          label: string
          user_id: string
        }
        Update: {
          context_kind?: string
          created_at?: string
          id?: string
          label?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "self_contexts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          captured_at: string
          content_hash: string | null
          dedup_bands: string[] | null
          dedup_of: string | null
          dedup_signature: number[] | null
          frontmatter: Json
          id: string
          ingested: boolean
          ingested_at: string | null
          kind: string
          relevance_score: number | null
          simon_relevance: number | null
          source_url: string | null
          storage_path: string
          tags: string[]
          title: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          content_hash?: string | null
          dedup_bands?: string[] | null
          dedup_of?: string | null
          dedup_signature?: number[] | null
          frontmatter?: Json
          id?: string
          ingested?: boolean
          ingested_at?: string | null
          kind: string
          relevance_score?: number | null
          simon_relevance?: number | null
          source_url?: string | null
          storage_path: string
          tags?: string[]
          title: string
          user_id: string
        }
        Update: {
          captured_at?: string
          content_hash?: string | null
          dedup_bands?: string[] | null
          dedup_of?: string | null
          dedup_signature?: number[] | null
          frontmatter?: Json
          id?: string
          ingested?: boolean
          ingested_at?: string | null
          kind?: string
          relevance_score?: number | null
          simon_relevance?: number | null
          source_url?: string | null
          storage_path?: string
          tags?: string[]
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_dedup_of_fkey"
            columns: ["dedup_of"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      srs_cards: {
        Row: {
          back: string
          created_at: string | null
          deck: string | null
          difficulty: number | null
          due: string
          elapsed_days: number | null
          front: string
          id: string
          lapses: number
          last_review: string | null
          reps: number
          scheduled_days: number | null
          stability: number | null
          state: number
          user_id: string
        }
        Insert: {
          back: string
          created_at?: string | null
          deck?: string | null
          difficulty?: number | null
          due: string
          elapsed_days?: number | null
          front: string
          id?: string
          lapses?: number
          last_review?: string | null
          reps?: number
          scheduled_days?: number | null
          stability?: number | null
          state?: number
          user_id: string
        }
        Update: {
          back?: string
          created_at?: string | null
          deck?: string | null
          difficulty?: number | null
          due?: string
          elapsed_days?: number | null
          front?: string
          id?: string
          lapses?: number
          last_review?: string | null
          reps?: number
          scheduled_days?: number | null
          stability?: number | null
          state?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "srs_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      srs_reviews: {
        Row: {
          card_id: string
          created_at: string | null
          id: string
          rating: number
          reviewed_on: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string | null
          id?: string
          rating: number
          reviewed_on: string
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string | null
          id?: string
          rating?: number
          reviewed_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "srs_reviews_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "srs_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "srs_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      star_tier_history: {
        Row: {
          evidence_citations: string[] | null
          evidence_origin: string | null
          id: string
          level: number
          recorded_at: string
          star_id: string
          user_id: string
        }
        Insert: {
          evidence_citations?: string[] | null
          evidence_origin?: string | null
          id?: string
          level: number
          recorded_at?: string
          star_id: string
          user_id: string
        }
        Update: {
          evidence_citations?: string[] | null
          evidence_origin?: string | null
          id?: string
          level?: number
          recorded_at?: string
          star_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "star_tier_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      template_blocks: {
        Row: {
          blocked_owner_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_owner_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_owner_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_blocks_blocked_owner_id_fkey"
            columns: ["blocked_owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          approved_for_public: boolean
          body: string
          consent_given_at: string
          consent_ip: unknown
          created_at: string
          id: string
          locale: string
          share_with_judges_flag: boolean
          user_id: string
        }
        Insert: {
          approved_for_public?: boolean
          body: string
          consent_given_at: string
          consent_ip?: unknown
          created_at?: string
          id?: string
          locale: string
          share_with_judges_flag?: boolean
          user_id: string
        }
        Update: {
          approved_for_public?: boolean
          body?: string
          consent_given_at?: string
          consent_ip?: unknown
          created_at?: string
          id?: string
          locale?: string
          share_with_judges_flag?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          chat_ad_credits: number
          month_bucket: string
          reasoning_used: number
          reward_consumed: number
          reward_credits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_ad_credits?: number
          month_bucket: string
          reasoning_used?: number
          reward_consumed?: number
          reward_credits?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_ad_credits?: number
          month_bucket?: string
          reasoning_used?: number
          reward_consumed?: number
          reward_credits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notice_reads: {
        Row: {
          id: string
          notice_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notice_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notice_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notice_reads_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notice_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          account_status: string
          birth_date: string
          coachmarks_seen: Json
          consent_share_with_judges: boolean
          created_at: string
          display_name: string | null
          email: string
          id: string
          judge_mode: boolean
          locale: string
          minor_tier: string | null
          onboarding_quest_completed_at: string | null
          privacy_prefs: Json
          profile_details: Json
          reasoning_prefs: Json
          subscription_event_at: string | null
          subscription_expires_at: string | null
          subscription_provider: string | null
          subscription_tier: string
          total_xp: number
          updated_at: string
        }
        Insert: {
          account_status?: string
          birth_date: string
          coachmarks_seen?: Json
          consent_share_with_judges?: boolean
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          judge_mode?: boolean
          locale?: string
          minor_tier?: string | null
          onboarding_quest_completed_at?: string | null
          privacy_prefs?: Json
          profile_details?: Json
          reasoning_prefs?: Json
          subscription_event_at?: string | null
          subscription_expires_at?: string | null
          subscription_provider?: string | null
          subscription_tier?: string
          total_xp?: number
          updated_at?: string
        }
        Update: {
          account_status?: string
          birth_date?: string
          coachmarks_seen?: Json
          consent_share_with_judges?: boolean
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          judge_mode?: boolean
          locale?: string
          minor_tier?: string | null
          onboarding_quest_completed_at?: string | null
          privacy_prefs?: Json
          profile_details?: Json
          reasoning_prefs?: Json
          subscription_event_at?: string | null
          subscription_expires_at?: string | null
          subscription_provider?: string | null
          subscription_tier?: string
          total_xp?: number
          updated_at?: string
        }
        Relationships: []
      }
      wiki_links: {
        Row: {
          confidence: number
          created_at: string
          from_page: string
          relation_type: string
          to_page: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          from_page: string
          relation_type?: string
          to_page: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          from_page?: string
          relation_type?: string
          to_page?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_links_from_fk"
            columns: ["user_id", "from_page"]
            isOneToOne: false
            referencedRelation: "wiki_pages"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "wiki_links_to_fk"
            columns: ["user_id", "to_page"]
            isOneToOne: false
            referencedRelation: "wiki_pages"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      wiki_pages: {
        Row: {
          body_md: string
          created_at: string
          embedding: string | null
          frontmatter: Json
          id: string
          kind: string
          slug: string
          source_id: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body_md?: string
          created_at?: string
          embedding?: string | null
          frontmatter?: Json
          id?: string
          kind: string
          slug: string
          source_id?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body_md?: string
          created_at?: string
          embedding?: string | null
          frontmatter?: Json
          id?: string
          kind?: string
          slug?: string
          source_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_pages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiki_pages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_events: {
        Row: {
          action: string
          created_at: string
          id: string
          level_after: number
          total_after: number
          user_id: string
          xp_delta: number
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          level_after: number
          total_after: number
          user_id: string
          xp_delta: number
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          level_after?: number
          total_after?: number
          user_id?: string
          xp_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "xp_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_rules: {
        Row: {
          action: string
          once_only: boolean
          xp_value: number
        }
        Insert: {
          action: string
          once_only?: boolean
          xp_value: number
        }
        Update: {
          action?: string
          once_only?: boolean
          xp_value?: number
        }
        Relationships: []
      }
    }
    Views: {
      ai_audit_daily_health: {
        Row: {
          avg_latency_ms: number | null
          calls: number | null
          day: string | null
          degraded_upstream: number | null
          null_purpose_rows: number | null
          purpose: string | null
          red_rows: number | null
          semantic_dark_rows: number | null
          total_tokens: number | null
          vendor: string | null
        }
        Relationships: []
      }
      credit_balance_drift: {
        Row: {
          cached: number | null
          drift: number | null
          ledger_total: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_balance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_counter_drift: {
        Row: {
          ledger_available: number | null
          ledger_earned: number | null
          mirrored_consumed: number | null
          mirrored_earned: number | null
          user_id: string | null
        }
        Insert: {
          ledger_available?: never
          ledger_earned?: never
          mirrored_consumed?: number | null
          mirrored_earned?: number | null
          user_id?: string | null
        }
        Update: {
          ledger_available?: never
          ledger_earned?: never
          mirrored_consumed?: number | null
          mirrored_earned?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_billing_event: {
        Args: {
          p_amount_cents: number
          p_card_brand?: string
          p_card_last4?: string
          p_currency: string
          p_event_id: string
          p_event_type: string
          p_expires_at: string
          p_is_related_party?: boolean
          p_occurred_at: string
          p_payment_method?: string
          p_provider: string
          p_relation?: Database["public"]["Enums"]["customer_relation"]
          p_scheduled_cancel_at?: string
          p_source?: string
          p_subscription_id?: string
          p_tier: string
          p_transaction_id?: string
          p_user_id: string
        }
        Returns: string
      }
      apply_billing_refund: {
        Args: {
          p_adjustment_id: string
          p_amount_cents: number
          p_currency: string
          p_event_id: string
          p_event_type: string
          p_is_full?: boolean
          p_occurred_at: string
          p_subscription_id: string
          p_transaction_id: string
        }
        Returns: string
      }
      award_xp: { Args: { p_action: string }; Returns: Json }
      billing_request_role: { Args: never; Returns: string }
      bump_chat_usage: {
        Args: { p_day: string; p_user_id: string }
        Returns: number
      }
      bump_chat_usage_if_under_cap: {
        Args: { p_cap: number; p_day: string; p_user_id: string }
        Returns: number
      }
      bump_gemini_spend: {
        Args: { p_cap: number; p_day: string; p_user_id: string }
        Returns: number
      }
      bump_reasoning_usage_if_under_cap:
        | {
            Args: { p_cap: number; p_month: string; p_user_id: string }
            Returns: number
          }
        | {
            Args: {
              p_cap: number
              p_key: string
              p_month: string
              p_user_id: string
            }
            Returns: number
          }
      bump_reward_credits_if_under_cap: {
        Args: { p_credits: number; p_month: string; p_user_id: string }
        Returns: number
      }
      cancel_reasoning_run: {
        Args: { p_run_id: string; p_user_id: string }
        Returns: boolean
      }
      claim_billing_self_service: {
        Args: {
          p_action: string
          p_effective_from: string
          p_eligibility: string
          p_eligibility_detail: Json
          p_user_id: string
        }
        Returns: Json
      }
      claim_peer_invitation: {
        Args: { p_invitation_id: string }
        Returns: boolean
      }
      clawback_credits: {
        Args: {
          p_memo?: string
          p_provider: string
          p_provider_event_id: string
        }
        Returns: Json
      }
      community_assert_adult: { Args: never; Returns: undefined }
      community_create_invite: {
        Args: { p_max_uses: number; p_room: string; p_token_hash: string }
        Returns: string
      }
      community_create_room: {
        Args: { p_kind: string; p_title: string }
        Returns: string
      }
      community_ensure_profile: { Args: { p_alias: string }; Returns: string }
      community_is_member: {
        Args: { p_room: string; p_user: string }
        Returns: boolean
      }
      community_join: { Args: { p_token: string }; Returns: string }
      complete_reasoning_run: {
        Args: { p_proposals: Json; p_run_id: string; p_user_id: string }
        Returns: number
      }
      credit_ad_earned_this_month: {
        Args: { p_at?: string; p_user_id: string }
        Returns: number
      }
      credit_available: {
        Args: { p_at?: string; p_user_id: string }
        Returns: number
      }
      credit_refund_spend_internal: {
        Args: { p_entry_id: string; p_memo?: string }
        Returns: string
      }
      credit_summary_self: { Args: never; Returns: Json }
      effective_subscription_tier: {
        Args: { p_user_id: string }
        Returns: string
      }
      email_canonical: { Args: { p_email: string }; Returns: string }
      expire_credit_lots: {
        Args: { p_at?: string; p_limit?: number }
        Returns: number
      }
      fail_reasoning_run: {
        Args: { p_code: string; p_run_id: string; p_user_id: string }
        Returns: boolean
      }
      grant_chat_ad_bonus: { Args: { p_user_id: string }; Returns: number }
      grant_chat_ad_bonus_ssv: {
        Args: { p_txn_id: string; p_user_id: string }
        Returns: number
      }
      grant_credits_free: {
        Args: {
          p_expires_at?: string
          p_kind: string
          p_memo?: string
          p_units: number
          p_user_id: string
        }
        Returns: string
      }
      grant_credits_free_internal: {
        Args: {
          p_expires_at?: string
          p_idempotency_key?: string
          p_kind: string
          p_memo?: string
          p_units: number
          p_user_id: string
        }
        Returns: string
      }
      grant_credits_purchase: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_expires_at?: string
          p_provider: string
          p_provider_event_id: string
          p_sku: string
          p_units: number
          p_user_id: string
        }
        Returns: string
      }
      grant_reward_credits_ssv: {
        Args: {
          p_grant: number
          p_month: string
          p_txn_id: string
          p_user_id: string
        }
        Returns: number
      }
      kst_month_bucket: { Args: { p_at?: string }; Returns: string }
      kst_month_end: { Args: { p_at?: string }; Returns: string }
      kst_month_start: { Args: { p_at?: string }; Returns: string }
      level_for_xp: { Args: { xp: number }; Returns: number }
      log_ai_audit: {
        Args: {
          p_latency_ms: number
          p_model_used: string
          p_output_hash: string
          p_prompt_hash: string
          p_purpose?: string
          p_reasoning_effort?: string
          p_reasoning_vendor?: string
          p_safety_zone: string
          p_vertex_backend: boolean
        }
        Returns: undefined
      }
      log_billing_self_service: {
        Args: {
          p_action: string
          p_eligibility: string
          p_eligibility_detail: Json
          p_outcome: string
          p_provider_error: string
          p_user_id: string
        }
        Returns: undefined
      }
      log_crisis_event: {
        Args: {
          p_classifier_confidence: number
          p_cssrs_level: number
          p_locale: string
          p_routing_template_version: string
          p_trigger_categories: string[]
        }
        Returns: undefined
      }
      mark_reasoning_proposal_applied: {
        Args: { p_ordinal: number; p_run_id: string; p_user_id: string }
        Returns: boolean
      }
      match_records: {
        Args: {
          exclude_id?: string
          match_count?: number
          p_user_id: string
          query_embedding: string
        }
        Returns: {
          id: string
          kind: string
          similarity: number
          summary: string
          topic: string
        }[]
      }
      match_wiki_pages: {
        Args: {
          exclude_id?: string
          match_count?: number
          p_user_id: string
          query_embedding: string
        }
        Returns: {
          id: string
          kind: string
          similarity: number
          slug: string
          title: string
        }[]
      }
      persona_neighborhood: {
        Args: { max_hops?: number; seed: string }
        Returns: {
          hops: number
          id: string
          name: string
          path: string[]
        }[]
      }
      persona_recall: {
        Args: { k?: number; q: string }
        Returns: {
          id: string
          label: string
          name: string
          score: number
        }[]
      }
      purge_ai_audit_log: { Args: { retention_days?: number }; Returns: number }
      purge_consent_request_metadata: {
        Args: { retention_days?: number }
        Returns: {
          consent_changes_scrubbed: number
          consent_records_scrubbed: number
        }[]
      }
      purge_expired_peer_invitations: {
        Args: { retention_days?: number }
        Returns: {
          deleted: number
          marked_expired: number
        }[]
      }
      purge_stale_peer_observations: {
        Args: { retention_days?: number }
        Returns: number
      }
      purge_star_tier_history: {
        Args: { retention_days?: number }
        Returns: number
      }
      purge_unhandled_billing_payloads: {
        Args: { p_retention_days?: number }
        Returns: number
      }
      purge_unreflected_import_data: {
        Args: { retention_days?: number }
        Returns: {
          ingest_log_deleted: number
          sources_deleted: number
        }[]
      }
      ratify_reasoning_proposals: {
        Args: {
          p_dismiss: number[]
          p_ratify: number[]
          p_run_id: string
          p_user_id: string
        }
        Returns: Json
      }
      record_paddle_refund_adjustment: {
        Args: {
          p_adjustment_id: string
          p_event_id: string
          p_event_type: string
          p_occurred_at: string
          p_status: string
          p_transaction_id: string
        }
        Returns: string
      }
      record_unhandled_billing_event: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_occurred_at: string
          p_payload: Json
          p_subscription_id: string
          p_transaction_id: string
        }
        Returns: string
      }
      recover_stale_reasoning_runs: {
        Args: { p_stale_minutes?: number; p_user_id: string }
        Returns: number
      }
      refund_credit_spend: {
        Args: { p_entry_id: string; p_memo?: string }
        Returns: string
      }
      refund_eligibility: { Args: { p_user_id: string }; Returns: Json }
      refund_gemini_spend: {
        Args: { p_day: string; p_user_id: string }
        Returns: number
      }
      refund_reasoning_run_spend: {
        Args: { p_run_id: string; p_user_id: string }
        Returns: undefined
      }
      reserve_reasoning_run: {
        Args: {
          p_item_count: number
          p_key: string
          p_trigger: string
          p_user_id: string
        }
        Returns: Json
      }
      settle_billing_self_service: {
        Args: {
          p_id: string
          p_outcome: string
          p_provider_error: string
          p_provider_ref: string
          p_provider_status: number
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      spend_credits: {
        Args: {
          p_feature: string
          p_idempotency_key: string
          p_units: number
          p_user_id: string
        }
        Returns: Json
      }
      start_reasoning_run: {
        Args: { p_run_id: string; p_user_id: string }
        Returns: string
      }
      subscription_overview: { Args: { p_user_id: string }; Returns: Json }
      sweep_stale_billing_claims: {
        Args: { p_older_than?: string }
        Returns: number
      }
      t5_seen_aggregate: {
        Args: never
        Returns: {
          avg_score: number
          informant_count: number
          trait: string
        }[]
      }
      usage_counters_mirror_credits: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      customer_relation:
        | "arms_length"
        | "family"
        | "friend"
        | "employee"
        | "self"
        | "unknown"
      notice_kind: "major" | "minor"
      record_kind: "journal" | "note" | "audit_response"
      safety_zone: "green" | "yellow" | "red"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      customer_relation: [
        "arms_length",
        "family",
        "friend",
        "employee",
        "self",
        "unknown",
      ],
      notice_kind: ["major", "minor"],
      record_kind: ["journal", "note", "audit_response"],
      safety_zone: ["green", "yellow", "red"],
    },
  },
} as const
