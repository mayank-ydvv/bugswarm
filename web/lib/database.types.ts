
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "bugs": {
                  Row: {
                    "category": string,"created_at": string,"evidence": NonNullable<Json>,"expected": string | null,"explained": boolean,"file": string | null,"fingerprint": string,"first_seen_run": number | null,"fix_prompt": string | null,"fixed_run": number | null,"id": number,"last_seen_run": number | null,"line": number | null,"project_id": string,"repro_steps": (string)[] | null,"severity": Database["public"]['Enums']["severity"],"status": Database["public"]['Enums']["bug_status"],"summary": string | null,"technical": string | null,"tester": string,"title": string,"url": string | null,"verified_run": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"evidence"?: NonNullable<Json>,"expected"?: string | null,"explained"?: boolean,"file"?: string | null,"fingerprint": string,"first_seen_run"?: number | null,"fix_prompt"?: string | null,"fixed_run"?: number | null,"id"?: number,"last_seen_run"?: number | null,"line"?: number | null,"project_id": string,"repro_steps"?: (string)[] | null,"severity"?: Database["public"]['Enums']["severity"],"status"?: Database["public"]['Enums']["bug_status"],"summary"?: string | null,"technical"?: string | null,"tester": string,"title": string,"url"?: string | null,"verified_run"?: number | null
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"evidence"?: NonNullable<Json>,"expected"?: string | null,"explained"?: boolean,"file"?: string | null,"fingerprint"?: string,"first_seen_run"?: number | null,"fix_prompt"?: string | null,"fixed_run"?: number | null,"id"?: number,"last_seen_run"?: number | null,"line"?: number | null,"project_id"?: string,"repro_steps"?: (string)[] | null,"severity"?: Database["public"]['Enums']["severity"],"status"?: Database["public"]['Enums']["bug_status"],"summary"?: string | null,"technical"?: string | null,"tester"?: string,"title"?: string,"url"?: string | null,"verified_run"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bugs_first_seen_run_fkey"
      columns: ["first_seen_run"]
isOneToOne: false
      referencedRelation: "project_summaries"
      referencedColumns: ["last_run_id"]
    },{
      foreignKeyName: "bugs_first_seen_run_fkey"
      columns: ["first_seen_run"]
isOneToOne: false
      referencedRelation: "runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bugs_fixed_run_fkey"
      columns: ["fixed_run"]
isOneToOne: false
      referencedRelation: "project_summaries"
      referencedColumns: ["last_run_id"]
    },{
      foreignKeyName: "bugs_fixed_run_fkey"
      columns: ["fixed_run"]
isOneToOne: false
      referencedRelation: "runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bugs_last_seen_run_fkey"
      columns: ["last_seen_run"]
isOneToOne: false
      referencedRelation: "project_summaries"
      referencedColumns: ["last_run_id"]
    },{
      foreignKeyName: "bugs_last_seen_run_fkey"
      columns: ["last_seen_run"]
isOneToOne: false
      referencedRelation: "runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bugs_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "project_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bugs_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bugs_verified_run_fkey"
      columns: ["verified_run"]
isOneToOne: false
      referencedRelation: "project_summaries"
      referencedColumns: ["last_run_id"]
    },{
      foreignKeyName: "bugs_verified_run_fkey"
      columns: ["verified_run"]
isOneToOne: false
      referencedRelation: "runs"
      referencedColumns: ["id"]
    }
                  ]
                },"llm_cache": {
                  Row: {
                    "content_hash": string,"created_at": string,"result": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash": string,"created_at"?: string,"result": NonNullable<Json>
                  }
                  Update: {
                    "content_hash"?: string,"created_at"?: string,"result"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"projects": {
                  Row: {
                    "branch": string,"created_at": string,"id": string,"last_scanned_sha": string | null,"live_url": string | null,"name": string,"port": number,"repo_url": string | null,"schedule": Database["public"]['Enums']["run_schedule"],"start_cmd": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch"?: string,"created_at"?: string,"id"?: string,"last_scanned_sha"?: string | null,"live_url"?: string | null,"name": string,"port"?: number,"repo_url"?: string | null,"schedule"?: Database["public"]['Enums']["run_schedule"],"start_cmd"?: string,"workspace_id": string
                  }
                  Update: {
                    "branch"?: string,"created_at"?: string,"id"?: string,"last_scanned_sha"?: string | null,"live_url"?: string | null,"name"?: string,"port"?: number,"repo_url"?: string | null,"schedule"?: Database["public"]['Enums']["run_schedule"],"start_cmd"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspace_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"runs": {
                  Row: {
                    "ai_usage": NonNullable<Json>,"bugs_fixed": number | null,"bugs_new": number | null,"commit_sha": string | null,"created_at": string,"finished_at": string | null,"full_scan": boolean,"id": number,"project_id": string,"started_at": string | null,"status": Database["public"]['Enums']["run_status"],"testers": NonNullable<Json>,"trigger": Database["public"]['Enums']["run_trigger"]
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_usage"?: NonNullable<Json>,"bugs_fixed"?: number | null,"bugs_new"?: number | null,"commit_sha"?: string | null,"created_at"?: string,"finished_at"?: string | null,"full_scan"?: boolean,"id"?: number,"project_id": string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"testers"?: NonNullable<Json>,"trigger"?: Database["public"]['Enums']["run_trigger"]
                  }
                  Update: {
                    "ai_usage"?: NonNullable<Json>,"bugs_fixed"?: number | null,"bugs_new"?: number | null,"commit_sha"?: string | null,"created_at"?: string,"finished_at"?: string | null,"full_scan"?: boolean,"id"?: number,"project_id"?: string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["run_status"],"testers"?: NonNullable<Json>,"trigger"?: Database["public"]['Enums']["run_trigger"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "runs_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "project_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "runs_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"worker_heartbeats": {
                  Row: {
                    "active_runs": number,"concurrency": number,"id": string,"last_seen_at": string,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_runs"?: number,"concurrency": number,"id": string,"last_seen_at"?: string,"started_at"?: string
                  }
                  Update: {
                    "active_runs"?: number,"concurrency"?: number,"id"?: string,"last_seen_at"?: string,"started_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"workspace_members": {
                  Row: {
                    "role": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "role"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "role"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspace_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"gemini_secret_id": string | null,"id": string,"name": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"gemini_secret_id"?: string | null,"id"?: string,"name": string,"owner_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"gemini_secret_id"?: string | null,"id"?: string,"name"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "project_bug_counts": {
                  Row: {
                    "open_count": number | null,"project_id": string | null,"severity": Database["public"]['Enums']["severity"] | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "bugs_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "project_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bugs_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"project_summaries": {
                  Row: {
                    "branch": string | null,"created_at": string | null,"id": string | null,"last_run_at": string | null,"last_run_id": number | null,"last_run_status": Database["public"]['Enums']["run_status"] | null,"last_run_trigger": Database["public"]['Enums']["run_trigger"] | null,"live_url": string | null,"name": string | null,"open_bugs": number | null,"repo_url": string | null,"schedule": Database["public"]['Enums']["run_schedule"] | null,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspace_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"worker_status": {
                  Row: {
                    "active_runs": number | null,"last_seen_at": string | null,"online": boolean | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"workspace_summaries": {
                  Row: {
                    "created_at": string | null,"id": string | null,"last_run_at": string | null,"name": string | null,"open_bugs": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "clear_workspace_gemini_key":
{ Args: { "ws": string }; Returns: undefined
                           },
"enqueue_scheduled":
{ Args: { "freq": Database["public"]['Enums']["run_schedule"] }; Returns: number
                           },
"set_workspace_gemini_key":
{ Args: { "api_key": string,"ws": string }; Returns: undefined
                           },
"start_run":
{ Args: { "full"?: boolean,"p": string,"trig"?: Database["public"]['Enums']["run_trigger"] }; Returns: number
                           }
          }
          Enums: {
            "bug_status": "open"|"in_progress"|"fixed"|"verified"|"ignored","run_schedule": "off"|"hourly"|"nightly","run_status": "queued"|"running"|"done"|"failed","run_trigger": "manual"|"push"|"schedule","severity": "critical"|"high"|"medium"|"low"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "bug_status": ["open", "in_progress", "fixed", "verified", "ignored"],"run_schedule": ["off", "hourly", "nightly"],"run_status": ["queued", "running", "done", "failed"],"run_trigger": ["manual", "push", "schedule"],"severity": ["critical", "high", "medium", "low"]
          }
        }
} as const
