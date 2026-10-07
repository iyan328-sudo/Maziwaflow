export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      collection_corrections: {
        Row: {
          collection_id: string;
          corrected_by: string | null;
          created_at: string;
          farmer_code: string;
          field_name: string;
          id: string;
          new_value: string | null;
          old_value: string | null;
          reason: string;
        };
        Insert: {
          collection_id: string;
          corrected_by?: string | null;
          created_at?: string;
          farmer_code: string;
          field_name: string;
          id?: string;
          new_value?: string | null;
          old_value?: string | null;
          reason: string;
        };
        Update: {
          collection_id?: string;
          corrected_by?: string | null;
          created_at?: string;
          farmer_code?: string;
          field_name?: string;
          id?: string;
          new_value?: string | null;
          old_value?: string | null;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collection_corrections_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_corrections_corrected_by_fkey";
            columns: ["corrected_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      collections: {
        Row: {
          collected_at: string;
          client_sync_id: string | null;
          created_at: string;
          farmer_code: string;
          id: string;
          payment_id: string | null;
          price_per_ksh: number | null;
          quality_grade: string;
          quantity_kg: number;
          received_by: string | null;
          status: string;
        };
        Insert: {
          collected_at?: string;
          client_sync_id?: string | null;
          created_at?: string;
          farmer_code: string;
          id?: string;
          payment_id?: string | null;
          price_per_ksh?: number | null;
          quality_grade: string;
          quantity_kg: number;
          received_by?: string | null;
          status?: string;
        };
        Update: {
          collected_at?: string;
          client_sync_id?: string | null;
          created_at?: string;
          farmer_code?: string;
          id?: string;
          payment_id?: string | null;
          price_per_ksh?: number | null;
          quality_grade?: string;
          quantity_kg?: number;
          received_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collections_farmer_code_fkey";
            columns: ["farmer_code"];
            isOneToOne: false;
            referencedRelation: "farmers";
            referencedColumns: ["farmer_code"];
          },
          {
            foreignKeyName: "collections_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collections_received_by_fkey";
            columns: ["received_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deductions: {
        Row: {
          amount_ksh: number;
          created_at: string;
          description: string | null;
          farmer_code: string;
          id: string;
          lipa_pole_pole_id: string | null;
          payment_id: string;
          type: string;
        };
        Insert: {
          amount_ksh: number;
          created_at?: string;
          description?: string | null;
          farmer_code: string;
          id?: string;
          lipa_pole_pole_id?: string | null;
          payment_id: string;
          type?: string;
        };
        Update: {
          amount_ksh?: number;
          created_at?: string;
          description?: string | null;
          farmer_code?: string;
          id?: string;
          lipa_pole_pole_id?: string | null;
          payment_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deductions_farmer_code_fkey";
            columns: ["farmer_code"];
            isOneToOne: false;
            referencedRelation: "farmers";
            referencedColumns: ["farmer_code"];
          },
          {
            foreignKeyName: "deductions_lipa_pole_pole_id_fkey";
            columns: ["lipa_pole_pole_id"];
            isOneToOne: false;
            referencedRelation: "lipa_pole_pole";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deductions_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      enquiries: {
        Row: {
          category: string;
          created_at: string;
          created_by: string;
          farmer_code: string | null;
          id: string;
          message: string;
          reply: string | null;
          replied_at: string | null;
          replied_by: string | null;
          status: string;
          subject: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          created_by?: string;
          farmer_code?: string | null;
          id?: string;
          message: string;
          reply?: string | null;
          replied_at?: string | null;
          replied_by?: string | null;
          status?: string;
          subject: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string;
          farmer_code?: string | null;
          id?: string;
          message?: string;
          reply?: string | null;
          replied_at?: string | null;
          replied_by?: string | null;
          status?: string;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enquiries_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiries_farmer_code_fkey";
            columns: ["farmer_code"];
            isOneToOne: false;
            referencedRelation: "farmers";
            referencedColumns: ["farmer_code"];
          },
          {
            foreignKeyName: "enquiries_replied_by_fkey";
            columns: ["replied_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      farmers: {
        Row: {
          created_at: string;
          farmer_code: string;
          full_name: string;
          linked_user_id: string | null;
          location: string | null;
          phone: string | null;
        };
        Insert: {
          created_at?: string;
          farmer_code: string;
          full_name: string;
          linked_user_id?: string | null;
          location?: string | null;
          phone?: string | null;
        };
        Update: {
          created_at?: string;
          farmer_code?: string;
          full_name?: string;
          linked_user_id?: string | null;
          location?: string | null;
          phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "farmers_linked_user_id_fkey";
            columns: ["linked_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lipa_pole_pole: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          credit_limit_ksh: number;
          created_at: string;
          farmer_code: string;
          id: string;
          installment_amount_ksh: number;
          notes: string | null;
          status: string;
          total_deducted_ksh: number;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          credit_limit_ksh: number;
          created_at?: string;
          farmer_code: string;
          id?: string;
          installment_amount_ksh: number;
          notes?: string | null;
          status?: string;
          total_deducted_ksh?: number;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          credit_limit_ksh?: number;
          created_at?: string;
          farmer_code?: string;
          id?: string;
          installment_amount_ksh?: number;
          notes?: string | null;
          status?: string;
          total_deducted_ksh?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lipa_pole_pole_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lipa_pole_pole_farmer_code_fkey";
            columns: ["farmer_code"];
            isOneToOne: false;
            referencedRelation: "farmers";
            referencedColumns: ["farmer_code"];
          },
        ];
      };
      milk_prices: {
        Row: {
          created_at: string;
          effective_from: string;
          grade: string;
          id: string;
          price_per_ksh: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          effective_from?: string;
          grade: string;
          id?: string;
          price_per_ksh: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          effective_from?: string;
          grade?: string;
          id?: string;
          price_per_ksh?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "milk_prices_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      mpesa_auth_tokens: {
        Row: { access_token: string; created_at: string; expires_at: string; id: string };
        Insert: { access_token: string; created_at?: string; expires_at: string; id?: string };
        Update: { access_token?: string; created_at?: string; expires_at?: string; id?: string };
        Relationships: [];
      };
      mpesa_transactions: {
        Row: {
          amount_ksh: number;
          checkout_request_id: string;
          created_at: string;
          farmer_code: string | null;
          id: string;
          initiated_by: string | null;
          merchant_request_id: string | null;
          mpesa_receipt_number: string | null;
          payment_id: string | null;
          phone: string;
          result_code: number | null;
          result_desc: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_ksh: number;
          checkout_request_id: string;
          created_at?: string;
          farmer_code?: string | null;
          id?: string;
          initiated_by?: string | null;
          merchant_request_id?: string | null;
          mpesa_receipt_number?: string | null;
          payment_id?: string | null;
          phone: string;
          result_code?: number | null;
          result_desc?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_ksh?: number;
          checkout_request_id?: string;
          created_at?: string;
          farmer_code?: string | null;
          id?: string;
          initiated_by?: string | null;
          merchant_request_id?: string | null;
          mpesa_receipt_number?: string | null;
          payment_id?: string | null;
          phone?: string;
          result_code?: number | null;
          result_desc?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mpesa_transactions_farmer_code_fkey";
            columns: ["farmer_code"];
            isOneToOne: false;
            referencedRelation: "farmers";
            referencedColumns: ["farmer_code"];
          },
          {
            foreignKeyName: "mpesa_transactions_initiated_by_fkey";
            columns: ["initiated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mpesa_transactions_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          is_read: boolean;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          title: string;
          type?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          created_at: string;
          deduction_ksh: number;
          farmer_code: string;
          gross_ksh: number;
          id: string;
          net_ksh: number;
          notes: string | null;
          payment_method: string | null;
          period_end: string;
          period_start: string;
          processed_by: string | null;
          reference: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          deduction_ksh?: number;
          farmer_code: string;
          gross_ksh?: number;
          id?: string;
          net_ksh?: number;
          notes?: string | null;
          payment_method?: string | null;
          period_end: string;
          period_start: string;
          processed_by?: string | null;
          reference?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          deduction_ksh?: number;
          farmer_code?: string;
          gross_ksh?: number;
          id?: string;
          net_ksh?: number;
          notes?: string | null;
          payment_method?: string | null;
          period_end?: string;
          period_start?: string;
          processed_by?: string | null;
          reference?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_farmer_code_fkey";
            columns: ["farmer_code"];
            isOneToOne: false;
            referencedRelation: "farmers";
            referencedColumns: ["farmer_code"];
          },
          {
            foreignKeyName: "payments_processed_by_fkey";
            columns: ["processed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          collection_centre: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          role: string;
        };
        Insert: {
          collection_centre?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          role?: string;
        };
        Update: {
          collection_centre?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          role?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      farmer_balances: {
        Row: {
          collection_count: number;
          farmer_code: string;
          full_name: string;
          last_paid_at: string | null;
          location: string | null;
          paid_earnings: number;
          phone: string | null;
          total_deductions: number;
          total_earnings: number;
          total_net_paid: number;
          total_paid: number;
          unpaid_count: number;
          unpaid_earnings: number;
          outstanding_balance: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: {
      process_payment: {
        Args: {
          p_farmer_code: string;
          p_period_start: string;
          p_period_end: string;
          p_payment_method: string | null;
          p_reference: string | null;
          p_notes: string | null;
          p_processed_by: string;
        };
        Returns: {
          net_ksh?: number;
          deduction_ksh?: number;
          gross_ksh?: number;
          plan_deducted?: boolean;
          collections_paid?: number;
          message?: string;
        } | null;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
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
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
