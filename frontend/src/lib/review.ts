import type { LabelInfo, Rule } from '../api/client'

export type Mode = 'idle' | 'edit' | 'preview'
export type KeyAction =
  'approve' | 'reject' | 'edit' | 'fix' | 'submit' | 'cancel' | 'next' | 'prev' | null

/** Keyboard map for the review card. `inText` = focus is in a text field. */
export function keyAction(key: string, shift: boolean, inText: boolean, mode: Mode): KeyAction {
  if (key === 'Escape') return mode === 'idle' ? null : 'cancel'
  if (key === 'Enter' && !shift && (inText || mode === 'preview')) return 'submit'
  if (inText || mode !== 'idle') return null
  const k = key.toLowerCase()
  const map: Record<string, KeyAction> = {
    a: 'approve',
    r: 'reject',
    e: 'edit',
    f: 'fix',
    j: 'next',
    arrowdown: 'next',
    k: 'prev',
    arrowup: 'prev',
  }
  return map[k] ?? null
}

interface Breakdown {
  signals?: Record<string, number | null>
  samples?: unknown[]
  rule_concerns?: string[]
  stated_confidence?: number
  audit?: number
  judge?: { best: number; score: number; reason: string }
}

/** Plain-language reasons a row was sent to review, strongest first. */
export function whyReasons(
  label: LabelInfo,
  rules: Rule[],
  reference: unknown,
  isClassification: boolean,
): string[] {
  const b = (label.uncertainty_breakdown ?? {}) as Breakdown
  const s = b.signals ?? {}
  const reasons: string[] = []

  if (b.audit) reasons.push('Audit sample: auto-accepted, picked at random to check quality')
  if ((s.reference ?? 0) >= 0.5)
    reasons.push(
      isClassification
        ? `Differs from the label in your file ("${String(reference)}")`
        : 'Differs from the reference answer in your file',
    )
  if ((s.disagreement ?? 0) > 0) {
    const samples = b.samples ?? []
    const differ = samples.filter((x) => x !== samples[0]).length
    reasons.push(
      isClassification && samples.length > 1
        ? `${differ} of ${samples.length} samples disagreed`
        : 'Repeated samples gave noticeably different answers',
    )
  }
  for (const id of b.rule_concerns ?? []) {
    const rule = rules.find((r) => r.id === id)
    reasons.push(`Possible ${rule?.kind ?? 'rule'} issue: ${rule?.text ?? id}`)
  }
  if (b.judge && b.judge.score < 0.6)
    reasons.push(
      `Judge gave the best answer ${Math.round(b.judge.score * 100)}%: ${b.judge.reason}`,
    )
  if ((s.novelty ?? 0) >= 0.8) reasons.push('Unlike the rows a human has labelled so far')
  if (b.stated_confidence != null && b.stated_confidence < 0.6)
    reasons.push(`Model was only ${Math.round(b.stated_confidence * 100)}% confident`)

  if (reasons.length === 0 && label.uncertainty != null)
    reasons.push(`Uncertainty ${label.uncertainty.toFixed(2)} is above your threshold`)
  return reasons
}

/** Instruction asking the model to repair a flagged label (AutoSFT-style repair, not drop). */
export function fixInstruction(reasons: string[]): string {
  return [
    'Repair the current label so an expert reviewer would accept it. Problems found:',
    ...reasons.map((r) => `- ${r}`),
    'Change only what these problems need. If the label is already right, return it unchanged.',
  ].join('\n')
}
