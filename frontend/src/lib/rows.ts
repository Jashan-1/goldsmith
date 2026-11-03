import type { Row } from '../api/client'

export function inputText(input: Row['input']): string {
  return Object.entries(input)
    .map(([k, v]) =>
      k === 'messages' && Array.isArray(v)
        ? v.map((m) => `${m.role}: ${m.content}`).join('\n')
        : Object.keys(input).length === 1
          ? String(v)
          : `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`,
    )
    .join('\n')
}

export function valueText(value: unknown): string {
  return value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value)
}

export const STATUS: Record<string, { label: string; tone: 'neutral' | 'gold' | 'ok' | 'bad' }> = {
  unlabelled: { label: 'Unlabelled', tone: 'neutral' },
  needs_review: { label: 'Needs review', tone: 'gold' },
  auto_accepted: { label: 'Auto-accepted', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'ok' },
  edited: { label: 'Edited', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
}
