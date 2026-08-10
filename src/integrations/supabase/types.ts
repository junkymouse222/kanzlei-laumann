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
      manual_confirmations: {
        Row: {
          beleg_art: string
          beleg_nr: string
          created_at: string
          customer_email: string | null
          id: string
          ip: string | null
          kunde_anschrift: string | null
          kunde_name: string | null
          offer_request_id: string | null
          rechnung_error: string | null
          rechnung_nr: string | null
          rechnung_sent_at: string | null
          total: number | null
          user_agent: string | null
        }
        Insert: {
          beleg_art: string
          beleg_nr: string
          created_at?: string
          customer_email?: string | null
          id?: string
          ip?: string | null
          kunde_anschrift?: string | null
          kunde_name?: string | null
          offer_request_id?: string | null
          rechnung_error?: string | null
          rechnung_nr?: string | null
          rechnung_sent_at?: string | null
          total?: number | null
          user_agent?: string | null
        }
        Update: {
          beleg_art?: string
          beleg_nr?: string
          created_at?: string
          customer_email?: string | null
          id?: string
          ip?: string | null
          kunde_anschrift?: string | null
          kunde_name?: string | null
          offer_request_id?: string | null
          rechnung_error?: string | null
          rechnung_nr?: string | null
          rechnung_sent_at?: string | null
          total?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      offer_request_items: {
        Row: {
          artikel: string
          beschreibung: string | null
          created_at: string
          einheit: string
          einzelpreis: number
          id: string
          menge: number
          name: string
          pos: number
          position_total: number
          request_id: string
        }
        Insert: {
          artikel: string
          beschreibung?: string | null
          created_at?: string
          einheit: string
          einzelpreis: number
          id?: string
          menge: number
          name: string
          pos: number
          position_total: number
          request_id: string
        }
        Update: {
          artikel?: string
          beschreibung?: string | null
          created_at?: string
          einheit?: string
          einzelpreis?: number
          id?: string
          menge?: number
          name?: string
          pos?: number
          position_total?: number
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "offer_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_requests: {
        Row: {
          accept_token: string
          accepted_at: string | null
          accepted_ip: string | null
          angebot_nr: string
          bank_bic: string | null
          bank_iban: string | null
          bank_inhaber: string | null
          bank_name: string | null
          created_at: string
          customer_address: string
          customer_company: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          customer_ust_id: string | null
          delivery_address: string | null
          delivery_name: string | null
          error_message: string | null
          id: string
          lieferkosten: number
          message: string | null
          mwst: number
          mwst_rate: number
          offer_html: string | null
          paid_at: string | null
          paid_ip: string | null
          pay_token: string
          payment_confirm_message_id: string | null
          payment_confirm_sent_at: string | null
          rechnung_error: string | null
          rechnung_faellig_am: string | null
          rechnung_message_id: string | null
          rechnung_nr: string | null
          rechnung_sent_at: string | null
          rechnung_status: string
          ref_source: string | null
          resend_message_id: string | null
          scheduled_send_at: string
          sent_at: string | null
          site_key: string | null
          status: string
          subtotal: number
          total: number
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          accept_token?: string
          accepted_at?: string | null
          accepted_ip?: string | null
          angebot_nr: string
          bank_bic?: string | null
          bank_iban?: string | null
          bank_inhaber?: string | null
          bank_name?: string | null
          created_at?: string
          customer_address: string
          customer_company?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          customer_ust_id?: string | null
          delivery_address?: string | null
          delivery_name?: string | null
          error_message?: string | null
          id?: string
          lieferkosten?: number
          message?: string | null
          mwst?: number
          mwst_rate?: number
          offer_html?: string | null
          paid_at?: string | null
          paid_ip?: string | null
          pay_token?: string
          payment_confirm_message_id?: string | null
          payment_confirm_sent_at?: string | null
          rechnung_error?: string | null
          rechnung_faellig_am?: string | null
          rechnung_message_id?: string | null
          rechnung_nr?: string | null
          rechnung_sent_at?: string | null
          rechnung_status?: string
          ref_source?: string | null
          resend_message_id?: string | null
          scheduled_send_at: string
          sent_at?: string | null
          site_key?: string | null
          status?: string
          subtotal?: number
          total?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          accept_token?: string
          accepted_at?: string | null
          accepted_ip?: string | null
          angebot_nr?: string
          bank_bic?: string | null
          bank_iban?: string | null
          bank_inhaber?: string | null
          bank_name?: string | null
          created_at?: string
          customer_address?: string
          customer_company?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          customer_ust_id?: string | null
          delivery_address?: string | null
          delivery_name?: string | null
          error_message?: string | null
          id?: string
          lieferkosten?: number
          message?: string | null
          mwst?: number
          mwst_rate?: number
          offer_html?: string | null
          paid_at?: string | null
          paid_ip?: string | null
          pay_token?: string
          payment_confirm_message_id?: string | null
          payment_confirm_sent_at?: string | null
          rechnung_error?: string | null
          rechnung_faellig_am?: string | null
          rechnung_message_id?: string | null
          rechnung_nr?: string | null
          rechnung_sent_at?: string | null
          rechnung_status?: string
          ref_source?: string | null
          resend_message_id?: string | null
          scheduled_send_at?: string
          sent_at?: string | null
          site_key?: string | null
          status?: string
          subtotal?: number
          total?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      page_views: {
        Row: {
          country: string | null
          country_code: string | null
          created_at: string
          id: string
          ip: string | null
          path: string
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          country?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          path: string
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          country?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          path?: string
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const
