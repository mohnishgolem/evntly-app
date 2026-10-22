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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: number
          new_value: Json | null
          old_value: Json | null
          target_id: string
          target_table: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          target_id: string
          target_table: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string
          target_table?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_email: string
          blocked_user_id: string | null
          blocker_email: string
          blocker_user_id: string | null
          created_at: string
          created_by: string | null
          id: string
          updated_at: string
        }
        Insert: {
          blocked_email: string
          blocked_user_id?: string | null
          blocker_email: string
          blocker_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          blocked_email?: string
          blocked_user_id?: string | null
          blocker_email?: string
          blocker_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          client_email: string | null
          client_label: string | null
          client_name: string | null
          client_user_id: string | null
          commission_percent: number | null
          created_at: string
          created_by: string | null
          duration_hours: number | null
          end_time: string | null
          escrow_status: string | null
          event_address: string | null
          event_date: string
          event_id: string | null
          event_time: string | null
          id: string
          notes: string | null
          provider_id: string
          provider_name: string | null
          provider_owner_email: string | null
          provider_owner_user_id: string | null
          review_prompt_sent: boolean | null
          service_type: string
          slot: unknown
          start_time: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          total_price: number | null
          updated_at: string
          vendor_response_deadline: string | null
        }
        Insert: {
          client_email?: string | null
          client_label?: string | null
          client_name?: string | null
          client_user_id?: string | null
          commission_percent?: number | null
          created_at?: string
          created_by?: string | null
          duration_hours?: number | null
          end_time?: string | null
          escrow_status?: string | null
          event_address?: string | null
          event_date: string
          event_id?: string | null
          event_time?: string | null
          id?: string
          notes?: string | null
          provider_id: string
          provider_name?: string | null
          provider_owner_email?: string | null
          provider_owner_user_id?: string | null
          review_prompt_sent?: boolean | null
          service_type: string
          slot?: unknown
          start_time?: string | null
          status: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_price?: number | null
          updated_at?: string
          vendor_response_deadline?: string | null
        }
        Update: {
          client_email?: string | null
          client_label?: string | null
          client_name?: string | null
          client_user_id?: string | null
          commission_percent?: number | null
          created_at?: string
          created_by?: string | null
          duration_hours?: number | null
          end_time?: string | null
          escrow_status?: string | null
          event_address?: string | null
          event_date?: string
          event_id?: string | null
          event_time?: string | null
          id?: string
          notes?: string | null
          provider_id?: string
          provider_name?: string | null
          provider_owner_email?: string | null
          provider_owner_user_id?: string | null
          review_prompt_sent?: boolean | null
          service_type?: string
          slot?: unknown
          start_time?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_price?: number | null
          updated_at?: string
          vendor_response_deadline?: string | null
        }
        Relationships: []
      }
      bundle_booking_items: {
        Row: {
          amount: number
          bundle_booking_id: string
          component_price: number | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_user_id: string | null
          discount_share: number | null
          id: string
          package_id: string | null
          package_name: string | null
          payout_status: string | null
          platform_fee_share: number | null
          transfer_id: string | null
          transfer_status: string | null
          updated_at: string
          vendor_email: string
          vendor_id: string | null
          vendor_name: string | null
          vendor_payout_amount: number | null
          vendor_user_id: string | null
        }
        Insert: {
          amount: number
          bundle_booking_id: string
          component_price?: number | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_user_id?: string | null
          discount_share?: number | null
          id?: string
          package_id?: string | null
          package_name?: string | null
          payout_status?: string | null
          platform_fee_share?: number | null
          transfer_id?: string | null
          transfer_status?: string | null
          updated_at?: string
          vendor_email: string
          vendor_id?: string | null
          vendor_name?: string | null
          vendor_payout_amount?: number | null
          vendor_user_id?: string | null
        }
        Update: {
          amount?: number
          bundle_booking_id?: string
          component_price?: number | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_user_id?: string | null
          discount_share?: number | null
          id?: string
          package_id?: string | null
          package_name?: string | null
          payout_status?: string | null
          platform_fee_share?: number | null
          transfer_id?: string | null
          transfer_status?: string | null
          updated_at?: string
          vendor_email?: string
          vendor_id?: string | null
          vendor_name?: string | null
          vendor_payout_amount?: number | null
          vendor_user_id?: string | null
        }
        Relationships: []
      }
      bundle_bookings: {
        Row: {
          combined_package_id: string
          combined_package_name: string | null
          created_at: string
          created_by: string | null
          customer_email: string
          customer_name: string | null
          customer_user_id: string | null
          event_address: string | null
          event_date: string
          event_id: string | null
          event_time: string | null
          id: string
          notes: string | null
          payment_status: string | null
          platform_fee: number | null
          status: string
          stripe_charge_id: string | null
          stripe_session_id: string | null
          total_amount: number | null
          transfer_group: string | null
          updated_at: string
          vendor_count: number | null
          vendor_emails: string[] | null
          vendor_user_ids: string[]
        }
        Insert: {
          combined_package_id: string
          combined_package_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_email: string
          customer_name?: string | null
          customer_user_id?: string | null
          event_address?: string | null
          event_date: string
          event_id?: string | null
          event_time?: string | null
          id?: string
          notes?: string | null
          payment_status?: string | null
          platform_fee?: number | null
          status: string
          stripe_charge_id?: string | null
          stripe_session_id?: string | null
          total_amount?: number | null
          transfer_group?: string | null
          updated_at?: string
          vendor_count?: number | null
          vendor_emails?: string[] | null
          vendor_user_ids?: string[]
        }
        Update: {
          combined_package_id?: string
          combined_package_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string
          customer_name?: string | null
          customer_user_id?: string | null
          event_address?: string | null
          event_date?: string
          event_id?: string | null
          event_time?: string | null
          id?: string
          notes?: string | null
          payment_status?: string | null
          platform_fee?: number | null
          status?: string
          stripe_charge_id?: string | null
          stripe_session_id?: string | null
          total_amount?: number | null
          transfer_group?: string | null
          updated_at?: string
          vendor_count?: number | null
          vendor_emails?: string[] | null
          vendor_user_ids?: string[]
        }
        Relationships: []
      }
      calendar_feed_tokens: {
        Row: {
          created_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      combined_package_participants: {
        Row: {
          acceptance_status: string
          combined_package_id: string
          combined_package_name: string | null
          component_price: number | null
          created_at: string
          created_by: string | null
          id: string
          initiating_vendor_email: string | null
          initiating_vendor_user_id: string | null
          is_initiator: boolean | null
          package_id: string | null
          package_name: string | null
          proposed_by_email: string | null
          proposed_by_user_id: string | null
          updated_at: string
          vendor_email: string
          vendor_id: string | null
          vendor_name: string | null
          vendor_user_id: string | null
        }
        Insert: {
          acceptance_status: string
          combined_package_id: string
          combined_package_name?: string | null
          component_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          initiating_vendor_email?: string | null
          initiating_vendor_user_id?: string | null
          is_initiator?: boolean | null
          package_id?: string | null
          package_name?: string | null
          proposed_by_email?: string | null
          proposed_by_user_id?: string | null
          updated_at?: string
          vendor_email: string
          vendor_id?: string | null
          vendor_name?: string | null
          vendor_user_id?: string | null
        }
        Update: {
          acceptance_status?: string
          combined_package_id?: string
          combined_package_name?: string | null
          component_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          initiating_vendor_email?: string | null
          initiating_vendor_user_id?: string | null
          is_initiator?: boolean | null
          package_id?: string | null
          package_name?: string | null
          proposed_by_email?: string | null
          proposed_by_user_id?: string | null
          updated_at?: string
          vendor_email?: string
          vendor_id?: string | null
          vendor_name?: string | null
          vendor_user_id?: string | null
        }
        Relationships: []
      }
      combined_packages: {
        Row: {
          bundle_discount_amount: number | null
          category: string | null
          cover_image: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          initiating_vendor_email: string
          initiating_vendor_id: string
          initiating_vendor_name: string | null
          initiating_vendor_user_id: string | null
          name: string
          participant_count: number | null
          participant_emails: string[] | null
          participant_user_ids: string[]
          status: string
          total_price: number | null
          updated_at: string
        }
        Insert: {
          bundle_discount_amount?: number | null
          category?: string | null
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          initiating_vendor_email: string
          initiating_vendor_id: string
          initiating_vendor_name?: string | null
          initiating_vendor_user_id?: string | null
          name: string
          participant_count?: number | null
          participant_emails?: string[] | null
          participant_user_ids?: string[]
          status: string
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          bundle_discount_amount?: number | null
          category?: string | null
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          initiating_vendor_email?: string
          initiating_vendor_id?: string
          initiating_vendor_name?: string | null
          initiating_vendor_user_id?: string | null
          name?: string
          participant_count?: number | null
          participant_emails?: string[] | null
          participant_user_ids?: string[]
          status?: string
          total_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      consumed_step_up_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          jti: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          jti: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          jti?: string
          updated_at?: string
        }
        Relationships: []
      }
      error_events: {
        Row: {
          created_at: string
          digest: string | null
          fingerprint: string
          id: number
          message: string
          path: string | null
          route: string | null
          source: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          digest?: string | null
          fingerprint: string
          id?: never
          message: string
          path?: string | null
          route?: string | null
          source: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          digest?: string | null
          fingerprint?: string
          id?: never
          message?: string
          path?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      event_applications: {
        Row: {
          booking_confirmed: boolean | null
          booking_id: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          listing_id: string
          organiser_email: string | null
          organiser_user_id: string | null
          pitch: string | null
          quoted_amount: number
          service_type: string
          status: string
          updated_at: string
          vendor_email: string
          vendor_id: string
          vendor_name: string | null
          vendor_user_id: string | null
        }
        Insert: {
          booking_confirmed?: boolean | null
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          listing_id: string
          organiser_email?: string | null
          organiser_user_id?: string | null
          pitch?: string | null
          quoted_amount: number
          service_type: string
          status: string
          updated_at?: string
          vendor_email: string
          vendor_id: string
          vendor_name?: string | null
          vendor_user_id?: string | null
        }
        Update: {
          booking_confirmed?: boolean | null
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          listing_id?: string
          organiser_email?: string | null
          organiser_user_id?: string | null
          pitch?: string | null
          quoted_amount?: number
          service_type?: string
          status?: string
          updated_at?: string
          vendor_email?: string
          vendor_id?: string
          vendor_name?: string | null
          vendor_user_id?: string | null
        }
        Relationships: []
      }
      event_budget_items: {
        Row: {
          amount: number
          created_at: string
          event_id: string
          id: string
          label: string
          organiser_user_id: string
          paid: boolean
        }
        Insert: {
          amount: number
          created_at?: string
          event_id: string
          id?: string
          label: string
          organiser_user_id?: string
          paid?: boolean
        }
        Update: {
          amount?: number
          created_at?: string
          event_id?: string
          id?: string
          label?: string
          organiser_user_id?: string
          paid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_budget_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_listings: {
        Row: {
          application_count: number | null
          budget_band: string | null
          budget_total: number | null
          created_at: string
          created_by: string | null
          event_date: string
          event_type: string
          expires_at: string | null
          guest_count: string | null
          id: string
          notes: string | null
          required_services: string[]
          source_event_id: string
          status: string
          suburb: string
          updated_at: string
        }
        Insert: {
          application_count?: number | null
          budget_band?: string | null
          budget_total?: number | null
          created_at?: string
          created_by?: string | null
          event_date: string
          event_type: string
          expires_at?: string | null
          guest_count?: string | null
          id?: string
          notes?: string | null
          required_services: string[]
          source_event_id: string
          status: string
          suburb: string
          updated_at?: string
        }
        Update: {
          application_count?: number | null
          budget_band?: string | null
          budget_total?: number | null
          created_at?: string
          created_by?: string | null
          event_date?: string
          event_type?: string
          expires_at?: string | null
          guest_count?: string | null
          id?: string
          notes?: string | null
          required_services?: string[]
          source_event_id?: string
          status?: string
          suburb?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_tasks: {
        Row: {
          created_at: string
          created_by: string | null
          done: boolean | null
          event_id: string
          id: string
          owner_email: string
          owner_user_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done?: boolean | null
          event_id: string
          id?: string
          owner_email: string
          owner_user_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done?: boolean | null
          event_id?: string
          id?: string
          owner_email?: string
          owner_user_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_vendors: {
        Row: {
          created_at: string
          event_id: string
          id: string
          organiser_user_id: string
          provider_id: string
          service_type: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          organiser_user_id?: string
          provider_id: string
          service_type?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          organiser_user_id?: string
          provider_id?: string
          service_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_vendors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_vendors_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          budget_total: number
          category_budgets: Json
          created_at: string
          created_by: string | null
          end_time: string | null
          event_date: string
          event_type: string
          guest_count: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string | null
          notes: string | null
          organiser_email: string
          organiser_user_id: string | null
          required_services: string[]
          start_time: string | null
          status: string
          suburb: string
          updated_at: string
        }
        Insert: {
          budget_total: number
          category_budgets?: Json
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          event_date: string
          event_type: string
          guest_count: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          notes?: string | null
          organiser_email: string
          organiser_user_id?: string | null
          required_services: string[]
          start_time?: string | null
          status: string
          suburb: string
          updated_at?: string
        }
        Update: {
          budget_total?: number
          category_budgets?: Json
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          event_date?: string
          event_type?: string
          guest_count?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          notes?: string | null
          organiser_email?: string
          organiser_user_id?: string | null
          required_services?: string[]
          start_time?: string | null
          status?: string
          suburb?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          area: string | null
          category: string | null
          created_at: string
          created_by: string | null
          device_info: string | null
          id: string
          message: string
          rating: number
          status: string | null
          updated_at: string
          user_email: string
          user_mode: string | null
          user_name: string | null
          would_recommend: boolean | null
        }
        Insert: {
          area?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          device_info?: string | null
          id?: string
          message: string
          rating: number
          status?: string | null
          updated_at?: string
          user_email: string
          user_mode?: string | null
          user_name?: string | null
          would_recommend?: boolean | null
        }
        Update: {
          area?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          device_info?: string | null
          id?: string
          message?: string
          rating?: number
          status?: string | null
          updated_at?: string
          user_email?: string
          user_mode?: string | null
          user_name?: string | null
          would_recommend?: boolean | null
        }
        Relationships: []
      }
      group_chat_messages: {
        Row: {
          attachment_file_uri: string | null
          attachment_thumbnail_uri: string | null
          attachment_type: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          participant_emails: string[] | null
          participant_user_ids: string[]
          sender_email: string
          sender_name: string | null
          sender_user_id: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          attachment_file_uri?: string | null
          attachment_thumbnail_uri?: string | null
          attachment_type?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          participant_emails?: string[] | null
          participant_user_ids?: string[]
          sender_email: string
          sender_name?: string | null
          sender_user_id?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          attachment_file_uri?: string | null
          attachment_thumbnail_uri?: string | null
          attachment_type?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          participant_emails?: string[] | null
          participant_user_ids?: string[]
          sender_email?: string
          sender_name?: string | null
          sender_user_id?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_chat_threads: {
        Row: {
          bundle_booking_id: string
          combined_package_id: string | null
          combined_package_name: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          customer_user_id: string | null
          id: string
          participant_count: number | null
          participant_emails: string[]
          participant_user_ids: string[]
          updated_at: string
        }
        Insert: {
          bundle_booking_id: string
          combined_package_id?: string | null
          combined_package_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_user_id?: string | null
          id?: string
          participant_count?: number | null
          participant_emails: string[]
          participant_user_ids?: string[]
          updated_at?: string
        }
        Update: {
          bundle_booking_id?: string
          combined_package_id?: string | null
          combined_package_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_user_id?: string | null
          id?: string
          participant_count?: number | null
          participant_emails?: string[]
          participant_user_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      job_cards: {
        Row: {
          arrival_time: string | null
          booking_id: string
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          escrow_amount: number | null
          event_date: string
          event_id: string | null
          event_type: string | null
          id: string
          on_my_way: boolean | null
          on_my_way_at: string | null
          organiser_email: string | null
          organiser_name: string | null
          organiser_user_id: string | null
          peer_services: string[] | null
          provider_id: string | null
          provider_name: string | null
          service_type: string
          status: string
          suburb: string | null
          updated_at: string
          vendor_email: string
          vendor_user_id: string | null
          venue_address: string | null
        }
        Insert: {
          arrival_time?: string | null
          booking_id: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          escrow_amount?: number | null
          event_date: string
          event_id?: string | null
          event_type?: string | null
          id?: string
          on_my_way?: boolean | null
          on_my_way_at?: string | null
          organiser_email?: string | null
          organiser_name?: string | null
          organiser_user_id?: string | null
          peer_services?: string[] | null
          provider_id?: string | null
          provider_name?: string | null
          service_type: string
          status: string
          suburb?: string | null
          updated_at?: string
          vendor_email: string
          vendor_user_id?: string | null
          venue_address?: string | null
        }
        Update: {
          arrival_time?: string | null
          booking_id?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          escrow_amount?: number | null
          event_date?: string
          event_id?: string | null
          event_type?: string | null
          id?: string
          on_my_way?: boolean | null
          on_my_way_at?: string | null
          organiser_email?: string | null
          organiser_name?: string | null
          organiser_user_id?: string | null
          peer_services?: string[] | null
          provider_id?: string | null
          provider_name?: string | null
          service_type?: string
          status?: string
          suburb?: string | null
          updated_at?: string
          vendor_email?: string
          vendor_user_id?: string | null
          venue_address?: string | null
        }
        Relationships: []
      }
      leakage_events: {
        Row: {
          booking_id: string | null
          category: string
          conversation_id: string | null
          created_at: string
          created_by: string | null
          delivered: boolean
          id: string
          original_snippet: string | null
          recipient_email: string | null
          recipient_user_id: string | null
          redacted_message: string | null
          sender_email: string | null
          sender_id: string
          sender_user_id: string | null
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          category: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered?: boolean
          id?: string
          original_snippet?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          redacted_message?: string | null
          sender_email?: string | null
          sender_id: string
          sender_user_id?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          category?: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered?: boolean
          id?: string
          original_snippet?: string | null
          recipient_email?: string | null
          recipient_user_id?: string | null
          redacted_message?: string | null
          sender_email?: string | null
          sender_id?: string
          sender_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachment_file_uri: string | null
          attachment_scan: string | null
          attachment_thumbnail_uri: string | null
          attachment_type: string | null
          booking_id: string | null
          content: string
          conversation_id: string
          created_at: string
          created_by: string | null
          customer_initiated: boolean | null
          id: string
          provider_id: string | null
          read: boolean | null
          recipient_email: string
          recipient_user_id: string | null
          sender_email: string
          sender_user_id: string | null
          updated_at: string
        }
        Insert: {
          attachment_file_uri?: string | null
          attachment_scan?: string | null
          attachment_thumbnail_uri?: string | null
          attachment_type?: string | null
          booking_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          created_by?: string | null
          customer_initiated?: boolean | null
          id?: string
          provider_id?: string | null
          read?: boolean | null
          recipient_email?: string
          recipient_user_id?: string | null
          sender_email: string
          sender_user_id?: string | null
          updated_at?: string
        }
        Update: {
          attachment_file_uri?: string | null
          attachment_scan?: string | null
          attachment_thumbnail_uri?: string | null
          attachment_type?: string | null
          booking_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          customer_initiated?: boolean | null
          id?: string
          provider_id?: string | null
          read?: boolean | null
          recipient_email?: string
          recipient_user_id?: string | null
          sender_email?: string
          sender_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      page_views: {
        Row: {
          created_at: string
          id: number
          kind: string
          user_id: string | null
          vendor_id: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          user_id?: string | null
          vendor_id?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          user_id?: string | null
          vendor_id?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          actor_role: string
          actor_user_id: string | null
          created_at: string
          detail: Json
          event: string
          id: number
          milestone_id: string | null
          plan_id: string
        }
        Insert: {
          actor_role: string
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          event: string
          id?: never
          milestone_id?: string | null
          plan_id: string
        }
        Update: {
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          event?: string
          id?: never
          milestone_id?: string | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "payment_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_milestones: {
        Row: {
          amount_cents: number
          approved_at: string | null
          charge_id: string | null
          checkout_session_id: string | null
          created_at: string
          customer_note: string | null
          deliverables: string | null
          description: string | null
          due_date: string | null
          evidence_paths: string[]
          funded_at: string | null
          funding_status: string
          id: string
          kind: string
          last_error: string | null
          name: string
          paid_out_at: string | null
          payment_intent_id: string | null
          payout_cents: number | null
          payout_status: string
          plan_id: string
          position: number
          refund_id: string | null
          submitted_at: string | null
          transfer_id: string | null
          updated_at: string
          vendor_note: string | null
          work_status: string
        }
        Insert: {
          amount_cents: number
          approved_at?: string | null
          charge_id?: string | null
          checkout_session_id?: string | null
          created_at?: string
          customer_note?: string | null
          deliverables?: string | null
          description?: string | null
          due_date?: string | null
          evidence_paths?: string[]
          funded_at?: string | null
          funding_status?: string
          id?: string
          kind: string
          last_error?: string | null
          name: string
          paid_out_at?: string | null
          payment_intent_id?: string | null
          payout_cents?: number | null
          payout_status?: string
          plan_id: string
          position: number
          refund_id?: string | null
          submitted_at?: string | null
          transfer_id?: string | null
          updated_at?: string
          vendor_note?: string | null
          work_status?: string
        }
        Update: {
          amount_cents?: number
          approved_at?: string | null
          charge_id?: string | null
          checkout_session_id?: string | null
          created_at?: string
          customer_note?: string | null
          deliverables?: string | null
          description?: string | null
          due_date?: string | null
          evidence_paths?: string[]
          funded_at?: string | null
          funding_status?: string
          id?: string
          kind?: string
          last_error?: string | null
          name?: string
          paid_out_at?: string | null
          payment_intent_id?: string | null
          payout_cents?: number | null
          payout_status?: string
          plan_id?: string
          position?: number
          refund_id?: string | null
          submitted_at?: string | null
          transfer_id?: string | null
          updated_at?: string
          vendor_note?: string | null
          work_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          booking_id: string
          change_note: string | null
          commission_bps: number
          created_at: string
          currency: string
          customer_agreed_at: string | null
          customer_user_id: string
          id: string
          plan_type: string
          status: string
          total_cents: number
          transfer_group: string
          updated_at: string
          vendor_agreed_at: string | null
          vendor_user_id: string
        }
        Insert: {
          booking_id: string
          change_note?: string | null
          commission_bps?: number
          created_at?: string
          currency?: string
          customer_agreed_at?: string | null
          customer_user_id: string
          id?: string
          plan_type: string
          status?: string
          total_cents: number
          transfer_group?: string
          updated_at?: string
          vendor_agreed_at?: string | null
          vendor_user_id: string
        }
        Update: {
          booking_id?: string
          change_note?: string | null
          commission_bps?: number
          created_at?: string
          currency?: string
          customer_agreed_at?: string | null
          customer_user_id?: string
          id?: string
          plan_type?: string
          status?: string
          total_cents?: number
          transfer_group?: string
          updated_at?: string
          vendor_agreed_at?: string | null
          vendor_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          event_type_tag: string | null
          id: string
          media_type: string
          media_url: string
          owner_email: string
          owner_user_id: string | null
          provider_id: string
          sort_order: number | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          event_type_tag?: string | null
          id?: string
          media_type: string
          media_url: string
          owner_email: string
          owner_user_id?: string | null
          provider_id: string
          sort_order?: number | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          event_type_tag?: string | null
          id?: string
          media_type?: string
          media_url?: string
          owner_email?: string
          owner_user_id?: string | null
          provider_id?: string
          sort_order?: number | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_provider_id_service_providers_id_fk"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quote_requests: {
        Row: {
          booking_id: string | null
          budget_range: string
          call_time_window: string | null
          cancellation_terms: string | null
          client_email: string
          client_name: string | null
          client_reminder_sent_at: string | null
          client_user_id: string | null
          coverage_hours: number | null
          created_at: string
          created_by: string | null
          delivery_days: number | null
          deposit_cents: number | null
          details: string | null
          estimated_guests: number
          estimated_hours: number | null
          event_date: string
          event_id: string | null
          event_type: string | null
          expires_at: string | null
          expiry_notice_sent_at: string | null
          id: string
          inclusions: string[]
          location: string
          match_reason: string | null
          match_score: number | null
          origin: string | null
          quoted_amount: number | null
          request_call: boolean | null
          service_description: string | null
          service_type: string | null
          status: string
          stripe_session_id: string | null
          travel_fee_cents: number | null
          updated_at: string
          vendor_email: string
          vendor_id: string
          vendor_name: string | null
          vendor_note: string | null
          vendor_reminder_sent_at: string | null
          vendor_user_id: string | null
        }
        Insert: {
          booking_id?: string | null
          budget_range: string
          call_time_window?: string | null
          cancellation_terms?: string | null
          client_email: string
          client_name?: string | null
          client_reminder_sent_at?: string | null
          client_user_id?: string | null
          coverage_hours?: number | null
          created_at?: string
          created_by?: string | null
          delivery_days?: number | null
          deposit_cents?: number | null
          details?: string | null
          estimated_guests: number
          estimated_hours?: number | null
          event_date: string
          event_id?: string | null
          event_type?: string | null
          expires_at?: string | null
          expiry_notice_sent_at?: string | null
          id?: string
          inclusions?: string[]
          location: string
          match_reason?: string | null
          match_score?: number | null
          origin?: string | null
          quoted_amount?: number | null
          request_call?: boolean | null
          service_description?: string | null
          service_type?: string | null
          status: string
          stripe_session_id?: string | null
          travel_fee_cents?: number | null
          updated_at?: string
          vendor_email?: string
          vendor_id: string
          vendor_name?: string | null
          vendor_note?: string | null
          vendor_reminder_sent_at?: string | null
          vendor_user_id?: string | null
        }
        Update: {
          booking_id?: string | null
          budget_range?: string
          call_time_window?: string | null
          cancellation_terms?: string | null
          client_email?: string
          client_name?: string | null
          client_reminder_sent_at?: string | null
          client_user_id?: string | null
          coverage_hours?: number | null
          created_at?: string
          created_by?: string | null
          delivery_days?: number | null
          deposit_cents?: number | null
          details?: string | null
          estimated_guests?: number
          estimated_hours?: number | null
          event_date?: string
          event_id?: string | null
          event_type?: string | null
          expires_at?: string | null
          expiry_notice_sent_at?: string | null
          id?: string
          inclusions?: string[]
          location?: string
          match_reason?: string | null
          match_score?: number | null
          origin?: string | null
          quoted_amount?: number | null
          request_call?: boolean | null
          service_description?: string | null
          service_type?: string | null
          status?: string
          stripe_session_id?: string | null
          travel_fee_cents?: number | null
          updated_at?: string
          vendor_email?: string
          vendor_id?: string
          vendor_name?: string | null
          vendor_note?: string | null
          vendor_reminder_sent_at?: string | null
          vendor_user_id?: string | null
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          created_at: string
          created_by: string | null
          id: string
          timestamps: number[] | null
          updated_at: string
        }
        Insert: {
          bucket_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          timestamps?: number[] | null
          updated_at?: string
        }
        Update: {
          bucket_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          timestamps?: number[] | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          admin_notes: string | null
          content_id: string | null
          content_type: string
          created_at: string
          created_by: string | null
          details: string | null
          id: string
          reason: string
          reported_email: string | null
          reported_user_id: string | null
          reporter_email: string
          reporter_user_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          content_id?: string | null
          content_type: string
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          reason: string
          reported_email?: string | null
          reported_user_id?: string | null
          reporter_email: string
          reporter_user_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          content_id?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          reason?: string
          reported_email?: string | null
          reported_user_id?: string | null
          reporter_email?: string
          reporter_user_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          booking_id: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          description: string | null
          event_type: string | null
          id: string
          provider_id: string
          rating: number
          reviewer_email: string
          reviewer_name: string | null
          reviewer_user_id: string | null
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_type?: string | null
          id?: string
          provider_id: string
          rating: number
          reviewer_email: string
          reviewer_name?: string | null
          reviewer_user_id?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_type?: string | null
          id?: string
          provider_id?: string
          rating?: number
          reviewer_email?: string
          reviewer_name?: string | null
          reviewer_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_provider_id_service_providers_id_fk"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_providers: {
        Row: {
          abn: string | null
          acceptance_rate: number | null
          availability_confirmed_at: string | null
          available: boolean | null
          avatar_url: string | null
          avg_response_hours: number | null
          bio: string | null
          cancellation_policy: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          description: string | null
          equipment_list: string[] | null
          event_types: string[] | null
          experience_years: number | null
          founding_vendor: boolean | null
          free_travel_km: number
          gst_registered: boolean
          hourly_rate: number
          id: string
          is_demo: boolean
          languages: string[] | null
          latitude: number | null
          locations_serviced: string[] | null
          longitude: number | null
          min_booking_hours: number | null
          name: string
          owner_email: string | null
          owner_user_id: string | null
          packages: Json | null
          phone: string | null
          portfolio_urls: string[] | null
          postcode: string | null
          pricing_options: string[] | null
          rating: number | null
          rating_sum: number | null
          review_count: number | null
          service_address: string | null
          service_radius_km: number | null
          service_type: string
          social_link: string | null
          status: string | null
          travel_fee_cents_per_km: number
          travels_regional: boolean
          unavailable_dates: string[] | null
          unit_number: string | null
          updated_at: string
          verified: boolean | null
          weekly_unavailable_days: number[] | null
        }
        Insert: {
          abn?: string | null
          acceptance_rate?: number | null
          availability_confirmed_at?: string | null
          available?: boolean | null
          avatar_url?: string | null
          avg_response_hours?: number | null
          bio?: string | null
          cancellation_policy?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          equipment_list?: string[] | null
          event_types?: string[] | null
          experience_years?: number | null
          founding_vendor?: boolean | null
          free_travel_km?: number
          gst_registered?: boolean
          hourly_rate: number
          id?: string
          is_demo?: boolean
          languages?: string[] | null
          latitude?: number | null
          locations_serviced?: string[] | null
          longitude?: number | null
          min_booking_hours?: number | null
          name: string
          owner_email?: string | null
          owner_user_id?: string | null
          packages?: Json | null
          phone?: string | null
          portfolio_urls?: string[] | null
          postcode?: string | null
          pricing_options?: string[] | null
          rating?: number | null
          rating_sum?: number | null
          review_count?: number | null
          service_address?: string | null
          service_radius_km?: number | null
          service_type: string
          social_link?: string | null
          status?: string | null
          travel_fee_cents_per_km?: number
          travels_regional?: boolean
          unavailable_dates?: string[] | null
          unit_number?: string | null
          updated_at?: string
          verified?: boolean | null
          weekly_unavailable_days?: number[] | null
        }
        Update: {
          abn?: string | null
          acceptance_rate?: number | null
          availability_confirmed_at?: string | null
          available?: boolean | null
          avatar_url?: string | null
          avg_response_hours?: number | null
          bio?: string | null
          cancellation_policy?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          equipment_list?: string[] | null
          event_types?: string[] | null
          experience_years?: number | null
          founding_vendor?: boolean | null
          free_travel_km?: number
          gst_registered?: boolean
          hourly_rate?: number
          id?: string
          is_demo?: boolean
          languages?: string[] | null
          latitude?: number | null
          locations_serviced?: string[] | null
          longitude?: number | null
          min_booking_hours?: number | null
          name?: string
          owner_email?: string | null
          owner_user_id?: string | null
          packages?: Json | null
          phone?: string | null
          portfolio_urls?: string[] | null
          postcode?: string | null
          pricing_options?: string[] | null
          rating?: number | null
          rating_sum?: number | null
          review_count?: number | null
          service_address?: string | null
          service_radius_km?: number | null
          service_type?: string
          social_link?: string | null
          status?: string | null
          travel_fee_cents_per_km?: number
          travels_regional?: boolean
          unavailable_dates?: string[] | null
          unit_number?: string | null
          updated_at?: string
          verified?: boolean | null
          weekly_unavailable_days?: number[] | null
        }
        Relationships: []
      }
      stage_checklist_items: {
        Row: {
          created_at: string
          created_by: string | null
          done_at: string | null
          done_by_email: string | null
          done_by_user_id: string | null
          id: string
          job_card_id: string
          label: string
          order: number | null
          organiser_email: string
          organiser_user_id: string | null
          owner_role: string
          status: string
          updated_at: string
          vendor_email: string
          vendor_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by_email?: string | null
          done_by_user_id?: string | null
          id?: string
          job_card_id: string
          label: string
          order?: number | null
          organiser_email?: string
          organiser_user_id?: string | null
          owner_role: string
          status: string
          updated_at?: string
          vendor_email?: string
          vendor_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by_email?: string | null
          done_by_user_id?: string | null
          id?: string
          job_card_id?: string
          label?: string
          order?: number | null
          organiser_email?: string
          organiser_user_id?: string | null
          owner_role?: string
          status?: string
          updated_at?: string
          vendor_email?: string
          vendor_user_id?: string | null
        }
        Relationships: []
      }
      stripe_accounts: {
        Row: {
          account_id: string
          created_at: string
          details_submitted: boolean
          disabled_reason: string | null
          payouts_enabled: boolean
          requirements_due: string[]
          transfers_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          details_submitted?: boolean
          disabled_reason?: string | null
          payouts_enabled?: boolean
          requirements_due?: string[]
          transfers_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          details_submitted?: boolean
          disabled_reason?: string | null
          payouts_enabled?: boolean
          requirements_due?: string[]
          transfers_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          error: string | null
          event_id: string
          processed_at: string | null
          received_at: string
          type: string
        }
        Insert: {
          error?: string | null
          event_id: string
          processed_at?: string | null
          received_at?: string
          type: string
        }
        Update: {
          error?: string | null
          event_id?: string
          processed_at?: string | null
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          email: string
          id: string
          mode: string | null
          phone: string | null
          preferred_event_types: string[] | null
          role: string | null
          saved_providers: string[] | null
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
          vendor_agreement_accepted_at: string | null
          vendor_agreement_version: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          mode?: string | null
          phone?: string | null
          preferred_event_types?: string[] | null
          role?: string | null
          saved_providers?: string[] | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          vendor_agreement_accepted_at?: string | null
          vendor_agreement_version?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          mode?: string | null
          phone?: string | null
          preferred_event_types?: string[] | null
          role?: string | null
          saved_providers?: string[] | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          vendor_agreement_accepted_at?: string | null
          vendor_agreement_version?: string | null
        }
        Relationships: []
      }
      vendor_packages: {
        Row: {
          active: boolean
          created_at: string
          delivery_days: number | null
          deposit_percent: number | null
          description: string | null
          extra_hour_cents: number | null
          id: string
          included_hours: number | null
          inclusions: string[]
          name: string
          price_cents: number
          provider_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          delivery_days?: number | null
          deposit_percent?: number | null
          description?: string | null
          extra_hour_cents?: number | null
          id?: string
          included_hours?: number | null
          inclusions?: string[]
          name: string
          price_cents: number
          provider_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          delivery_days?: number | null
          deposit_percent?: number | null
          description?: string | null
          extra_hour_cents?: number | null
          id?: string
          included_hours?: number | null
          inclusions?: string[]
          name?: string
          price_cents?: number
          provider_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_packages_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payout_details: {
        Row: {
          abn: string | null
          bank_account: string | null
          bank_bsb: string | null
          bank_name: string | null
          created_at: string
          created_by: string | null
          document_url: string | null
          id: string
          owner_email: string
          provider_id: string
          stripe_account_id: string | null
          stripe_payouts_enabled: boolean | null
          updated_at: string
        }
        Insert: {
          abn?: string | null
          bank_account?: string | null
          bank_bsb?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          id?: string
          owner_email: string
          provider_id: string
          stripe_account_id?: string | null
          stripe_payouts_enabled?: boolean | null
          updated_at?: string
        }
        Update: {
          abn?: string | null
          bank_account?: string | null
          bank_bsb?: string | null
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          id?: string
          owner_email?: string
          provider_id?: string
          stripe_account_id?: string | null
          stripe_payouts_enabled?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_event_application: {
        Args: { p_application_id: string }
        Returns: Json
      }
      accept_quote: { Args: { p_quote_id: string }; Returns: string }
      accept_terms: { Args: { p_version: string }; Returns: undefined }
      admin_error_summary: {
        Args: { p_days?: number }
        Returns: {
          fingerprint: string
          first_seen: string
          last_digest: string
          last_path: string
          last_route: string
          last_seen: string
          last_stack: string
          message: string
          occurrences: number
          source: string
        }[]
      }
      admin_funnel: {
        Args: { p_days?: number }
        Returns: {
          label: string
          people: number
          step: number
        }[]
      }
      admin_service_providers: {
        Args: never
        Returns: {
          abn: string | null
          acceptance_rate: number | null
          availability_confirmed_at: string | null
          available: boolean | null
          avatar_url: string | null
          avg_response_hours: number | null
          bio: string | null
          cancellation_policy: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          description: string | null
          equipment_list: string[] | null
          event_types: string[] | null
          experience_years: number | null
          founding_vendor: boolean | null
          free_travel_km: number
          gst_registered: boolean
          hourly_rate: number
          id: string
          is_demo: boolean
          languages: string[] | null
          latitude: number | null
          locations_serviced: string[] | null
          longitude: number | null
          min_booking_hours: number | null
          name: string
          owner_email: string | null
          owner_user_id: string | null
          packages: Json | null
          phone: string | null
          portfolio_urls: string[] | null
          postcode: string | null
          pricing_options: string[] | null
          rating: number | null
          rating_sum: number | null
          review_count: number | null
          service_address: string | null
          service_radius_km: number | null
          service_type: string
          social_link: string | null
          status: string | null
          travel_fee_cents_per_km: number
          travels_regional: boolean
          unavailable_dates: string[] | null
          unit_number: string | null
          updated_at: string
          verified: boolean | null
          weekly_unavailable_days: number[] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "service_providers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      attachment_readable: { Args: { p_path: string }; Returns: boolean }
      block_user: {
        Args: { p_conversation_id?: string; p_quote_id?: string }
        Returns: undefined
      }
      book_bundle: {
        Args: {
          p_event_address: string
          p_event_date: string
          p_event_time: string
          p_notes: string
          p_package_id: string
        }
        Returns: string
      }
      booked_vendor_ids_on: { Args: { p_date: string }; Returns: string[] }
      check_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      claim_milestone_payout: {
        Args: { p_milestone_id: string }
        Returns: {
          amount_cents: number
          approved_at: string | null
          charge_id: string | null
          checkout_session_id: string | null
          created_at: string
          customer_note: string | null
          deliverables: string | null
          description: string | null
          due_date: string | null
          evidence_paths: string[]
          funded_at: string | null
          funding_status: string
          id: string
          kind: string
          last_error: string | null
          name: string
          paid_out_at: string | null
          payment_intent_id: string | null
          payout_cents: number | null
          payout_status: string
          plan_id: string
          position: number
          refund_id: string | null
          submitted_at: string | null
          transfer_id: string | null
          updated_at: string
          vendor_note: string | null
          work_status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_milestones"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      conversation_block_state: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      conversation_is_booked: {
        Args: { p_conversation_id: string; p_provider_id: string }
        Returns: boolean
      }
      conversation_messages: {
        Args: { p_conversation_id: string }
        Returns: {
          attachment_file_uri: string
          attachment_scan: string
          attachment_type: string
          content: string
          created_at: string
          customer_initiated: boolean
          from_me: boolean
          id: string
          provider_id: string
          read: boolean
        }[]
      }
      counterpart_user_id: {
        Args: { p_conversation_id: string; p_quote_id: string }
        Returns: string
      }
      current_email: {
        Args: { p_fallback?: string; p_user_id: string }
        Returns: string
      }
      customer_label: { Args: { customer_email: string }; Returns: string }
      dispute_milestone: {
        Args: { p_milestone_id: string; p_note: string }
        Returns: undefined
      }
      is_active_combined_package: { Args: { pkg_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_blocked_between_ids: {
        Args: { a: string; b: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_payment_plan_party: {
        Args: { p_plan_id: string; p_vendor_only?: boolean }
        Returns: boolean
      }
      is_privileged_writer: { Args: never; Returns: boolean }
      log_payment_event: {
        Args: {
          p_detail?: Json
          p_event: string
          p_milestone_id: string
          p_plan_id: string
          p_role: string
        }
        Returns: undefined
      }
      mask_contact_info: { Args: { p: string }; Returns: string }
      matching_settings: { Args: never; Returns: Json }
      my_blocks: {
        Args: never
        Returns: {
          created_at: string
          id: string
          label: string
        }[]
      }
      my_calendar_feed_token: { Args: { p_rotate?: boolean }; Returns: string }
      my_conversations: {
        Args: never
        Returns: {
          booked: boolean
          conversation_id: string
          counterpart_name: string
          i_am_vendor: boolean
          last_at: string
          last_attachment_type: string
          last_content: string
          provider_id: string
          unread_count: number
        }[]
      }
      my_quote_requests: {
        Args: { as_role: string }
        Returns: {
          booking_id: string | null
          budget_range: string
          call_time_window: string | null
          cancellation_terms: string | null
          client_email: string
          client_name: string | null
          client_reminder_sent_at: string | null
          client_user_id: string | null
          coverage_hours: number | null
          created_at: string
          created_by: string | null
          delivery_days: number | null
          deposit_cents: number | null
          details: string | null
          estimated_guests: number
          estimated_hours: number | null
          event_date: string
          event_id: string | null
          event_type: string | null
          expires_at: string | null
          expiry_notice_sent_at: string | null
          id: string
          inclusions: string[]
          location: string
          match_reason: string | null
          match_score: number | null
          origin: string | null
          quoted_amount: number | null
          request_call: boolean | null
          service_description: string | null
          service_type: string | null
          status: string
          stripe_session_id: string | null
          travel_fee_cents: number | null
          updated_at: string
          vendor_email: string
          vendor_id: string
          vendor_name: string | null
          vendor_note: string | null
          vendor_reminder_sent_at: string | null
          vendor_user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "quote_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_service_providers: {
        Args: never
        Returns: {
          abn: string | null
          acceptance_rate: number | null
          availability_confirmed_at: string | null
          available: boolean | null
          avatar_url: string | null
          avg_response_hours: number | null
          bio: string | null
          cancellation_policy: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          description: string | null
          equipment_list: string[] | null
          event_types: string[] | null
          experience_years: number | null
          founding_vendor: boolean | null
          free_travel_km: number
          gst_registered: boolean
          hourly_rate: number
          id: string
          is_demo: boolean
          languages: string[] | null
          latitude: number | null
          locations_serviced: string[] | null
          longitude: number | null
          min_booking_hours: number | null
          name: string
          owner_email: string | null
          owner_user_id: string | null
          packages: Json | null
          phone: string | null
          portfolio_urls: string[] | null
          postcode: string | null
          pricing_options: string[] | null
          rating: number | null
          rating_sum: number | null
          review_count: number | null
          service_address: string | null
          service_radius_km: number | null
          service_type: string
          social_link: string | null
          status: string | null
          travel_fee_cents_per_km: number
          travels_regional: boolean
          unavailable_dates: string[] | null
          unit_number: string | null
          updated_at: string
          verified: boolean | null
          weekly_unavailable_days: number[] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "service_providers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_unread_message_count: { Args: never; Returns: number }
      owns_service_provider: {
        Args: { p_provider_id: string }
        Returns: boolean
      }
      payment_guard_category: { Args: { p_content: string }; Returns: string }
      payment_guard_snippet: { Args: { p_content: string }; Returns: string }
      propose_payment_plan: {
        Args: { p_booking_id: string; p_milestones: Json; p_plan_type: string }
        Returns: string
      }
      quote_expiry_for: {
        Args: { base: string; event_date: string }
        Returns: string
      }
      respond_to_payment_plan: {
        Args: { p_agree: boolean; p_note?: string; p_plan_id: string }
        Returns: undefined
      }
      review_milestone: {
        Args: { p_approve: boolean; p_milestone_id: string; p_note?: string }
        Returns: undefined
      }
      short_display_name: {
        Args: { email: string; fallback?: string; full_name: string }
        Returns: string
      }
      unblock_user: {
        Args: { p_block_id?: string; p_conversation_id?: string }
        Returns: undefined
      }
      update_milestone_work: {
        Args: {
          p_evidence?: string[]
          p_milestone_id: string
          p_note?: string
          p_status: string
        }
        Returns: undefined
      }
      user_label: {
        Args: { p_fallback_email?: string; p_user_id: string }
        Returns: string
      }
      vendor_busy_slots: {
        Args: { p_from: string; p_to: string }
        Returns: {
          provider_id: string
          slot_end: string
          slot_start: string
        }[]
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
