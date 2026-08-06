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
      kyc_documents: {
        Row: {
          doc_type: Database["public"]["Enums"]["kyc_doc_type"]
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          storage_path: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          doc_type: Database["public"]["Enums"]["kyc_doc_type"]
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          storage_path: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          doc_type?: Database["public"]["Enums"]["kyc_doc_type"]
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          storage_path?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loan_guarantors: {
        Row: {
          amount: number
          created_at: string
          guarantor_id: string
          id: string
          loan_id: string
          requester_id: string
          response_note: string | null
          status: Database["public"]["Enums"]["guarantor_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          guarantor_id: string
          id?: string
          loan_id: string
          requester_id: string
          response_note?: string | null
          status?: Database["public"]["Enums"]["guarantor_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          guarantor_id?: string
          id?: string
          loan_id?: string
          requester_id?: string
          response_note?: string | null
          status?: Database["public"]["Enums"]["guarantor_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_guarantors_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          interest_rate: number
          loan_type: Database["public"]["Enums"]["loan_type"]
          monthly_payment: number
          principal: number
          purpose: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          interest_rate?: number
          loan_type?: Database["public"]["Enums"]["loan_type"]
          monthly_payment?: number
          principal: number
          purpose?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          interest_rate?: number
          loan_type?: Database["public"]["Enums"]["loan_type"]
          monthly_payment?: number
          principal?: number
          purpose?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          term_months?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      next_of_kin: {
        Row: {
          allocation_percentage: number
          created_at: string
          email: string | null
          full_name: string
          id: string
          national_id: string | null
          phone: string | null
          relationship: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allocation_percentage?: number
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          national_id?: string | null
          phone?: string | null
          relationship: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allocation_percentage?: number
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          national_id?: string | null
          phone?: string | null
          relationship?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          id: string
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          member_number: string | null
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          national_id: string | null
          onboarding_completed: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          id: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          member_number?: string | null
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          national_id?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          member_number?: string | null
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          national_id?: string | null
          onboarding_completed?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          checkout_request_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          reference: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          tx_type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          checkout_request_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          tx_type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          tx_type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
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
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
          wallet_type: Database["public"]["Enums"]["wallet_type"]
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
          wallet_type: Database["public"]["Enums"]["wallet_type"]
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
          wallet_type?: Database["public"]["Enums"]["wallet_type"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_report_summary: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      admin_wallet_totals: {
        Args: never
        Returns: {
          total: number
          wallet_type: string
        }[]
      }
      claim_admin_if_none: { Args: never; Returns: boolean }
      find_member_by_number: {
        Args: { _member_number: string }
        Returns: {
          full_name: string
          id: string
          member_number: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      notify_user: {
        Args: {
          _body: string
          _category?: string
          _link?: string
          _title: string
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "member" | "teller" | "credit_officer" | "auditor" | "admin"
      guarantor_status: "pending" | "accepted" | "declined"
      kyc_doc_type:
        | "national_id_front"
        | "national_id_back"
        | "passport"
        | "selfie"
        | "signature"
        | "proof_of_address"
      kyc_status: "pending" | "submitted" | "verified" | "rejected"
      loan_status: "pending" | "approved" | "rejected" | "active" | "closed"
      loan_type: "personal" | "business"
      membership_tier: "individual" | "corporate" | "youth"
      payment_method: "mpesa" | "bank_transfer" | "card" | "cash" | "internal"
      transaction_status: "pending" | "completed" | "failed" | "reversed"
      transaction_type:
        | "deposit"
        | "withdrawal"
        | "transfer_in"
        | "transfer_out"
        | "interest"
        | "fee"
      wallet_type: "savings" | "shares" | "benevolent"
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
      app_role: ["member", "teller", "credit_officer", "auditor", "admin"],
      guarantor_status: ["pending", "accepted", "declined"],
      kyc_doc_type: [
        "national_id_front",
        "national_id_back",
        "passport",
        "selfie",
        "signature",
        "proof_of_address",
      ],
      kyc_status: ["pending", "submitted", "verified", "rejected"],
      loan_status: ["pending", "approved", "rejected", "active", "closed"],
      loan_type: ["personal", "business"],
      membership_tier: ["individual", "corporate", "youth"],
      payment_method: ["mpesa", "bank_transfer", "card", "cash", "internal"],
      transaction_status: ["pending", "completed", "failed", "reversed"],
      transaction_type: [
        "deposit",
        "withdrawal",
        "transfer_in",
        "transfer_out",
        "interest",
        "fee",
      ],
      wallet_type: ["savings", "shares", "benevolent"],
    },
  },
} as const
