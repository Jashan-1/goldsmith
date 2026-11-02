import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { api, type Rule, type RuleKind, type RuleSet } from '../../api/client'

const EXAMPLE_RULES: Rule[] = [
  { id: null, kind: 'criterion', text: 'Refund answers must mention the 30-day window.' },
  { id: null, kind: 'guardrail', text: 'Never give medical dosing advice.' },
  { id: null, kind: 'rubric', text: 'Answers are clear and no longer than they need to be.' },
]

const KINDS: { value: RuleKind; label: string }[] = [
  { value: 'criterion', label: 'Criterion' },
  { value: 'guardrail', label: 'Guardrail' },
  { value: 'rubric', label: 'Rubric' },
]

export default function RulesStep() {
  const { projectId = '' } = useParams()
  const rules = useQuery({
    queryKey: ['rules', projectId],
    queryFn: () => api<RuleSet>(`/projects/${projectId}/rules`),
  })
  if (rules.isPending) return <p className="text-stone-500">Loading…</p>
  if (rules.error) return <p className="text-red-600">{rules.error.message}</p>
  // Keyed by version so a save resets the editor to what the server stored.
  return <RulesEditor key={rules.data.version} projectId={projectId} saved={rules.data} />
}

function RulesEditor({ projectId, saved }: { projectId: string; saved: RuleSet }) {
  const queryClient = useQueryClient()
  const isNew = saved.version === 0
  const [rules, setRules] = useState<Rule[]>(isNew ? EXAMPLE_RULES : saved.rules)
  const valid = rules.every((r) => r.text.trim())
  const dirty = isNew || JSON.stringify(rules) !== JSON.stringify(saved.rules)

  const save = useMutation({
    mutationFn: () =>
      api<RuleSet>(`/projects/${projectId}/rules`, {
        method: 'PUT',
        body: JSON.stringify({ rules: rules.map((r) => ({ ...r, text: r.text.trim() })) }),
      }),
    onSuccess: (data) => queryClient.setQueryData(['rules', projectId], data),
  })

  const update = (i: number, patch: Partial<Rule>) =>
    setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Write the criteria, guardrails and rubric items labels must follow. Every step uses them.{' '}
        {isNew ? (
          <span className="font-medium">These are examples: edit or delete them, then save.</span>
        ) : (
          <span>Version {saved.version}. Saving changes creates a new version.</span>
        )}
      </p>

      <ul className="space-y-2">
        {rules.map((r, i) => (
          <li key={i} className="flex gap-2">
            <select
              aria-label="Rule kind"
              className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm"
              value={r.kind}
              onChange={(e) => update(i, { kind: e.target.value as RuleKind })}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Rule text"
              className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2"
              value={r.text}
              maxLength={1000}
              placeholder="e.g. Never promise delivery dates"
              onChange={(e) => update(i, { text: e.target.value })}
            />
            <button
              aria-label="Delete rule"
              className="rounded-lg px-3 text-stone-500 hover:bg-stone-100 hover:text-red-600"
              onClick={() => setRules(rules.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <button
          className="rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
          onClick={() => setRules([...rules, { id: null, kind: 'criterion', text: '' }])}
        >
          + Add rule
        </button>
        <button
          className="ml-auto rounded-lg bg-amber-500 px-4 py-2 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          disabled={!valid || !dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save rules'}
        </button>
      </div>
      {!valid && <p className="text-sm text-red-600">Fill in or delete empty rules.</p>}
      {save.error && <p className="text-sm text-red-600">{save.error.message}</p>}
    </div>
  )
}
