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
      blocked_users: {
        Row: {
          blocked_email: string
          blocker_email: string
          created_at: string
          created_by: string | null
          id: string
          updated_at: string
        }
        Insert: {
          blocked_email: string
          blocker_email: string
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          blocked_email?: string
          blocker_email?: string
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
          client_name: string | null
          commission_percent: number | null
          created_at: string
          created_by: string | null
          duration_hours: number | null
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
          review_prompt_sent: boolean | null
          service_type: string
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          total_price: number | null
          updated_at: string
          vendor_response_deadline: string | null
        }
        Insert: {
          client_email?: string | null
          client_name?: string | null
          commission_percent?: number | null
          created_at?: string
          created_by?: string | null
          duration_hours?: number | null
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
          review_prompt_sent?: boolean | null
          service_type: string
          status: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_price?: number | null
          updated_at?: string
          vendor_response_deadline?: string | null
        }
        Update: {
          client_email?: string | null
          client_name?: string | null
          commission_percent?: number | null
          created_at?: string
          created_by?: string | null
          duration_hours?: number | null
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
          review_prompt_sent?: boolean | null
          service_type?: string
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
        }
        Insert: {
          amount: number
          bundle_booking_id: string
          component_price?: number | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
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
        }
        Update: {
          amount?: number
          bundle_booking_id?: string
          component_price?: number | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
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
        }
        Insert: {
          combined_package_id: string
          combined_package_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_email: string
          customer_name?: string | null
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
        }
        Update: {
          combined_package_id?: string
          combined_package_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string
          customer_name?: string | null
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
          is_initiator: boolean | null
          package_id: string | null
          package_name: string | null
          proposed_by_email: string | null
          updated_at: string
          vendor_email: string
          vendor_id: string | null
          vendor_name: string | null
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
          is_initiator?: boolean | null
          package_id?: string | null
          package_name?: string | null
          proposed_by_email?: string | null
          updated_at?: string
          vendor_email: string
          vendor_id?: string | null
          vendor_name?: string | null
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
          is_initiator?: boolean | null
          package_id?: string | null
          package_name?: string | null
          proposed_by_email?: string | null
          updated_at?: string
          vendor_email?: string
          vendor_id?: string | null
          vendor_name?: string | null
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
          name: string
          participant_emails: string[] | null
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
          name: string
          participant_emails?: string[] | null
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
          name?: string
          participant_emails?: string[] | null
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
          pitch: string | null
          quoted_amount: number
          service_type: string
          status: string
          updated_at: string
          vendor_email: string
          vendor_id: string
          vendor_name: string | null
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
          pitch?: string | null
          quoted_amount: number
          service_type: string
          status: string
          updated_at?: string
          vendor_email: string
          vendor_id: string
          vendor_name?: string | null
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
          pitch?: string | null
          quoted_amount?: number
          service_type?: string
          status?: string
          updated_at?: string
          vendor_email?: string
          vendor_id?: string
          vendor_name?: string | null
        }
        Relationships: []
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
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          budget_total: number
          created_at: string
          created_by: string | null
          event_date: string
          event_type: string
          guest_count: string
          id: string
          notes: string | null
          organiser_email: string
          required_services: string[]
          status: string
          suburb: string
          updated_at: string
        }
        Insert: {
          budget_total: number
          created_at?: string
          created_by?: string | null
          event_date: string
          event_type: string
          guest_count: string
          id?: string
          notes?: string | null
          organiser_email: string
          required_services: string[]
          status: string
          suburb: string
          updated_at?: string
        }
        Update: {
          budget_total?: number
          created_at?: string
          created_by?: string | null
          event_date?: string
          event_type?: string
          guest_count?: string
          id?: string
          notes?: string | null
          organiser_email?: string
          required_services?: string[]
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
          sender_email: string
          sender_name: string | null
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
          sender_email: string
          sender_name?: string | null
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
          sender_email?: string
          sender_name?: string | null
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
          id: string
          participant_emails: string[]
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
          id?: string
          participant_emails: string[]
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
          id?: string
          participant_emails?: string[]
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
          peer_services: string[] | null
          provider_id: string | null
          provider_name: string | null
          service_type: string
          status: string
          suburb: string | null
          updated_at: string
          vendor_email: string
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
          peer_services?: string[] | null
          provider_id?: string | null
          provider_name?: string | null
          service_type: string
          status: string
          suburb?: string | null
          updated_at?: string
          vendor_email: string
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
          peer_services?: string[] | null
          provider_id?: string | null
          provider_name?: string | null
          service_type?: string
          status?: string
          suburb?: string | null
          updated_at?: string
          vendor_email?: string
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
          id: string
          original_snippet: string | null
          recipient_email: string | null
          redacted_message: string | null
          sender_email: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          category: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          original_snippet?: string | null
          recipient_email?: string | null
          redacted_message?: string | null
          sender_email?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          category?: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          original_snippet?: string | null
          recipient_email?: string | null
          redacted_message?: string | null
          sender_email?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachment_file_uri: string | null
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
          sender_email: string
          updated_at: string
        }
        Insert: {
          attachment_file_uri?: string | null
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
          recipient_email: string
          sender_email: string
          updated_at?: string
        }
        Update: {
          attachment_file_uri?: string | null
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
          sender_email?: string
          updated_at?: string
        }
        Relationships: []
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
      quote_requests: {
        Row: {
          booking_id: string | null
          budget_range: string
          call_time_window: string | null
          client_email: string
          client_name: string | null
          created_at: string
          created_by: string | null
          details: string | null
          estimated_guests: number
          estimated_hours: number | null
          event_date: string
          event_id: string | null
          event_type: string | null
          expires_at: string | null
          id: string
          location: string
          origin: string | null
          quoted_amount: number | null
          request_call: boolean | null
          service_type: string | null
          status: string
          stripe_session_id: string | null
          updated_at: string
          vendor_email: string
          vendor_id: string
          vendor_name: string | null
          vendor_note: string | null
        }
        Insert: {
          booking_id?: string | null
          budget_range: string
          call_time_window?: string | null
          client_email: string
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          estimated_guests: number
          estimated_hours?: number | null
          event_date: string
          event_id?: string | null
          event_type?: string | null
          expires_at?: string | null
          id?: string
          location: string
          origin?: string | null
          quoted_amount?: number | null
          request_call?: boolean | null
          service_type?: string | null
          status: string
          stripe_session_id?: string | null
          updated_at?: string
          vendor_email: string
          vendor_id: string
          vendor_name?: string | null
          vendor_note?: string | null
        }
        Update: {
          booking_id?: string | null
          budget_range?: string
          call_time_window?: string | null
          client_email?: string
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          estimated_guests?: number
          estimated_hours?: number | null
          event_date?: string
          event_id?: string | null
          event_type?: string | null
          expires_at?: string | null
          id?: string
          location?: string
          origin?: string | null
          quoted_amount?: number | null
          request_call?: boolean | null
          service_type?: string | null
          status?: string
          stripe_session_id?: string | null
          updated_at?: string
          vendor_email?: string
          vendor_id?: string
          vendor_name?: string | null
          vendor_note?: string | null
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
          reporter_email: string
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
          reporter_email: string
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
          reporter_email?: string
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
          acceptance_rate: number | null
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
          hourly_rate: number
          id: string
          languages: string[] | null
          latitude: number | null
          locations_serviced: string[] | null
          longitude: number | null
          name: string
          owner_email: string | null
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
          unavailable_dates: string[] | null
          unit_number: string | null
          updated_at: string
          verified: boolean | null
          weekly_unavailable_days: number[] | null
        }
        Insert: {
          acceptance_rate?: number | null
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
          hourly_rate: number
          id?: string
          languages?: string[] | null
          latitude?: number | null
          locations_serviced?: string[] | null
          longitude?: number | null
          name: string
          owner_email?: string | null
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
          unavailable_dates?: string[] | null
          unit_number?: string | null
          updated_at?: string
          verified?: boolean | null
          weekly_unavailable_days?: number[] | null
        }
        Update: {
          acceptance_rate?: number | null
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
          hourly_rate?: number
          id?: string
          languages?: string[] | null
          latitude?: number | null
          locations_serviced?: string[] | null
          longitude?: number | null
          name?: string
          owner_email?: string | null
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
          id: string
          job_card_id: string
          label: string
          order: number | null
          organiser_email: string
          owner_role: string
          status: string
          updated_at: string
          vendor_email: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by_email?: string | null
          id?: string
          job_card_id: string
          label: string
          order?: number | null
          organiser_email: string
          owner_role: string
          status: string
          updated_at?: string
          vendor_email: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by_email?: string | null
          id?: string
          job_card_id?: string
          label?: string
          order?: number | null
          organiser_email?: string
          owner_role?: string
          status?: string
          updated_at?: string
          vendor_email?: string
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
      is_admin: { Args: never; Returns: boolean }
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
