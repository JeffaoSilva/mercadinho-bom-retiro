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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          mercadinho_id: number
          nome: string
          telefone: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: number
          mercadinho_id: number
          nome: string
          telefone: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: number
          mercadinho_id?: number
          nome?: string
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_mercadinho_id_fkey"
            columns: ["mercadinho_id"]
            isOneToOne: false
            referencedRelation: "mercadinhos"
            referencedColumns: ["id"]
          },
        ]
      }
      codigos_tres: {
        Row: {
          codigo: string
          criado_em: string
          id: number
          usado: boolean
          usado_em: string | null
        }
        Insert: {
          codigo: string
          criado_em?: string
          id?: number
          usado?: boolean
          usado_em?: string | null
        }
        Update: {
          codigo?: string
          criado_em?: string
          id?: number
          usado?: boolean
          usado_em?: string | null
        }
        Relationships: []
      }
      compras: {
        Row: {
          cliente_id: number | null
          criado_em: string
          data_compra: string
          eh_visitante: boolean
          forma_pagamento: string
          id: number
          mercadinho_id: number
          mes_referencia: string
          paga: boolean
          paga_em: string | null
          tablet_id: number | null
          tipo_pagamento: string
          valor_total: number
        }
        Insert: {
          cliente_id?: number | null
          criado_em?: string
          data_compra?: string
          eh_visitante?: boolean
          forma_pagamento: string
          id?: number
          mercadinho_id: number
          mes_referencia?: string
          paga?: boolean
          paga_em?: string | null
          tablet_id?: number | null
          tipo_pagamento?: string
          valor_total?: number
        }
        Update: {
          cliente_id?: number | null
          criado_em?: string
          data_compra?: string
          eh_visitante?: boolean
          forma_pagamento?: string
          id?: number
          mercadinho_id?: number
          mes_referencia?: string
          paga?: boolean
          paga_em?: string | null
          tablet_id?: number | null
          tipo_pagamento?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_kiosk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_mercadinho_id_fkey"
            columns: ["mercadinho_id"]
            isOneToOne: false
            referencedRelation: "mercadinhos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_tablet_id_fkey"
            columns: ["tablet_id"]
            isOneToOne: false
            referencedRelation: "tablets"
            referencedColumns: ["id"]
          },
        ]
      }
      config_cobranca: {
        Row: {
          atualizado_em: string
          corte_atual: string
          id: number
        }
        Insert: {
          atualizado_em?: string
          corte_atual: string
          id?: number
        }
        Update: {
          atualizado_em?: string
          corte_atual?: string
          id?: number
        }
        Relationships: []
      }
      config_inatividade: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          tablet_id: number | null
          tempo_descanso_home_seg: number
          tempo_idle_home_seg: number
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: number
          tablet_id?: number | null
          tempo_descanso_home_seg?: number
          tempo_idle_home_seg?: number
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: number
          tablet_id?: number | null
          tempo_descanso_home_seg?: number
          tempo_idle_home_seg?: number
        }
        Relationships: [
          {
            foreignKeyName: "config_inatividade_tablet_id_fkey"
            columns: ["tablet_id"]
            isOneToOne: false
            referencedRelation: "tablets"
            referencedColumns: ["id"]
          },
        ]
      }
      config_pagamentos_mensais: {
        Row: {
          criado_em: string
          data_limite: string | null
          mes_referencia: string
        }
        Insert: {
          criado_em?: string
          data_limite?: string | null
          mes_referencia: string
        }
        Update: {
          criado_em?: string
          data_limite?: string | null
          mes_referencia?: string
        }
        Relationships: []
      }
      config_sistema: {
        Row: {
          bip_ativo: boolean
          bip_volume: number
          criado_em: string
          id: number
        }
        Insert: {
          bip_ativo?: boolean
          bip_volume?: number
          criado_em?: string
          id?: number
        }
        Update: {
          bip_ativo?: boolean
          bip_volume?: number
          criado_em?: string
          id?: number
        }
        Relationships: []
      }
      entradas_estoque: {
        Row: {
          criado_em: string
          id: number
          preco_compra_entrada: number
          preco_venda_sugerido: number
          produto_id: number
          quantidade_total: number
          rateio_bom_retiro: number
          rateio_central: number
          rateio_sao_francisco: number
        }
        Insert: {
          criado_em?: string
          id?: number
          preco_compra_entrada: number
          preco_venda_sugerido: number
          produto_id: number
          quantidade_total: number
          rateio_bom_retiro?: number
          rateio_central?: number
          rateio_sao_francisco?: number
        }
        Update: {
          criado_em?: string
          id?: number
          preco_compra_entrada?: number
          preco_venda_sugerido?: number
          produto_id?: number
          quantidade_total?: number
          rateio_bom_retiro?: number
          rateio_central?: number
          rateio_sao_francisco?: number
        }
        Relationships: [
          {
            foreignKeyName: "entradas_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_compra: {
        Row: {
          compra_id: number
          criado_em: string
          id: number
          produto_id: number
          quantidade: number
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          compra_id: number
          criado_em?: string
          id?: number
          produto_id: number
          quantidade?: number
          valor_total?: number
          valor_unitario: number
        }
        Update: {
          compra_id?: number
          criado_em?: string
          id?: number
          produto_id?: number
          quantidade?: number
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_compra_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_compra_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes_produtos: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          preco_compra_lote: number | null
          produto_id: number
          quantidade: number
          validade: string | null
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: number
          preco_compra_lote?: number | null
          produto_id: number
          quantidade: number
          validade?: string | null
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: number
          preco_compra_lote?: number | null
          produto_id?: number
          quantidade?: number
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadinhos: {
        Row: {
          criado_em: string
          id: number
          nome: string
        }
        Insert: {
          criado_em?: string
          id?: number
          nome: string
        }
        Update: {
          criado_em?: string
          id?: number
          nome?: string
        }
        Relationships: []
      }
      pins: {
        Row: {
          cliente_id: number
          criado_em: string
          id: number
          pin: string
        }
        Insert: {
          cliente_id: number
          criado_em?: string
          id?: number
          pin: string
        }
        Update: {
          cliente_id?: number
          criado_em?: string
          id?: number
          pin?: string
        }
        Relationships: [
          {
            foreignKeyName: "pins_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pins_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_kiosk"
            referencedColumns: ["id"]
          },
        ]
      }
      prateleiras_produtos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          id: number
          mercadinho_id: number
          preco_venda_prateleira: number
          produto_id: number
          quantidade_prateleira: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: number
          mercadinho_id: number
          preco_venda_prateleira: number
          produto_id: number
          quantidade_prateleira?: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: number
          mercadinho_id?: number
          preco_venda_prateleira?: number
          produto_id?: number
          quantidade_prateleira?: number
        }
        Relationships: [
          {
            foreignKeyName: "prateleiras_produtos_mercadinho_id_fkey"
            columns: ["mercadinho_id"]
            isOneToOne: false
            referencedRelation: "mercadinhos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prateleiras_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          codigo_barras: string | null
          criado_em: string
          id: number
          nome: string
          preco_compra: number
          preco_venda: number
          quantidade_atual: number
        }
        Insert: {
          ativo?: boolean
          codigo_barras?: string | null
          criado_em?: string
          id?: number
          nome: string
          preco_compra: number
          preco_venda: number
          quantidade_atual?: number
        }
        Update: {
          ativo?: boolean
          codigo_barras?: string | null
          criado_em?: string
          id?: number
          nome?: string
          preco_compra?: number
          preco_venda?: number
          quantidade_atual?: number
        }
        Relationships: []
      }
      promocoes: {
        Row: {
          ativa: boolean
          criado_em: string
          desconto_percentual: number
          id: number
          inicia_em: string
          nome: string
          produto_id: number | null
          termina_em: string | null
          tipo: string
        }
        Insert: {
          ativa?: boolean
          criado_em?: string
          desconto_percentual: number
          id?: number
          inicia_em: string
          nome: string
          produto_id?: number | null
          termina_em?: string | null
          tipo: string
        }
        Update: {
          ativa?: boolean
          criado_em?: string
          desconto_percentual?: number
          id?: number
          inicia_em?: string
          nome?: string
          produto_id?: number | null
          termina_em?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "promocoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      tablets: {
        Row: {
          ativo: boolean
          criado_em: string
          id: number
          mercadinho_id: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: number
          mercadinho_id: number
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: number
          mercadinho_id?: number
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "tablets_mercadinho_id_fkey"
            columns: ["mercadinho_id"]
            isOneToOne: false
            referencedRelation: "mercadinhos"
            referencedColumns: ["id"]
          },
        ]
      }
      tela_descanso: {
        Row: {
          ativa: boolean
          cor_fundo: string | null
          criado_em: string
          id: number
          imagem_url: string | null
          subtitulo: string | null
          tablet_id: number | null
          titulo: string | null
        }
        Insert: {
          ativa?: boolean
          cor_fundo?: string | null
          criado_em?: string
          id?: number
          imagem_url?: string | null
          subtitulo?: string | null
          tablet_id?: number | null
          titulo?: string | null
        }
        Update: {
          ativa?: boolean
          cor_fundo?: string | null
          criado_em?: string
          id?: number
          imagem_url?: string | null
          subtitulo?: string | null
          tablet_id?: number | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tela_descanso_tablet_id_fkey"
            columns: ["tablet_id"]
            isOneToOne: false
            referencedRelation: "tablets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      clientes_kiosk: {
        Row: {
          ativo: boolean | null
          id: number | null
          mercadinho_id: number | null
          nome: string | null
        }
        Insert: {
          ativo?: boolean | null
          id?: number | null
          mercadinho_id?: number | null
          nome?: string | null
        }
        Update: {
          ativo?: boolean | null
          id?: number | null
          mercadinho_id?: number | null
          nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_mercadinho_id_fkey"
            columns: ["mercadinho_id"]
            isOneToOne: false
            referencedRelation: "mercadinhos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_estornar_item: {
        Args: {
          p_devolver_estoque: boolean
          p_item_compra_id: number
          p_motivo?: string
          p_prateleira_id?: number
        }
        Returns: Json
      }
      admin_listar_clientes_debitos: { Args: never; Returns: Json }
      admin_marcar_atrasadas_pagas: {
        Args: { p_cliente_id: number }
        Returns: Json
      }
      admin_marcar_pago_mes: {
        Args: { p_cliente_id: number; p_mes_referencia: string }
        Returns: Json
      }
      cliente_historico: { Args: { p_cliente_id: number }; Returns: Json }
      criar_compra_kiosk: { Args: { payload: Json }; Returns: Json }
      get_corte_atual: { Args: never; Returns: string }
      pin_create: {
        Args: { p_cliente_id: number; p_pin: string }
        Returns: undefined
      }
      pin_has_any: { Args: { p_cliente_id: number }; Returns: boolean }
      pin_validate: {
        Args: { p_cliente_id: number; p_pin: string }
        Returns: boolean
      }
      prateleira_total_disponivel: {
        Args: { p_mercadinho_id: number; p_produto_id: number }
        Returns: number
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
    Enums: {},
  },
} as const
