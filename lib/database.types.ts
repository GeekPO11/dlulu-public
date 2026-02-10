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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          ai_metadata: Json | null
          allocation_type: Database["public"]["Enums"]["allocation_type"] | null
          color_id: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          effort_minutes_allocated: number | null
          end_date: string | null
          end_datetime: string
          energy_cost: Database["public"]["Enums"]["priority_level"] | null
          event_type: Database["public"]["Enums"]["event_type"] | null
          external_event_id: string | null
          goal_id: string | null
          id: string
          is_all_day: boolean | null
          is_recurring: boolean | null
          location: string | null
          milestone_id: string | null
          original_start_datetime: string | null
          phase_id: string | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          rationale: string | null
          recurrence_rule: Json | null
          recurring_event_id: string | null
          reschedule_count: number | null
          roadmap_task_id: string | null
          session_index: number | null
          skipped_reason: string | null
          source: string | null
          start_date: string | null
          start_datetime: string
          status: Database["public"]["Enums"]["event_status"] | null
          summary: string
          sync_status: Database["public"]["Enums"]["sync_status"] | null
          timezone: string | null
          total_sessions: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_metadata?: Json | null
          allocation_type?:
          | Database["public"]["Enums"]["allocation_type"]
          | null
          color_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          effort_minutes_allocated?: number | null
          end_date?: string | null
          end_datetime: string
          energy_cost?: Database["public"]["Enums"]["priority_level"] | null
          event_type?: Database["public"]["Enums"]["event_type"] | null
          external_event_id?: string | null
          goal_id?: string | null
          id?: string
          is_all_day?: boolean | null
          is_recurring?: boolean | null
          location?: string | null
          milestone_id?: string | null
          original_start_datetime?: string | null
          phase_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          rationale?: string | null
          recurrence_rule?: Json | null
          recurring_event_id?: string | null
          reschedule_count?: number | null
          roadmap_task_id?: string | null
          session_index?: number | null
          skipped_reason?: string | null
          source?: string | null
          start_date?: string | null
          start_datetime: string
          status?: Database["public"]["Enums"]["event_status"] | null
          summary: string
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          timezone?: string | null
          total_sessions?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_metadata?: Json | null
          allocation_type?:
          | Database["public"]["Enums"]["allocation_type"]
          | null
          color_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          effort_minutes_allocated?: number | null
          end_date?: string | null
          end_datetime?: string
          energy_cost?: Database["public"]["Enums"]["priority_level"] | null
          event_type?: Database["public"]["Enums"]["event_type"] | null
          external_event_id?: string | null
          goal_id?: string | null
          id?: string
          is_all_day?: boolean | null
          is_recurring?: boolean | null
          location?: string | null
          milestone_id?: string | null
          original_start_datetime?: string | null
          phase_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          rationale?: string | null
          recurrence_rule?: Json | null
          recurring_event_id?: string | null
          reschedule_count?: number | null
          roadmap_task_id?: string | null
          session_index?: number | null
          skipped_reason?: string | null
          source?: string | null
          start_date?: string | null
          start_datetime?: string
          status?: Database["public"]["Enums"]["event_status"] | null
          summary?: string
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          timezone?: string | null
          total_sessions?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_action_log: {
        Row: {
          action_input: Json
          action_output: Json | null
          action_type: string
          confirmation_message_id: string | null
          confirmed_at: string | null
          created_at: string | null
          error_message: string | null
          executed_at: string | null
          id: string
          is_undoable: boolean | null
          message_id: string | null
          requested_at: string | null
          requires_confirmation: boolean | null
          retry_count: number | null
          session_id: string | null
          status: string | null
          target_id: string | null
          target_title: string | null
          target_type: string | null
          undo_data: Json | null
          undone_at: string | null
          undone_by_action_id: string | null
          user_id: string
        }
        Insert: {
          action_input: Json
          action_output?: Json | null
          action_type: string
          confirmation_message_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          is_undoable?: boolean | null
          message_id?: string | null
          requested_at?: string | null
          requires_confirmation?: boolean | null
          retry_count?: number | null
          session_id?: string | null
          status?: string | null
          target_id?: string | null
          target_title?: string | null
          target_type?: string | null
          undo_data?: Json | null
          undone_at?: string | null
          undone_by_action_id?: string | null
          user_id: string
        }
        Update: {
          action_input?: Json
          action_output?: Json | null
          action_type?: string
          confirmation_message_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          is_undoable?: boolean | null
          message_id?: string | null
          requested_at?: string | null
          requires_confirmation?: boolean | null
          retry_count?: number | null
          session_id?: string | null
          status?: string | null
          target_id?: string | null
          target_title?: string | null
          target_type?: string | null
          undo_data?: Json | null
          undone_at?: string | null
          undone_by_action_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_action_log_confirmation_message_id_fkey"
            columns: ["confirmation_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_action_log_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_action_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_action_log_undone_by_action_id_fkey"
            columns: ["undone_by_action_id"]
            isOneToOne: false
            referencedRelation: "chat_action_log"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          action_results: Json | null
          content: string
          created_at: string | null
          error_message: string | null
          function_calls: Json | null
          id: string
          is_error: boolean | null
          latency_ms: number | null
          pending_confirmation: Json | null
          role: string
          session_id: string
          thinking: string | null
          tokens_input: number | null
          tokens_output: number | null
          user_id: string
        }
        Insert: {
          action_results?: Json | null
          content: string
          created_at?: string | null
          error_message?: string | null
          function_calls?: Json | null
          id?: string
          is_error?: boolean | null
          latency_ms?: number | null
          pending_confirmation?: Json | null
          role: string
          session_id: string
          thinking?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id: string
        }
        Update: {
          action_results?: Json | null
          content?: string
          created_at?: string | null
          error_message?: string | null
          function_calls?: Json | null
          id?: string
          is_error?: boolean | null
          latency_ms?: number | null
          pending_confirmation?: Json | null
          role?: string
          session_id?: string
          thinking?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          conversation_state: Json | null
          created_at: string | null
          ended_at: string | null
          id: string
          is_active: boolean | null
          last_message_at: string | null
          message_count: number | null
          started_at: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          conversation_state?: Json | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          started_at?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          conversation_state?: Json | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          started_at?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          category: Database["public"]["Enums"]["goal_category"]
          created_at: string | null
          behavior_plan: Json | null
          critical_gaps: string[] | null
          current_phase_index: number | null
          duration: number | null
          energy_cost: Database["public"]["Enums"]["priority_level"] | null
          estimated_weeks: number | null
          frequency: number | null
          id: string
          is_scheduled: boolean | null
          overview_generated: boolean | null
          original_input: string | null
          overall_progress: number | null
          preferred_days: number[] | null
          preferred_time: string | null
          priority_weight: number | null
          risk_acknowledged_at: string | null
          risk_level: string | null
          status: Database["public"]["Enums"]["goal_status"] | null
          strategy_overview: string | null
          timeline: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["goal_category"]
          behavior_plan?: Json | null
          created_at?: string | null
          critical_gaps?: string[] | null
          current_phase_index?: number | null
          duration?: number | null
          energy_cost?: Database["public"]["Enums"]["priority_level"] | null
          estimated_weeks?: number | null
          frequency?: number | null
          id?: string
          is_scheduled?: boolean | null
          overview_generated?: boolean | null
          original_input?: string | null
          overall_progress?: number | null
          preferred_days?: number[] | null
          preferred_time?: string | null
          priority_weight?: number | null
          risk_acknowledged_at?: string | null
          risk_level?: string | null
          status?: Database["public"]["Enums"]["goal_status"] | null
          strategy_overview?: string | null
          timeline?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["goal_category"]
          behavior_plan?: Json | null
          created_at?: string | null
          critical_gaps?: string[] | null
          current_phase_index?: number | null
          duration?: number | null
          energy_cost?: Database["public"]["Enums"]["priority_level"] | null
          estimated_weeks?: number | null
          frequency?: number | null
          id?: string
          is_scheduled?: boolean | null
          overview_generated?: boolean | null
          original_input?: string | null
          overall_progress?: number | null
          preferred_days?: number[] | null
          preferred_time?: string | null
          priority_weight?: number | null
          risk_acknowledged_at?: string | null
          risk_level?: string | null
          status?: Database["public"]["Enums"]["goal_status"] | null
          strategy_overview?: string | null
          timeline?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      history_entries: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string
          goal_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type: string
          goal_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string
          goal_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "history_entries_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          completed_at: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          goal_id: string
          id: string
          is_completed: boolean | null
          phase_id: string
          target_week: number | null
          title: string
          updated_at: string | null
          user_id: string
          user_notes: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          goal_id: string
          id?: string
          is_completed?: boolean | null
          phase_id: string
          target_week?: number | null
          title: string
          updated_at?: string | null
          user_id: string
          user_notes?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          goal_id?: string
          id?: string
          is_completed?: boolean | null
          phase_id?: string
          target_week?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string
          user_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestones_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
        ]
      }
      phases: {
        Row: {
          coach_advice: string | null
          created_at: string | null
          description: string | null
          end_week: number
          estimated_duration: string | null
          focus: string[] | null
          goal_id: string
          id: string
          is_scheduled: boolean | null
          phase_number: number
          progress: number | null
          start_week: number
          status: Database["public"]["Enums"]["phase_status"] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          coach_advice?: string | null
          created_at?: string | null
          description?: string | null
          end_week: number
          estimated_duration?: string | null
          focus?: string[] | null
          goal_id: string
          id?: string
          is_scheduled?: boolean | null
          phase_number: number
          progress?: number | null
          start_week: number
          status?: Database["public"]["Enums"]["phase_status"] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          coach_advice?: string | null
          created_at?: string | null
          description?: string | null
          end_week?: number
          estimated_duration?: string | null
          focus?: string[] | null
          goal_id?: string
          id?: string
          is_scheduled?: boolean | null
          phase_number?: number
          progress?: number | null
          start_week?: number
          status?: Database["public"]["Enums"]["phase_status"] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phases_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          chronotype: Database["public"]["Enums"]["chronotype"] | null
          created_at: string | null
          email: string
          energy_level: Database["public"]["Enums"]["energy_level"] | null
          id: string
          name: string
          onboarding_completed: boolean | null
          onboarding_step: number | null
          role: string | null
          role_context: string | null
          timezone: string | null
          updated_at: string | null
          work_style: Database["public"]["Enums"]["work_style"] | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          chronotype?: Database["public"]["Enums"]["chronotype"] | null
          created_at?: string | null
          email: string
          energy_level?: Database["public"]["Enums"]["energy_level"] | null
          id: string
          name?: string
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          role?: string | null
          role_context?: string | null
          timezone?: string | null
          updated_at?: string | null
          work_style?: Database["public"]["Enums"]["work_style"] | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          chronotype?: Database["public"]["Enums"]["chronotype"] | null
          created_at?: string | null
          email?: string
          energy_level?: Database["public"]["Enums"]["energy_level"] | null
          id?: string
          name?: string
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          role?: string | null
          role_context?: string | null
          timezone?: string | null
          updated_at?: string | null
          work_style?: Database["public"]["Enums"]["work_style"] | null
        }
        Relationships: []
      }
      subtasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_completed: boolean | null
          is_manual: boolean | null
          is_strikethrough: boolean | null
          milestone_id: string
          task_id: string | null
          strikethrough_reason: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_completed?: boolean | null
          is_manual?: boolean | null
          is_strikethrough?: boolean | null
          milestone_id: string
          task_id?: string | null
          strikethrough_reason?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_completed?: boolean | null
          is_manual?: boolean | null
          is_strikethrough?: boolean | null
          milestone_id?: string
          task_id?: string | null
          strikethrough_reason?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          cognitive_type: Database["public"]["Enums"]["cognitive_type"] | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          difficulty: number | null
          display_order: number | null
          duration_days: number | null
          end_day: number | null
          estimated_minutes: number | null
          goal_id: string | null
          id: string
          is_completed: boolean | null
          is_strikethrough: boolean | null
          milestone_id: string
          phase_id: string | null
          start_day: number | null
          strikethrough_reason: string | null
          times_per_week: number | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          cognitive_type?: Database["public"]["Enums"]["cognitive_type"] | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          difficulty?: number | null
          display_order?: number | null
          duration_days?: number | null
          end_day?: number | null
          estimated_minutes?: number | null
          goal_id?: string | null
          id?: string
          is_completed?: boolean | null
          is_strikethrough?: boolean | null
          milestone_id: string
          phase_id?: string | null
          start_day?: number | null
          strikethrough_reason?: string | null
          times_per_week?: number | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          cognitive_type?: Database["public"]["Enums"]["cognitive_type"] | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          difficulty?: number | null
          display_order?: number | null
          duration_days?: number | null
          end_day?: number | null
          estimated_minutes?: number | null
          goal_id?: string | null
          id?: string
          is_completed?: boolean | null
          is_strikethrough?: boolean | null
          milestone_id?: string
          phase_id?: string | null
          start_day?: number | null
          strikethrough_reason?: string | null
          times_per_week?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
        ]
      }
      time_blocks: {
        Row: {
          block_type: Database["public"]["Enums"]["time_block_type"]
          created_at: string | null
          days: number[]
          end_time: string
          id: string
          is_flexible: boolean | null
          start_time: string
          title: string
          updated_at: string | null
          user_id: string
          week_pattern: string | null
          timezone: string | null
        }
        Insert: {
          block_type: Database["public"]["Enums"]["time_block_type"]
          created_at?: string | null
          days: number[]
          end_time: string
          id?: string
          is_flexible?: boolean | null
          start_time: string
          title: string
          updated_at?: string | null
          user_id: string
          week_pattern?: string | null
          timezone?: string | null
        }
        Update: {
          block_type?: Database["public"]["Enums"]["time_block_type"]
          created_at?: string | null
          days?: number[]
          end_time?: string
          id?: string
          is_flexible?: boolean | null
          start_time?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          week_pattern?: string | null
          timezone?: string | null
        }
        Relationships: []
      }
      time_constraints: {
        Row: {
          created_at: string | null
          id: string
          peak_end: string | null
          peak_start: string | null
          sleep_end: string | null
          sleep_start: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          peak_end?: string | null
          peak_start?: string | null
          sleep_end?: string | null
          sleep_start?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          peak_end?: string | null
          peak_start?: string | null
          sleep_end?: string | null
          sleep_start?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      time_exceptions: {
        Row: {
          created_at: string | null
          date: string
          end_time: string
          id: string
          is_blocked: boolean | null
          reason: string | null
          start_time: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          end_time: string
          id?: string
          is_blocked?: boolean | null
          reason?: string | null
          start_time: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          end_time?: string
          id?: string
          is_blocked?: boolean | null
          reason?: string | null
          start_time?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          status: string
          price_id: string | null
          plan_id: string | null
          cancel_at_period_end: boolean | null
          current_period_end: string
          stripe_customer_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          user_id: string
          status: string
          price_id?: string | null
          plan_id?: string | null
          cancel_at_period_end?: boolean | null
          current_period_end: string
          stripe_customer_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          status?: string
          price_id?: string | null
          plan_id?: string | null
          cancel_at_period_end?: boolean | null
          current_period_end?: string
          stripe_customer_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      plan_entitlements: {
        Row: {
          plan_id: string
          max_active_goals: number
          token_hard_cap: number | null
          token_soft_cap: number | null
          calendar_sync_enabled: boolean | null
          warning_thresholds: Json | null
          throttle_policy: Json | null
          updated_at: string | null
        }
        Insert: {
          plan_id: string
          max_active_goals: number
          token_hard_cap?: number | null
          token_soft_cap?: number | null
          calendar_sync_enabled?: boolean | null
          warning_thresholds?: Json | null
          throttle_policy?: Json | null
          updated_at?: string | null
        }
        Update: {
          plan_id?: string
          max_active_goals?: number
          token_hard_cap?: number | null
          token_soft_cap?: number | null
          calendar_sync_enabled?: boolean | null
          warning_thresholds?: Json | null
          throttle_policy?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_entitlement_overrides: {
        Row: {
          id: string
          user_id: string
          override_plan_id: string
          reason: string | null
          starts_at: string | null
          ends_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          override_plan_id: string
          reason?: string | null
          starts_at?: string | null
          ends_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          override_plan_id?: string
          reason?: string | null
          starts_at?: string | null
          ends_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_entitlement_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_entitlement_overrides_override_plan_id_fkey"
            columns: ["override_plan_id"]
            isOneToOne: false
            referencedRelation: "plan_entitlements"
            referencedColumns: ["plan_id"]
          }
        ]
      }
      user_usage_periods: {
        Row: {
          id: string
          user_id: string
          period_start: string
          period_end: string
          token_usage: number | null
          tokens_total_used: number | null
          tokens_input_used: number | null
          tokens_output_used: number | null
          active_goal_count: number | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          period_start: string
          period_end: string
          token_usage?: number | null
          tokens_total_used?: number | null
          tokens_input_used?: number | null
          tokens_output_used?: number | null
          active_goal_count?: number | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          period_start?: string
          period_end?: string
          token_usage?: number | null
          tokens_total_used?: number | null
          tokens_input_used?: number | null
          tokens_output_used?: number | null
          active_goal_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_usage_periods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_conversation_history: {
        Args: { p_limit?: number; p_session_id: string }
        Returns: {
          content: string
          created_at: string
          role: string
        }[]
      }
      get_or_create_chat_session: {
        Args: { p_user_id: string }
        Returns: string
      }
      save_chat_message: {
        Args: {
          p_action_results?: Json
          p_content: string
          p_message_id: string
          p_pending_confirmation?: Json
          p_role: string
          p_session_id: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      allocation_type:
      | "task_session"
      | "habit_instance"
      | "milestone_deadline"
      | "blocked"
      | "manual"
      chronotype: "early_bird" | "night_owl" | "midday_peak" | "flexible"
      energy_level: "high_octane" | "balanced" | "recovery"
      event_status:
      | "scheduled"
      | "in_progress"
      | "completed"
      | "skipped"
      | "snoozed"
      | "rescheduled"
      | "missed"
      event_type:
      | "goal_session"
      | "milestone_deadline"
      | "habit"
      | "task"
      | "blocked"
      | "imported"
      goal_category:
      | "health"
      | "career"
      | "learning"
      | "personal"
      | "financial"
      | "relationships"
      goal_status: "planning" | "active" | "paused" | "completed" | "abandoned"
      phase_status: "upcoming" | "active" | "completed"
      priority_level: "high" | "medium" | "low"
      sync_status: "local_only" | "synced" | "pending_sync" | "sync_error"
      task_status: "todo" | "in_progress" | "completed" | "blocked" | "deferred"
      time_block_type: "work" | "personal" | "commute" | "meal" | "other"
      work_style: "deep_work" | "pomodoro" | "flow" | "reactive"
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
      allocation_type: [
        "task_session",
        "habit_instance",
        "milestone_deadline",
        "blocked",
        "manual",
      ],
      chronotype: ["early_bird", "night_owl", "midday_peak", "flexible"],
      energy_level: ["high_octane", "balanced", "recovery"],
      event_status: [
        "scheduled",
        "in_progress",
        "completed",
        "skipped",
        "snoozed",
        "rescheduled",
        "missed",
      ],
      event_type: [
        "goal_session",
        "milestone_deadline",
        "habit",
        "task",
        "blocked",
        "imported",
      ],
      goal_category: [
        "health",
        "career",
        "learning",
        "personal",
        "financial",
        "relationships",
      ],
      goal_status: ["planning", "active", "paused", "completed", "abandoned"],
      phase_status: ["upcoming", "active", "completed"],
      priority_level: ["high", "medium", "low"],
      sync_status: ["local_only", "synced", "pending_sync", "sync_error"],
      task_status: ["todo", "in_progress", "completed", "blocked", "deferred"],
      time_block_type: ["work", "personal", "commute", "meal", "other"],
      work_style: ["deep_work", "pomodoro", "flow", "reactive"],
    },
  },
} as const
