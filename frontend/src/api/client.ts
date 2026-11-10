export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    // FormData bodies set their own multipart Content-Type.
    headers:
      typeof init?.body === 'string'
        ? { 'Content-Type': 'application/json', ...init.headers }
        : init?.headers,
  }).catch(() => {
    // fetch only rejects when the server can't be reached at all.
    throw new ApiError(0, "Can't reach the Goldsmith server. Is `make dev` running?")
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : `Request failed (${res.status})`
    throw new ApiError(res.status, detail)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export type TaskType = 'classification' | 'qa' | 'chat'

export interface User {
  id: string
  email: string
  name: string
}

export interface Project {
  id: string
  name: string
  task_type: TaskType
  status: string
  review_threshold: number
  created_at: string
  updated_at: string
}

export interface FieldMapping {
  input: string[]
  reference_output: string | null
  metadata: string[]
}

export interface Upload {
  id: string
  filename: string
  format: string
  row_count: number
  columns: string[]
  preview: Record<string, unknown>[]
  proposed_mapping: FieldMapping
}

export interface Job {
  id: string
  kind: string
  status: 'queued' | 'running' | 'done' | 'failed'
  progress: number
  error: string | null
}

export interface Row {
  id: string
  row_index: number
  input: Record<string, unknown>
  reference_output: unknown
  metadata: Record<string, unknown>
  cluster_id: number | null
  duplicate_of: string | null
  is_seed: boolean
  label: LabelInfo | null
}

export interface RowsPage {
  items: Row[]
  total: number
  clusters: { cluster_id: number; count: number }[]
  duplicates: number
}

export type RuleKind = 'criterion' | 'guardrail' | 'rubric'

export interface Rule {
  id: string | null
  text: string
  kind: RuleKind
}

export interface RuleSet {
  version: number
  rules: Rule[]
}

export interface Seed {
  row: Row
  expected_output: unknown
}

export interface LabelInfo {
  expected_output: unknown
  rationale: string | null
  source: string
  status: string
  uncertainty: number | null
  uncertainty_breakdown: Record<string, unknown> | null
}

export interface LabelStats {
  counts: Record<string, number>
  uncertainties: number[]
  threshold: number
}

export interface Report {
  total_rows: number
  duplicates: number
  seeds: number
  unlabelled: number
  status: Record<string, number>
  reviewed: number
  review_rate: number | null
  human_minutes: number
  coverage: { cluster_id: number; rows: number; human: number; flagged: boolean }[]
  audit: { sampled: number; reviewed: number; changed: number }
  judge: { rows: number; mean_score: number | null }
}

export interface ReviewCard {
  row: Row | null
  counts: Record<string, number>
}

export interface ReviewResult {
  label: LabelInfo
  similar_job: Job | null
}
