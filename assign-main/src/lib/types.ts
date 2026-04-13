// ── B2C Adaptive Learning Types ───────────────────────────────────────────────

export type Phase =
  | 'discovery'
  | 'curriculum_build'
  | 'teaching'
  | 'awaiting_explanation'
  | 'validating'
  | 'notes_generation'
  | 'complete'

export type FlagType = 'struggling' | 'misconception' | 'strong' | null

export interface KCNode {
  id: string
  title: string
  status: 'not_started' | 'in_progress' | 'mastered' | 'flagged' | 'force_advanced'
  p_learned: number
  order_index: number
  flag_type?: FlagType
}

export interface ValidationResult {
  type: 'validation_result'
  passed: boolean
  score: number
  feedback: string
  what_was_right: string
  what_was_wrong: string
  flag_type: FlagType
  attempt_number: number
  next_phase: Phase
}

export interface SSEMessage {
  type: 'message' | 'validation_result' | 'curriculum_ready' | 'kc_graph' | 'done' | 'error' | 'token'
  content?: string
  phase?: Phase
  topic_id?: string
  topic_title?: string
  kc_graph?: KCNode[]
  passed?: boolean
  score?: number
  feedback?: string
  what_was_right?: string
  what_was_wrong?: string
  flag_type?: FlagType
  attempt_number?: number
  next_phase?: Phase
  message?: string
}

export interface KCNote {
  id: string
  kc_id: string
  topic_id: string
  concept_name: string
  summary: string
  key_points: string[]
  student_analogy: string
  watch_out: string
  full_text: string
  created_at: string
}

export interface KCProgress {
  id: string
  kc_id: string
  topic_id: string
  p_learned: number
  status: string
  attempt_count: number
  flag_type: FlagType
  flag_reason: string | null
  updated_at: string
}

export interface Topic {
  id: string
  title: string
  status: 'active' | 'completed' | 'paused'
  created_at: string
}

export interface SessionState {
  phase: Phase
  topic_id: string
  topic_title: string
  current_kc_index: number
  total_kcs: number
  kc_graph: KCNode[]
  notes_generated: string[]
  flags_this_session: Array<{
    kc_id: string
    flag_type: FlagType
    flag_reason: string
  }>
}

export interface B2CStartResponse {
  session_id: string
  reply: string
  phase: Phase
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  type?: 'teaching' | 'validation' | 'system'
  validationResult?: ValidationResult
}
