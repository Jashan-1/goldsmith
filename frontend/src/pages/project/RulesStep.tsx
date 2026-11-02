import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, type Rule, type RuleKind, type RuleSet } from '../../api/client'
import Icon from '../../components/Icon'
import { Badge, ErrorText, Loading, PageHeader } from '../../components/ui'

const EXAMPLE_RULES: Rule[] = [
  { id: null, kind: 'criterion', text: 'Refund answers must mention the 30-day window.' },
  { id: null, kind: 'guardrail', text: 'Never give medical dosing advice.' },
  { id: null, kind: 'rubric', text: 'Answers are clear and no longer than they need to be.' },
]

const KINDS: { value: RuleKind; label: string; hint: string }[] = [
  { value: 'criterion', label: 'Criterion', hint: 'What a correct label must do' },
  { value: 'guardrail', label: 'Guardrail', hint: 'What a label must never do' },
  { value: 'rubric', label: 'Rubric', hint: 'What makes a label better' },
]

export default function RulesStep() {
  const { projectId = '' } = useParams()
  const rules = useQuery({
    queryKey: ['rules', projectId],
    queryFn: () => api<RuleSet>(`/projects/${projectId}/rules`),
  })
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8 md:px-10">
      <PageHeader
        kicker={<span className="mono-label">02 · Guidelines</span>}
        title="Write down what “correct” means"
        description="Plain-language rules the model follows when it labels, and that reviewers can point to. Every step uses them."
      />
      {rules.isPending && <Loading />}
      {rules.error && <ErrorText>{rules.error.message}</ErrorText>}
      {rules.data && (
        // Keyed by version so a save resets the editor to what the server stored.
        <RulesEditor key={rules.data.version} projectId={projectId} saved={rules.data} />
      )}
    </div>
  )
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
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3 text-[13px]">
        {isNew ? (
          <span className="text-muted">
            Examples to get you started. Edit or delete them, then save.
          </span>
        ) : (
          <span className="flex items-center gap-2 text-muted">
            <Badge>v{saved.version}</Badge> Saving changes creates a new version; old labels keep
            theirs.
          </span>
        )}
      </div>

      <ul className="divide-y divide-line">
        {rules.map((r, i) => (
          <li key={i} className="flex items-start gap-3 px-5 py-3">
            <span className="mt-2.5 font-mono text-[11px] text-faint tabular-nums">
              {r.id ?? `#${i + 1}`}
            </span>
            <div className="flex-1">
              <input
                aria-label="Rule text"
                className="w-full bg-transparent py-1.5 text-[14px] outline-none placeholder:text-faint"
                value={r.text}
                maxLength={1000}
                placeholder="e.g. Never promise a delivery date"
                onChange={(e) => update(i, { text: e.target.value })}
              />
              <div className="mt-1 flex gap-1">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    title={k.hint}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      r.kind === k.value
                        ? k.value === 'guardrail'
                          ? 'bg-bad-soft text-bad'
                          : k.value === 'criterion'
                            ? 'bg-ink text-white'
                            : 'bg-gold-soft text-gold'
                        : 'text-faint hover:bg-sunken hover:text-muted'
                    }`}
                    onClick={() => update(i, { kind: k.value })}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              aria-label="Delete rule"
              className="btn-ghost mt-1 px-2 py-1.5 hover:text-bad"
              onClick={() => setRules(rules.filter((_, j) => j !== i))}
            >
              <Icon name="x" size={14} />
            </button>
          </li>
        ))}
        {rules.length === 0 && (
          <li className="px-5 py-8 text-center text-[13px] text-muted">
            No rules. That's allowed, but labels will rely on your seed examples alone.
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        <button
          className="btn-ghost"
          onClick={() => setRules([...rules, { id: null, kind: 'criterion', text: '' }])}
        >
          + Add rule
        </button>
        {!valid && <ErrorText>Fill in or delete empty rules.</ErrorText>}
        {save.error && <ErrorText>{save.error.message}</ErrorText>}
        <div className="ml-auto flex items-center gap-2">
          {!dirty && (
            <Link to="../seeds" relative="path" className="btn-secondary">
              Next: seed examples
              <Icon name="chevron-right" size={14} />
            </Link>
          )}
          <button
            className="btn-primary"
            disabled={!valid || !dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : dirty ? 'Save guidelines' : 'Saved'}
          </button>
        </div>
      </div>
    </div>
  )
}
