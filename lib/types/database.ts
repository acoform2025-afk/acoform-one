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
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_headers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          design_id: string
          id: string
          layout_option_id: string
          status: string
          tenant_id: string
          total_panel_count: number
          total_weight_kg: number
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          design_id: string
          id?: string
          layout_option_id: string
          status?: string
          tenant_id: string
          total_panel_count?: number
          total_weight_kg?: number
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          design_id?: string
          id?: string
          layout_option_id?: string
          status?: string
          tenant_id?: string
          total_panel_count?: number
          total_weight_kg?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_headers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_headers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_headers_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_headers_layout_option_id_fkey"
            columns: ["layout_option_id"]
            isOneToOne: false
            referencedRelation: "layout_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_headers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_items: {
        Row: {
          bom_header_id: string
          created_at: string
          custom_width_mm: number | null
          id: string
          panel_code: string
          panel_master_id: string | null
          quantity: number
          tenant_id: string
          total_weight_kg: number | null
          unit_weight_kg: number
        }
        Insert: {
          bom_header_id: string
          created_at?: string
          custom_width_mm?: number | null
          id?: string
          panel_code: string
          panel_master_id?: string | null
          quantity: number
          tenant_id: string
          total_weight_kg?: number | null
          unit_weight_kg: number
        }
        Update: {
          bom_header_id?: string
          created_at?: string
          custom_width_mm?: number | null
          id?: string
          panel_code?: string
          panel_master_id?: string | null
          quantity?: number
          tenant_id?: string
          total_weight_kg?: number | null
          unit_weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_items_bom_header_id_fkey"
            columns: ["bom_header_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_panel_master_id_fkey"
            columns: ["panel_master_id"]
            isOneToOne: false
            referencedRelation: "panel_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      capa: {
        Row: {
          completed_at: string | null
          corrective_action: string | null
          created_at: string
          due_date: string | null
          id: string
          ncr_id: string
          owner_id: string | null
          preventive_action: string | null
          root_cause: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          corrective_action?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          ncr_id: string
          owner_id?: string | null
          preventive_action?: string | null
          root_cause?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          corrective_action?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          ncr_id?: string
          owner_id?: string | null
          preventive_action?: string | null
          root_cause?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capa_ncr_id_fkey"
            columns: ["ncr_id"]
            isOneToOne: false
            referencedRelation: "ncr"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capa_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_rate_cards: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          rate_name: string
          rate_per_kg: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          rate_name: string
          rate_per_kg: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          rate_name?: string
          rate_per_kg?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_rate_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_rate_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cutting_list_bars: {
        Row: {
          bar_number: number
          cuts: Json
          cutting_list_id: string
          id: string
          offcut_mm: number
          tenant_id: string
        }
        Insert: {
          bar_number: number
          cuts: Json
          cutting_list_id: string
          id?: string
          offcut_mm: number
          tenant_id: string
        }
        Update: {
          bar_number?: number
          cuts?: Json
          cutting_list_id?: string
          id?: string
          offcut_mm?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutting_list_bars_cutting_list_id_fkey"
            columns: ["cutting_list_id"]
            isOneToOne: false
            referencedRelation: "cutting_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutting_list_bars_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cutting_lists: {
        Row: {
          generated_at: string
          id: string
          production_order_id: string
          stock_bar_length_mm: number
          tenant_id: string
          total_bars_required: number
          total_offcut_mm: number
          waste_percentage: number
        }
        Insert: {
          generated_at?: string
          id?: string
          production_order_id: string
          stock_bar_length_mm?: number
          tenant_id: string
          total_bars_required: number
          total_offcut_mm: number
          waste_percentage: number
        }
        Update: {
          generated_at?: string
          id?: string
          production_order_id?: string
          stock_bar_length_mm?: number
          tenant_id?: string
          total_bars_required?: number
          total_offcut_mm?: number
          waste_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "cutting_lists_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutting_lists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      design_walls: {
        Row: {
          created_at: string
          design_id: string
          end_corner: string
          height_mm: number
          id: string
          length_mm: number
          openings: Json
          sequence_order: number
          start_corner: string
          tenant_id: string
          thickness_mm: number
          wall_code: string
        }
        Insert: {
          created_at?: string
          design_id: string
          end_corner?: string
          height_mm: number
          id?: string
          length_mm: number
          openings?: Json
          sequence_order?: number
          start_corner?: string
          tenant_id: string
          thickness_mm: number
          wall_code: string
        }
        Update: {
          created_at?: string
          design_id?: string
          end_corner?: string
          height_mm?: number
          id?: string
          length_mm?: number
          openings?: Json
          sequence_order?: number
          start_corner?: string
          tenant_id?: string
          thickness_mm?: number
          wall_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_walls_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_walls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      designs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          design_code: string
          id: string
          project_id: string
          selected_layout_option_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          design_code: string
          id?: string
          project_id: string
          selected_layout_option_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          design_code?: string
          id?: string
          project_id?: string
          selected_layout_option_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "designs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_selected_layout_option_id_fkey"
            columns: ["selected_layout_option_id"]
            isOneToOne: false
            referencedRelation: "layout_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_notes: {
        Row: {
          created_at: string
          created_by: string | null
          dc_number: string
          delivered_at: string | null
          dispatch_date: string
          driver_name: string | null
          driver_phone: string | null
          id: string
          notes: string | null
          project_id: string
          tenant_id: string
          transporter: string | null
          vehicle_no: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dc_number: string
          delivered_at?: string | null
          dispatch_date?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          notes?: string | null
          project_id: string
          tenant_id: string
          transporter?: string | null
          vehicle_no?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dc_number?: string
          delivered_at?: string | null
          dispatch_date?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          tenant_id?: string
          transporter?: string | null
          vehicle_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      engineering_calculations: {
        Row: {
          calculated_at: string
          concrete_pressure_kpa: number
          deflection_limit_ratio: number
          deflection_pass: boolean
          deflection_ratio: number | null
          design_wall_id: string
          id: string
          layout_option_id: string
          notes: string | null
          overall_pass: boolean
          safety_factor: number
          safety_factor_pass: boolean
          tenant_id: string
          tie_capacity_kn: number
          tie_load_kn: number
          tie_load_pass: boolean
          tie_spacing_mm: number
          uses_placeholder_constants: boolean
        }
        Insert: {
          calculated_at?: string
          concrete_pressure_kpa: number
          deflection_limit_ratio?: number
          deflection_pass: boolean
          deflection_ratio?: number | null
          design_wall_id: string
          id?: string
          layout_option_id: string
          notes?: string | null
          overall_pass: boolean
          safety_factor: number
          safety_factor_pass: boolean
          tenant_id: string
          tie_capacity_kn: number
          tie_load_kn: number
          tie_load_pass: boolean
          tie_spacing_mm: number
          uses_placeholder_constants?: boolean
        }
        Update: {
          calculated_at?: string
          concrete_pressure_kpa?: number
          deflection_limit_ratio?: number
          deflection_pass?: boolean
          deflection_ratio?: number | null
          design_wall_id?: string
          id?: string
          layout_option_id?: string
          notes?: string | null
          overall_pass?: boolean
          safety_factor?: number
          safety_factor_pass?: boolean
          tenant_id?: string
          tie_capacity_kn?: number
          tie_load_kn?: number
          tie_load_pass?: boolean
          tie_spacing_mm?: number
          uses_placeholder_constants?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "engineering_calculations_design_wall_id_fkey"
            columns: ["design_wall_id"]
            isOneToOne: false
            referencedRelation: "design_walls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineering_calculations_layout_option_id_fkey"
            columns: ["layout_option_id"]
            isOneToOne: false
            referencedRelation: "layout_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineering_calculations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      engineering_parameters: {
        Row: {
          certification_note: string | null
          certified_by: string | null
          concrete_density_kn_m3: number
          deflection_limit_wall: number
          is_certified: boolean
          min_safety_factor: number
          panel_e_mpa: number
          panel_i_mm4_per_mm: number
          tenant_id: string
          tie_capacity_kn: number
          tie_spacing_h_mm: number
          tie_spacing_v_mm: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          certification_note?: string | null
          certified_by?: string | null
          concrete_density_kn_m3?: number
          deflection_limit_wall?: number
          is_certified?: boolean
          min_safety_factor?: number
          panel_e_mpa?: number
          panel_i_mm4_per_mm?: number
          tenant_id: string
          tie_capacity_kn?: number
          tie_spacing_h_mm?: number
          tie_spacing_v_mm?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          certification_note?: string | null
          certified_by?: string | null
          concrete_density_kn_m3?: number
          deflection_limit_wall?: number
          is_certified?: boolean
          min_safety_factor?: number
          panel_e_mpa?: number
          panel_i_mm4_per_mm?: number
          tenant_id?: string
          tie_capacity_kn?: number
          tie_spacing_h_mm?: number
          tie_spacing_v_mm?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engineering_parameters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_plans: {
        Row: {
          created_at: string
          drawing_type: string
          created_by: string | null
          file_name: string | null
          file_path: string
          id: string
          lead_id: string | null
          name: string
          original_path: string | null
          preview_path: string | null
          source_kind: string
          takeoff: Json
          tenant_id: string
          totals: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          drawing_type?: string
          created_by?: string | null
          file_name?: string | null
          file_path: string
          id?: string
          lead_id?: string | null
          name: string
          original_path?: string | null
          preview_path?: string | null
          source_kind: string
          takeoff?: Json
          tenant_id?: string
          totals?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          drawing_type?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string
          id?: string
          lead_id?: string | null
          name?: string
          original_path?: string | null
          preview_path?: string | null
          source_kind?: string
          takeoff?: Json
          tenant_id?: string
          totals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_plans_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_ledger: {
        Row: {
          actor_user_id: string | null
          created_at: string
          dispatch_note_id: string | null
          event_type: string
          from_location: string | null
          id: string
          notes: string | null
          panel_id: string
          project_id: string | null
          quantity: number
          tenant_id: string
          to_location: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          dispatch_note_id?: string | null
          event_type: string
          from_location?: string | null
          id?: string
          notes?: string | null
          panel_id: string
          project_id?: string | null
          quantity?: number
          tenant_id: string
          to_location?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          dispatch_note_id?: string | null
          event_type?: string
          from_location?: string | null
          id?: string
          notes?: string | null
          panel_id?: string
          project_id?: string | null
          quantity?: number
          tenant_id?: string
          to_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_ledger_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_dispatch_note_id_fkey"
            columns: ["dispatch_note_id"]
            isOneToOne: false
            referencedRelation: "dispatch_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      layout_options: {
        Row: {
          composite_score: number
          cost_score: number
          created_at: string
          custom_filler_count: number
          design_id: string
          distinct_panel_type_count: number
          filler_ratio: number
          id: string
          inventory_complexity_score: number
          is_selected: boolean
          option_number: number
          rank: number
          reasoning: string
          reuse_score: number
          standardization_rate: number
          strategy_label: string
          tenant_id: string
          total_area_sqm: number
          total_estimated_cost: number
          total_weight_kg: number
        }
        Insert: {
          composite_score: number
          cost_score: number
          created_at?: string
          custom_filler_count: number
          design_id: string
          distinct_panel_type_count: number
          filler_ratio: number
          id?: string
          inventory_complexity_score: number
          is_selected?: boolean
          option_number: number
          rank: number
          reasoning: string
          reuse_score: number
          standardization_rate: number
          strategy_label: string
          tenant_id: string
          total_area_sqm: number
          total_estimated_cost: number
          total_weight_kg: number
        }
        Update: {
          composite_score?: number
          cost_score?: number
          created_at?: string
          custom_filler_count?: number
          design_id?: string
          distinct_panel_type_count?: number
          filler_ratio?: number
          id?: string
          inventory_complexity_score?: number
          is_selected?: boolean
          option_number?: number
          rank?: number
          reasoning?: string
          reuse_score?: number
          standardization_rate?: number
          strategy_label?: string
          tenant_id?: string
          total_area_sqm?: number
          total_estimated_cost?: number
          total_weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "layout_options_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_options_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      layout_panels: {
        Row: {
          created_at: string
          custom_width_mm: number | null
          design_wall_id: string
          id: string
          layout_option_id: string
          panel_master_id: string | null
          panel_role: string
          position_mm: number
          quantity: number
          sequence_in_wall: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          custom_width_mm?: number | null
          design_wall_id: string
          id?: string
          layout_option_id: string
          panel_master_id?: string | null
          panel_role: string
          position_mm: number
          quantity?: number
          sequence_in_wall: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          custom_width_mm?: number | null
          design_wall_id?: string
          id?: string
          layout_option_id?: string
          panel_master_id?: string | null
          panel_role?: string
          position_mm?: number
          quantity?: number
          sequence_in_wall?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "layout_panels_design_wall_id_fkey"
            columns: ["design_wall_id"]
            isOneToOne: false
            referencedRelation: "design_walls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_panels_layout_option_id_fkey"
            columns: ["layout_option_id"]
            isOneToOne: false
            referencedRelation: "layout_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_panels_panel_master_id_fkey"
            columns: ["panel_master_id"]
            isOneToOne: false
            referencedRelation: "panel_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_panels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company_name: string | null
          contact_email: string | null
          contact_person_name: string | null
          contact_phone: string | null
          created_at: string
          customer_name: string
          estimated_area_sqm: number | null
          expected_start_date: string | null
          formwork_type: string | null
          gst_number: string | null
          id: string
          lead_code: string
          notes: string | null
          num_floors: number | null
          num_repetitive_units: number | null
          owner_user_id: string | null
          project_location: string | null
          project_name: string | null
          project_type: string | null
          source_channel: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          contact_email?: string | null
          contact_person_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_name: string
          estimated_area_sqm?: number | null
          expected_start_date?: string | null
          formwork_type?: string | null
          gst_number?: string | null
          id?: string
          lead_code?: string
          notes?: string | null
          num_floors?: number | null
          num_repetitive_units?: number | null
          owner_user_id?: string | null
          project_location?: string | null
          project_name?: string | null
          project_type?: string | null
          source_channel?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          contact_email?: string | null
          contact_person_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_name?: string
          estimated_area_sqm?: number | null
          expected_start_date?: string | null
          formwork_type?: string | null
          gst_number?: string | null
          id?: string
          lead_code?: string
          notes?: string | null
          num_floors?: number | null
          num_repetitive_units?: number | null
          owner_user_id?: string | null
          project_location?: string | null
          project_name?: string | null
          project_type?: string | null
          source_channel?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ncr: {
        Row: {
          created_at: string
          description: string
          id: string
          ncr_code: string
          panel_id: string | null
          qc_inspection_id: string | null
          raised_by: string | null
          severity: string
          status: string
          tenant_id: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          ncr_code: string
          panel_id?: string | null
          qc_inspection_id?: string | null
          raised_by?: string | null
          severity?: string
          status?: string
          tenant_id: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          ncr_code?: string
          panel_id?: string | null
          qc_inspection_id?: string | null
          raised_by?: string | null
          severity?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ncr_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ncr_qc_inspection_id_fkey"
            columns: ["qc_inspection_id"]
            isOneToOne: false
            referencedRelation: "qc_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ncr_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ncr_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ncr_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      panel_master: {
        Row: {
          area_sqm: number | null
          created_at: string
          face_sheet_thickness_mm: number
          finish: string
          frame_depth_mm: number
          height_mm: number
          id: string
          is_active: boolean
          is_standard: boolean
          panel_category: string
          panel_code: string
          tenant_id: string
          tie_rod_diameter_mm: number
          updated_at: string
          weight_kg: number
          width_mm: number
        }
        Insert: {
          area_sqm?: number | null
          created_at?: string
          face_sheet_thickness_mm?: number
          finish?: string
          frame_depth_mm?: number
          height_mm: number
          id?: string
          is_active?: boolean
          is_standard?: boolean
          panel_category: string
          panel_code: string
          tenant_id: string
          tie_rod_diameter_mm?: number
          updated_at?: string
          weight_kg: number
          width_mm: number
        }
        Update: {
          area_sqm?: number | null
          created_at?: string
          face_sheet_thickness_mm?: number
          finish?: string
          frame_depth_mm?: number
          height_mm?: number
          id?: string
          is_active?: boolean
          is_standard?: boolean
          panel_category?: string
          panel_code?: string
          tenant_id?: string
          tie_rod_diameter_mm?: number
          updated_at?: string
          weight_kg?: number
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "panel_master_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      panels: {
        Row: {
          created_at: string
          current_location: string
          cycle_count: number
          id: string
          panel_code: string
          panel_master_id: string | null
          qr_code: string
          status: string
          tenant_id: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          current_location?: string
          cycle_count?: number
          id?: string
          panel_code: string
          panel_master_id?: string | null
          qr_code: string
          status?: string
          tenant_id: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          current_location?: string
          cycle_count?: number
          id?: string
          panel_code?: string
          panel_master_id?: string | null
          qr_code?: string
          status?: string
          tenant_id?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "panels_panel_master_id_fkey"
            columns: ["panel_master_id"]
            isOneToOne: false
            referencedRelation: "panel_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panels_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          description: string | null
          id: string
          resource: string
        }
        Insert: {
          action: string
          description?: string | null
          id?: string
          resource: string
        }
        Update: {
          action?: string
          description?: string | null
          id?: string
          resource?: string
        }
        Relationships: []
      }
      production_orders: {
        Row: {
          bom_header_id: string
          created_at: string
          created_by: string | null
          id: string
          order_code: string
          project_id: string
          status: string
          target_completion: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bom_header_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          order_code: string
          project_id: string
          status?: string
          target_completion?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bom_header_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          order_code?: string
          project_id?: string
          status?: string
          target_completion?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_bom_header_id_fkey"
            columns: ["bom_header_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          customer_name: string
          id: string
          project_code: string
          project_manager_id: string | null
          quotation_id: string | null
          site_address: string | null
          start_date: string | null
          status: string
          target_completion: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          id?: string
          project_code: string
          project_manager_id?: string | null
          quotation_id?: string | null
          site_address?: string | null
          start_date?: string | null
          status?: string
          target_completion?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          id?: string
          project_code?: string
          project_manager_id?: string | null
          quotation_id?: string | null
          site_address?: string | null
          start_date?: string | null
          status?: string
          target_completion?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_project_manager_id_fkey"
            columns: ["project_manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_inspections: {
        Row: {
          checklist: Json
          created_at: string
          id: string
          inspection_type: string
          inspector_id: string | null
          notes: string | null
          overall_pass: boolean
          quantity_inspected: number
          quantity_passed: number
          signed_off_at: string | null
          signed_off_by: string | null
          tenant_id: string
          work_order_id: string | null
        }
        Insert: {
          checklist?: Json
          created_at?: string
          id?: string
          inspection_type: string
          inspector_id?: string | null
          notes?: string | null
          overall_pass: boolean
          quantity_inspected?: number
          quantity_passed?: number
          signed_off_at?: string | null
          signed_off_by?: string | null
          tenant_id: string
          work_order_id?: string | null
        }
        Update: {
          checklist?: Json
          created_at?: string
          id?: string
          inspection_type?: string
          inspector_id?: string | null
          notes?: string | null
          overall_pass?: boolean
          quantity_inspected?: number
          quantity_passed?: number
          signed_off_at?: string | null
          signed_off_by?: string | null
          tenant_id?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_signed_off_by_fkey"
            columns: ["signed_off_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_quote_rates: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          formwork_type: string
          id: string
          is_active: boolean
          rate_per_sqm: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          formwork_type: string
          id?: string
          is_active?: boolean
          rate_per_sqm: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          formwork_type?: string
          id?: string
          is_active?: boolean
          rate_per_sqm?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_quote_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_quote_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_lines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          line_total: number | null
          line_type: string
          notes: string | null
          panel_master_id: string | null
          quantity: number
          quotation_id: string
          rate_per_kg: number | null
          sort_order: number
          tenant_id: string
          unit: string | null
          unit_rate: number | null
          unit_weight_kg: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          line_total?: number | null
          line_type?: string
          notes?: string | null
          panel_master_id?: string | null
          quantity: number
          quotation_id: string
          rate_per_kg?: number | null
          sort_order?: number
          tenant_id: string
          unit?: string | null
          unit_rate?: number | null
          unit_weight_kg?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          line_total?: number | null
          line_type?: string
          notes?: string | null
          panel_master_id?: string | null
          quantity?: number
          quotation_id?: string
          rate_per_kg?: number | null
          sort_order?: number
          tenant_id?: string
          unit?: string | null
          unit_rate?: number | null
          unit_weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_lines_panel_master_id_fkey"
            columns: ["panel_master_id"]
            isOneToOne: false
            referencedRelation: "panel_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_lines_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_media: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          sort_order: number
          storage_path: string
          tenant_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          sort_order?: number
          storage_path: string
          tenant_id?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          sort_order?: number
          storage_path?: string
          tenant_id?: string
        }
        Relationships: []
      }
      quotations: {
        Row: {
          accessories: Json | null
          show_references: boolean
          floor_plan_id: string | null
          approved_at: string | null
          approved_by: string | null
          area_basis: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_address: string | null
          customer_email: string | null
          customer_gstin: string | null
          customer_name: string
          customer_phone: string | null
          formwork_type: string | null
          gst_percentage: number
          id: string
          kind_attn: string | null
          lead_id: string | null
          nalco_rate_date: string | null
          nalco_rate_per_kg: number | null
          payment_terms: string[] | null
          project_name: string | null
          quick_rate_per_sqm: number | null
          quotation_code: string
          quotation_date: string
          quotation_type: string
          revision_no: number
          revision_of: string | null
          schedule_description: string | null
          status: string
          tenant_id: string
          total_amount: number | null
          total_area_sqm: number | null
          total_with_gst: number | null
          updated_at: string
          valid_until: string | null
          validity_days: number
        }
        Insert: {
          accessories?: Json | null
          show_references?: boolean
          floor_plan_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          area_basis?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_gstin?: string | null
          customer_name: string
          customer_phone?: string | null
          formwork_type?: string | null
          gst_percentage?: number
          id?: string
          kind_attn?: string | null
          lead_id?: string | null
          nalco_rate_date?: string | null
          nalco_rate_per_kg?: number | null
          payment_terms?: string[] | null
          project_name?: string | null
          quick_rate_per_sqm?: number | null
          quotation_code: string
          quotation_date?: string
          quotation_type?: string
          revision_no?: number
          revision_of?: string | null
          schedule_description?: string | null
          status?: string
          tenant_id: string
          total_amount?: number | null
          total_area_sqm?: number | null
          total_with_gst?: number | null
          updated_at?: string
          valid_until?: string | null
          validity_days?: number
        }
        Update: {
          accessories?: Json | null
          show_references?: boolean
          floor_plan_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          area_basis?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_gstin?: string | null
          customer_name?: string
          customer_phone?: string | null
          formwork_type?: string | null
          gst_percentage?: number
          id?: string
          kind_attn?: string | null
          lead_id?: string | null
          nalco_rate_date?: string | null
          nalco_rate_per_kg?: number | null
          payment_terms?: string[] | null
          project_name?: string | null
          quick_rate_per_sqm?: number | null
          quotation_code?: string
          quotation_date?: string
          quotation_type?: string
          revision_no?: number
          revision_of?: string | null
          schedule_description?: string | null
          status?: string
          tenant_id?: string
          total_amount?: number | null
          total_area_sqm?: number | null
          total_with_gst?: number | null
          updated_at?: string
          valid_until?: string | null
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_revision_of_fkey"
            columns: ["revision_of"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_system_role: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: Json | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc_code: string | null
          bank_name: string | null
          company_address: string | null
          company_code: string
          company_name: string
          company_phone: string | null
          company_website: string | null
          created_at: string
          gst_number: string | null
          id: string
          is_active: boolean
          subscription_tier: string
          updated_at: string
        }
        Insert: {
          address?: Json | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc_code?: string | null
          bank_name?: string | null
          company_address?: string | null
          company_code: string
          company_name: string
          company_phone?: string | null
          company_website?: string | null
          created_at?: string
          gst_number?: string | null
          id?: string
          is_active?: boolean
          subscription_tier?: string
          updated_at?: string
        }
        Update: {
          address?: Json | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc_code?: string | null
          bank_name?: string | null
          company_address?: string | null
          company_code?: string
          company_name?: string
          company_phone?: string | null
          company_website?: string | null
          created_at?: string
          gst_number?: string | null
          id?: string
          is_active?: boolean
          subscription_tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          employee_code: string | null
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          employee_code?: string | null
          full_name: string
          id: string
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          employee_code?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          bom_item_id: string
          created_at: string
          id: string
          production_order_id: string
          quantity: number
          status: string
          tenant_id: string
          updated_at: string
          work_order_code: string
        }
        Insert: {
          bom_item_id: string
          created_at?: string
          id?: string
          production_order_id: string
          quantity: number
          status?: string
          tenant_id: string
          updated_at?: string
          work_order_code: string
        }
        Update: {
          bom_item_id?: string
          created_at?: string
          id?: string
          production_order_id?: string
          quantity?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          work_order_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_bom_item_id_fkey"
            columns: ["bom_item_id"]
            isOneToOne: false
            referencedRelation: "bom_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_quotation_extra_line: {
        Args: {
          p_description: string
          p_line_type: string
          p_notes?: string
          p_quantity: number
          p_quotation_id: string
          p_unit: string
          p_unit_rate: number
        }
        Returns: string
      }
      add_quotation_line: {
        Args: {
          p_notes?: string
          p_panel_code: string
          p_quantity: number
          p_quotation_id: string
        }
        Returns: string
      }
      assert_design_editable: { Args: { p_design_id: string }; Returns: string }
      assert_quotation_editable: {
        Args: { p_quotation_id: string }
        Returns: string
      }
      close_panel_repair: {
        Args: { p_notes?: string; p_panel_id: string; p_scrap?: boolean }
        Returns: undefined
      }
      confirm_delivery: {
        Args: { p_dispatch_note_id: string }
        Returns: number
      }
      create_dispatch: {
        Args: {
          p_driver_name?: string
          p_driver_phone?: string
          p_notes?: string
          p_panel_ids: string[]
          p_project_id: string
          p_transporter?: string
          p_vehicle_no?: string
        }
        Returns: string
      }
      create_production_order: {
        Args: {
          p_bom_header_id: string
          p_order_code: string
          p_target_completion?: string
        }
        Returns: string
      }
      create_quick_quote: {
        Args: {
          p_area_sqm: number
          p_customer_name: string
          p_formwork_type: string
          p_gst_percentage?: number
          p_lead_id?: string
          p_nalco_rate_per_kg?: number
          p_quotation_code: string
          p_valid_until?: string
        }
        Returns: string
      }
      create_quotation_revision: {
        Args: {
          p_area_sqm?: number
          p_quotation_id: string
          p_reprice?: boolean
        }
        Returns: string
      }
      current_tenant_id: { Args: never; Returns: string }
      current_user_role_codes: { Args: never; Returns: string[] }
      dispatch_panel: {
        Args: { p_notes?: string; p_panel_id: string; p_project_id: string }
        Returns: undefined
      }
      fail_work_order_qc: {
        Args: {
          p_checklist: Json
          p_description: string
          p_severity?: string
          p_work_order_id: string
        }
        Returns: string
      }
      create_bom_from_floor_plan: {
        Args: { p_design_id: string; p_floor_plan_id: string; p_items: Json; p_summary: Json }
        Returns: string
      }
      generate_bom_from_design: {
        Args: { p_design_id: string }
        Returns: string
      }
      get_dashboard_kpis: { Args: never; Returns: Json }
      grant_role_permission: {
        Args: {
          p_action: string
          p_resource: string
          p_role_code: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      has_permission: {
        Args: { p_action: string; p_resource: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      next_dc_number: { Args: never; Returns: string }
      next_design_code: { Args: { p_project_id: string }; Returns: string }
      next_quotation_code: { Args: never; Returns: string }
      pass_work_order_qc: {
        Args: { p_checklist: Json; p_notes?: string; p_work_order_id: string }
        Returns: string
      }
      provision_cost_rate_card_permissions: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      provision_default_panel_catalog: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      provision_default_role_permissions: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      provision_default_roles: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      provision_manufacturing_permissions: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      provision_new_tenant: {
        Args: {
          p_auth_user_id: string
          p_company_code: string
          p_company_name: string
          p_email: string
          p_full_name: string
        }
        Returns: string
      }
      provision_panel_catalog_permissions: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      provision_starter_quick_quote_rates: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      provision_starter_rate_card: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      return_panel: {
        Args: { p_condition?: string; p_notes?: string; p_panel_id: string }
        Returns: undefined
      }
      return_panels: {
        Args: { p_condition?: string; p_notes?: string; p_panel_ids: string[] }
        Returns: number
      }
      run_engineering_check: { Args: { p_design_id: string }; Returns: number }
      save_design_layouts: {
        Args: { p_design_id: string; p_options: Json }
        Returns: number
      }
      select_layout_option: {
        Args: { p_design_id: string; p_option_id: string }
        Returns: undefined
      }
      update_quick_quote_area: {
        Args: { p_area_sqm: number; p_quotation_id: string }
        Returns: undefined
      }
      set_quotation_floor_plan: {
        Args: { p_quotation_id: string; p_floor_plan_id: string | null }
        Returns: undefined
      }
      set_quotation_show_references: {
        Args: { p_quotation_id: string; p_show: boolean }
        Returns: undefined
      }
      set_quotation_accessories: {
        Args: { p_items: Json | null; p_quotation_id: string }
        Returns: undefined
      }
      update_quick_quote_rate: {
        Args: { p_quotation_id: string; p_rate_per_sqm: number }
        Returns: undefined
      }
      update_quotation_line: {
        Args: {
          p_description?: string
          p_line_id: string
          p_notes?: string
          p_quantity?: number
          p_rate_per_kg?: number
          p_unit?: string
          p_unit_rate?: number
        }
        Returns: undefined
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
