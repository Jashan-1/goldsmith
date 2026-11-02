import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import {
  api,
  type LabelStats,
  type Project,
  type ReviewResult,
  type Row,
  type RowsPage,
  type RuleSet,
} from '../../api/client'
import Icon, { type IconName } from '../../components/Icon'
import { Badge, EmptyState, ErrorText } from '../../components/ui'
import { keyAction, whyReasons, type Mode } from '../../lib/review'
import { inputText, STATUS, valueText } from '../../lib/rows'
import { useJob } from '../../lib/useJob'

type Box = 'todo' | 'done'
type Body = Record<string, unknown>
const UNDO_SECONDS = 5

export default function ReviewStep() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const [box, setBox] = useState<Box>('todo')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lastIndex, setLastIndex] = useState(0)
  const [search, setSearch] = useState('')
  const [similarJobId, setSimilarJobId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const params =
    box === 'todo' ? 'status=needs_review&order=uncertainty&limit=200' : 'status=reviewed&limit=200'
  const list = useQuery({
    queryKey: ['rows', projectId, 'review-box', box],
    queryFn: () => api<RowsPage>(`/projects/${projectId}/rows?${params}`),
  })
  const stats = useQuery({
    queryKey: ['label-stats', projectId],
    queryFn: () => api<LabelStats>(`/projects/${projectId}/label/stats`),
  })
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
  })
  const rules = useQuery({
    queryKey: ['rules', projectId],
    queryFn: () => api<RuleSet>(`/projects/${projectId}/rules`),
  })
  const similarJob = useJob(similarJobId)
  const similarStatus = similarJob.data?.status

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['rows', projectId] })
    queryClient.invalidateQueries({ queryKey: ['label-stats', projectId] })
    queryClient.invalidateQueries({ queryKey: ['review', projectId] })
  }, [queryClient, projectId])
  useEffect(() => {
    if (similarStatus === 'done') refresh()
  }, [similarStatus, refresh])

  // Approve/reject wait a few seconds so a slip can be undone.
  const { pending, queue, undo, error: sendError } = useUndoableSend(projectId, refresh)

  const needle = search.trim().toLowerCase()
  const items = (list.data?.items ?? []).filter(
    (r) =>
      r.id !== pending?.row.id &&
      (!needle ||
        `${inputText(r.input)} ${valueText(r.label?.expected_output)}`
          .toLowerCase()
          .includes(needle)),
  )
  // Keep the cursor in place when the reviewed row leaves the list.
  const index = Math.max(
    0,
    selectedId && items.some((r) => r.id === selectedId)
      ? items.findIndex((r) => r.id === selectedId)
      : Math.min(lastIndex, items.length - 1),
  )
  const selected = items[index] ?? null
  const select = (i: number) => {
    const row = items[Math.max(0, Math.min(items.length - 1, i))]
    if (!row) return
    setSelectedId(row.id)
    setLastIndex(items.indexOf(row))
  }

  // "/" focuses search, "U" undoes, like a mail client.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'TEXTAREA' || (el instanceof HTMLInputElement && el.type === 'text'))
        return
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key.toLowerCase() === 'u' && pending) {
        e.preventDefault()
        setSelectedId(undo())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, undo])

  const counts = stats.data?.counts ?? {}
  const labelled =
    (stats.data?.uncertainties.length ?? 0) > 0 || (counts.edited ?? 0) + (counts.rejected ?? 0) > 0
  const boxes: { id: Box; label: string; icon: IconName; count?: number }[] = [
    { id: 'todo', label: 'To review', icon: 'inbox', count: counts.needs_review ?? 0 },
    { id: 'done', label: 'Done', icon: 'check-check' },
  ]

  return (
    <div className="relative flex h-[calc(100vh-3rem)] min-h-[560px]">
      {/* Mailbox column */}
      <aside className="hidden w-52 shrink-0 border-r border-line px-3 py-4 lg:block">
        <p className="px-2 text-[15px] font-semibold tracking-[-0.02em]">Review queue</p>
        <nav className="mt-3 grid gap-0.5">
          {boxes.map((b) => (
            <button
              key={b.id}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
                box === b.id ? 'bg-hover font-medium text-ink' : 'text-ink-soft hover:bg-hover'
              }`}
              onClick={() => {
                setBox(b.id)
                setSelectedId(null)
                setLastIndex(0)
              }}
            >
              <Icon name={b.icon} className="text-muted" />
              <span className="flex-1">{b.label}</span>
              {!!b.count && <span className="text-[12px] text-muted tabular-nums">{b.count}</span>}
            </button>
          ))}
        </nav>
        <p className="mt-6 px-2 text-[11px] font-medium tracking-wide text-faint uppercase">
          Shortcuts
        </p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-2 text-[12px] text-muted">
          {[
            ['A', 'Approve'],
            ['R', 'Reject'],
            ['E', 'Edit'],
            ['U', 'Undo'],
            ['J / K', 'Next / previous'],
            ['/', 'Search'],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="kbd">{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <Link
          to="../label"
          relative="path"
          className="mt-6 block px-2 text-[12px] text-muted hover:text-ink"
        >
          Threshold {stats.data?.threshold.toFixed(2) ?? '–'} · change →
        </Link>
      </aside>

      {/* List column */}
      <section className="flex w-full max-w-[360px] shrink-0 flex-col border-r border-line bg-surface max-md:hidden">
        <div className="border-b border-line p-3">
          <label className="relative block">
            <Icon
              name="search"
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
            />
            <input
              ref={searchRef}
              type="text"
              aria-label="Search the queue"
              className="field w-full bg-sunken py-1.5 pr-8 pl-8 text-[13px]"
              placeholder={box === 'todo' ? 'Search to review' : 'Search done'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (e.target as HTMLInputElement).blur()}
            />
            <kbd className="kbd absolute top-1/2 right-2.5 -translate-y-1/2 text-muted">/</kbd>
          </label>
        </div>
        {similarJobId && similarStatus !== 'done' && similarStatus !== 'failed' && (
          <p className="border-b border-line bg-gold-soft px-4 py-2 text-[12px] text-gold">
            Relabelling similar rows with your instruction…
          </p>
        )}
        <ul className="flex-1 overflow-y-auto">
          {items.map((r, i) => (
            <li key={r.id}>
              <button
                className={`relative flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors ${
                  i === index ? 'bg-sunken' : 'hover:bg-sunken/60'
                }`}
                onClick={() => select(i)}
              >
                {i === index && <span className="absolute inset-y-0 left-0 w-[3px] bg-ink" />}
                <span
                  className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border ${
                    box === 'todo'
                      ? 'border-gold-line bg-gold-soft text-gold'
                      : 'border-line bg-surface text-muted'
                  }`}
                >
                  <Icon name={box === 'todo' ? 'sparkles' : 'check'} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold">
                      {valueText(r.label?.expected_output) || '—'}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-faint">
                      #{r.row_index + 1}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-soft">
                    {inputText(r.input)}
                  </span>
                  <span className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] text-muted">
                      Cluster {r.cluster_id}
                      {r.reference_output != null &&
                        ` · file says ${valueText(r.reference_output)}`}
                    </span>
                    {box === 'todo' ? (
                      <UncertaintyRing value={r.label?.uncertainty ?? 0} />
                    ) : (
                      r.label && (
                        <Badge tone={STATUS[r.label.status]?.tone}>
                          {STATUS[r.label.status]?.label}
                        </Badge>
                      )
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {list.data && items.length === 0 && (
          <EmptyState
            icon={needle ? 'search' : box === 'todo' ? 'inbox' : 'check-check'}
            title={
              needle
                ? 'No matches'
                : box === 'todo'
                  ? "You're all caught up"
                  : 'Nothing reviewed yet'
            }
          >
            {needle
              ? 'Try a different search.'
              : box === 'todo'
                ? labelled
                  ? 'Every uncertain row has been reviewed. Lower the threshold to review more.'
                  : 'Run labelling and uncertain rows will show up here.'
                : 'Rows you approve, edit or reject will collect here.'}
          </EmptyState>
        )}
      </section>

      {/* Detail pane */}
      <section className="relative flex min-w-0 flex-1 flex-col bg-surface">
        {(list.error || sendError) && (
          <div className="border-b border-line px-6 py-3">
            <ErrorText>{(list.error ?? sendError)?.message}</ErrorText>
          </div>
        )}
        {selected?.label ? (
          box === 'todo' ? (
            <Card
              key={selected.id}
              projectId={projectId}
              row={selected}
              position={`${index + 1} of ${items.length}`}
              remaining={items.length}
              rules={rules.data?.rules ?? []}
              isClassification={project.data?.task_type === 'classification'}
              onNavigate={(d) => select(index + d)}
              onQuickAction={(body) => {
                queue(selected, body)
                setSelectedId(items[index + 1]?.id ?? items[index - 1]?.id ?? null)
              }}
              onDone={(result) => {
                if (result.similar_job) setSimilarJobId(result.similar_job.id)
                setSelectedId(items[index + 1]?.id ?? items[index - 1]?.id ?? null)
                refresh()
              }}
            />
          ) : (
            <DoneView row={selected} />
          )
        ) : (
          <div className="grid flex-1 place-items-center bg-canvas">
            <EmptyState icon="inbox" title="Nothing to read">
              {box === 'todo'
                ? 'When the model is unsure about a row, it will show up here.'
                : 'Select a reviewed row to see its final label.'}
            </EmptyState>
          </div>
        )}
      </section>

      {pending && (
        <UndoToast
          key={pending.row.id + pending.startedAt}
          verb={pending.body.action === 'approve' ? 'Approving' : 'Rejecting'}
          row={pending.row}
          onUndo={() => setSelectedId(undo())}
        />
      )}
    </div>
  )
}

/** Holds one approve/reject for a few seconds before sending it; a new action sends the old one. */
function useUndoableSend(projectId: string, onSent: () => void) {
  const [pending, setPending] = useState<{ row: Row; body: Body; startedAt: number } | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef(pending)

  const send = useCallback(
    (p: { row: Row; body: Body }) =>
      api<ReviewResult>(`/projects/${projectId}/review/${p.row.id}`, {
        method: 'POST',
        body: JSON.stringify(p.body),
      })
        .then(onSent)
        .catch((e: Error) => setError(e)),
    [projectId, onSent],
  )
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    if (latest.current) void send(latest.current)
    latest.current = null
    setPending(null)
  }, [send])

  const queue = (row: Row, body: Body) => {
    flush()
    setError(null)
    const next = { row, body, startedAt: Date.now() }
    latest.current = next
    setPending(next)
    timer.current = window.setTimeout(flush, UNDO_SECONDS * 1000)
  }
  const undo = (): string | null => {
    window.clearTimeout(timer.current)
    const rowId = latest.current?.row.id ?? null
    latest.current = null
    setPending(null)
    return rowId
  }
  // Leaving the page sends whatever is waiting rather than dropping it.
  useEffect(() => flush, [flush])

  return { pending, queue, undo, error }
}

function UndoToast({ verb, row, onUndo }: { verb: string; row: Row; onUndo: () => void }) {
  const [left, setLeft] = useState(UNDO_SECONDS)
  useEffect(() => {
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="absolute bottom-5 left-5 z-30 flex w-80 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-[0_12px_40px_rgba(10,10,10,0.12)]">
      <span className="relative grid size-8 shrink-0 place-items-center text-[12px] font-semibold tabular-nums">
        <svg className="absolute inset-0" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="13" fill="none" stroke="var(--color-line)" strokeWidth="2" />
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2"
            strokeDasharray="81.7"
            strokeDashoffset={81.7 * (1 - left / UNDO_SECONDS)}
            transform="rotate(-90 16 16)"
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        {left}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">
          {verb} in {left}s
        </span>
        <span className="block truncate text-[12px] text-muted">
          Row {row.row_index + 1} · {valueText(row.label?.expected_output)}
        </span>
      </span>
      <button className="btn-ghost px-2 py-1 text-ink" onClick={onUndo}>
        <Icon name="arrow-left" size={14} /> Undo
      </button>
    </div>
  )
}

function UncertaintyRing({ value }: { value: number }) {
  const tone = value >= 0.75 ? 'text-bad' : value >= 0.5 ? 'text-gold' : 'text-muted'
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium ${tone}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <circle
          cx="6"
          cy="6"
          r="4.5"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1.8"
        />
        <circle
          cx="6"
          cy="6"
          r="4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeDasharray={`${value * 28.3} 28.3`}
          transform="rotate(-90 6 6)"
          strokeLinecap="round"
        />
      </svg>
      {Math.round(value * 100)}% unsure
    </span>
  )
}

function DetailHeader({ row, right }: { row: Row; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-6 py-3">
      <span className="grid size-9 place-items-center rounded-lg border border-line bg-sunken text-muted">
        <Icon name="file-text" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">Row {row.row_index + 1}</p>
        <p className="font-mono text-[11px] text-muted">
          cluster {row.cluster_id} · {row.id.slice(0, 8)}
        </p>
      </div>
      {right}
    </div>
  )
}

function DetailsTable({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-6 px-5 py-3 text-[13px]">
          <dt className="shrink-0 text-muted">{k}</dt>
          <dd className="min-w-0 text-right font-medium break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="mb-2.5 text-[13px] font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function DoneView({ row }: { row: Row }) {
  const label = row.label!
  return (
    <>
      <DetailHeader
        row={row}
        right={<Badge tone={STATUS[label.status]?.tone}>{STATUS[label.status]?.label}</Badge>}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          <div className="rounded-2xl border border-line p-6">
            <h2 className="text-[20px] leading-snug font-semibold tracking-[-0.02em] whitespace-pre-line">
              {inputText(row.input)}
            </h2>
            <hr className="my-5 border-line" />
            <p className="text-[14px]">
              <span className="font-semibold">Final label: </span>
              <span className={label.status === 'rejected' ? 'text-faint line-through' : ''}>
                {valueText(label.expected_output)}
              </span>
            </p>
            {label.status === 'rejected' && (
              <p className="mt-2 text-[13px] text-muted">
                Rejected rows are left out of the export.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function Card({
  projectId,
  row,
  position,
  remaining,
  rules,
  isClassification,
  onNavigate,
  onQuickAction,
  onDone,
}: {
  projectId: string
  row: Row
  position: string
  remaining: number
  rules: RuleSet['rules']
  isClassification: boolean
  onNavigate: (delta: number) => void
  onQuickAction: (body: Body) => void
  onDone: (r: ReviewResult) => void
}) {
  const label = row.label!
  const shownAt = useRef(0)
  // Card is keyed by row, so this runs once per card shown.
  useEffect(() => {
    shownAt.current = Date.now()
  }, [])
  const [mode, setMode] = useState<Mode>('idle')
  const [edit, setEdit] = useState(valueText(label.expected_output))
  const [instruction, setInstruction] = useState('')
  const [preview, setPreview] = useState<{ expected_output: string; rationale: string } | null>(
    null,
  )
  const [applySimilar, setApplySimilar] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const base = `/projects/${projectId}/review/${row.id}`
  const seconds = () => Math.round((Date.now() - shownAt.current) / 1000)

  const submit = useMutation({
    mutationFn: (body: Body) =>
      api<ReviewResult>(base, {
        method: 'POST',
        body: JSON.stringify({ ...body, seconds_spent: seconds() }),
      }),
    onSuccess: onDone,
  })
  const instruct = useMutation({
    mutationFn: () =>
      api<{ expected_output: string; rationale: string }>(`${base}/instruct`, {
        method: 'POST',
        body: JSON.stringify({ instruction: instruction.trim() }),
      }),
    onSuccess: (p) => {
      setPreview(p)
      setMode('preview')
    },
  })
  const busy = submit.isPending || instruct.isPending

  // One handler for buttons and keys, so both stay in sync.
  const run = (action: ReturnType<typeof keyAction>, from: 'edit' | 'instruction' | null) => {
    if (!action || busy) return
    if (action === 'next') onNavigate(1)
    else if (action === 'prev') onNavigate(-1)
    else if (action === 'approve' || action === 'reject')
      onQuickAction({ action, seconds_spent: seconds() })
    else if (action === 'edit') {
      setMode('edit')
      // Select the current output so typing replaces it.
      setTimeout(() => editRef.current?.select())
    } else if (action === 'cancel') {
      setMode('idle')
      setPreview(null)
    } else if (action === 'submit') {
      if (mode === 'preview' && preview)
        submit.mutate({
          action: 'instruction',
          instruction: instruction.trim(),
          expected_output: preview.expected_output,
          apply_to_similar: applySimilar,
        })
      else if (from === 'edit' && edit.trim())
        submit.mutate({ action: 'edit', expected_output: edit.trim() })
      else if (from === 'instruction' && instruction.trim()) instruct.mutate()
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      // Checkboxes and buttons don't swallow shortcuts; only text fields do.
      const inText =
        el.tagName === 'TEXTAREA' || (el instanceof HTMLInputElement && el.type === 'text')
      if (inText) return // text fields handle their own keys below
      const action = keyAction(e.key, e.shiftKey, false, mode)
      if (action) {
        e.preventDefault()
        run(action, null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const textKeys = (from: 'edit' | 'instruction') => (e: React.KeyboardEvent) => {
    const action = keyAction(e.key, e.shiftKey, true, from === 'edit' ? 'edit' : 'idle')
    if (action) {
      e.preventDefault()
      run(action, from)
    }
  }

  const reasons = whyReasons(label, rules, row.reference_output, isClassification)
  const b = (label.uncertainty_breakdown ?? {}) as {
    samples?: unknown[]
    stated_confidence?: number
    rules_applied?: string[]
  }
  const details: [string, ReactNode][] = [["Model's label", valueText(label.expected_output)]]
  if (row.reference_output != null) details.push(['In your file', valueText(row.reference_output)])
  if (b.samples && b.samples.length > 1)
    details.push(['Samples', b.samples.map(valueText).join(' · ')])
  if (b.stated_confidence != null)
    details.push(['Model confidence', `${Math.round(b.stated_confidence * 100)}%`])
  if (b.rules_applied?.length) details.push(['Guidelines applied', b.rules_applied.join(', ')])
  const meta = Object.entries(row.metadata ?? {})

  return (
    <>
      <DetailHeader
        row={row}
        right={
          <span className="flex items-center gap-1 text-[12px] text-muted">
            <span className="tabular-nums">{position}</span>
            <button
              className="btn-ghost px-1.5 py-1"
              aria-label="Previous"
              onClick={() => onNavigate(-1)}
            >
              <Icon name="chevron-right" size={14} className="rotate-180" />
            </button>
            <button
              className="btn-ghost px-1.5 py-1"
              aria-label="Next"
              onClick={() => onNavigate(1)}
            >
              <Icon name="chevron-right" size={14} />
            </button>
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <article className="mx-auto w-full max-w-3xl px-6 py-6">
          <div className="rounded-2xl border border-line p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <p className="flex items-center gap-2 text-[12px] text-muted">
              <Icon name="sparkles" size={13} /> Model label
              <span className="text-faint">·</span>
              <UncertaintyRing value={label.uncertainty ?? 0} />
            </p>
            <h2 className="mt-3 text-[21px] leading-snug font-semibold tracking-[-0.02em] whitespace-pre-line">
              {inputText(row.input)}
            </h2>
            <hr className="my-5 border-line" />
            <div className="space-y-1.5 text-[14px] leading-relaxed">
              <p>
                <span className="font-semibold">Proposed label: </span>
                {valueText(label.expected_output)}
              </p>
              {label.rationale && (
                <p className="text-ink-soft">
                  <span className="font-semibold text-ink">Why: </span>
                  {label.rationale}
                </p>
              )}
            </div>
          </div>

          <Section title="Why you're seeing this">
            <ul className="divide-y divide-gold-line/60 overflow-hidden rounded-2xl border border-gold-line bg-gold-soft/50">
              {reasons.map((r) => (
                <li key={r} className="flex items-start gap-3 px-5 py-3 text-[13px] text-ink-soft">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-gold" />
                  {r}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Details">
            <DetailsTable rows={details} />
          </Section>

          {meta.length > 0 && (
            <details className="group mt-4 rounded-2xl border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-[13px] text-muted">
                About this row
                <Icon
                  name="chevron-right"
                  size={14}
                  className="transition-transform group-open:rotate-90"
                />
              </summary>
              <dl className="divide-y divide-line border-t border-line">
                {meta.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-6 px-5 py-2.5 text-[13px]">
                    <dt className="font-mono text-[12px] text-muted">{k}</dt>
                    <dd className="text-right">{valueText(v)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </article>
      </div>

      {/* Response bar */}
      <div className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-3xl space-y-3 px-6 pt-3 pb-5">
          <div className="flex items-center justify-between text-[11px] font-medium tracking-wide text-muted uppercase">
            <span>Your response</span>
            <span className="tracking-normal normal-case tabular-nums">
              {remaining} left in queue
            </span>
          </div>

          {mode === 'edit' && (
            <label className="block text-[12px] font-medium text-muted">
              New label <span className="font-normal">· Enter to save, Esc to cancel</span>
              <textarea
                ref={editRef}
                className="field mt-1.5 block w-full text-[14px] text-ink"
                rows={3}
                value={edit}
                onChange={(e) => setEdit(e.target.value)}
                onKeyDown={textKeys('edit')}
              />
            </label>
          )}
          {mode === 'preview' && preview && (
            <div className="rounded-2xl border border-line bg-sunken/60 p-4 text-[13px]">
              <p className="text-[12px] font-medium text-muted">Suggested new version</p>
              <p className="mt-1 text-[15px] font-semibold whitespace-pre-line">
                {preview.expected_output}
              </p>
              <p className="mt-1 text-muted">{preview.rationale}</p>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-ink-soft">
                <input
                  type="checkbox"
                  className="accent-ink"
                  checked={applySimilar}
                  onChange={(e) => setApplySimilar(e.target.checked)}
                />
                Also apply this to the 10 most similar unreviewed rows
              </label>
            </div>
          )}

          {mode === 'preview' ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-primary rounded-full py-2.5 text-[14px]"
                onClick={() => run('submit', null)}
                disabled={busy}
              >
                Accept new version <kbd className="kbd">Enter</kbd>
              </button>
              <button
                className="btn-secondary rounded-full py-2.5 text-[14px]"
                onClick={() => run('cancel', null)}
              >
                Discard <kbd className="kbd">Esc</kbd>
              </button>
            </div>
          ) : mode === 'edit' ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn-primary rounded-full py-2.5 text-[14px]"
                onClick={() => run('submit', 'edit')}
                disabled={busy || !edit.trim()}
              >
                Save edit <kbd className="kbd">Enter</kbd>
              </button>
              <button
                className="btn-secondary rounded-full py-2.5 text-[14px]"
                onClick={() => run('cancel', null)}
              >
                Cancel <kbd className="kbd">Esc</kbd>
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn-primary rounded-full py-2.5 text-[14px]"
                  onClick={() => run('approve', null)}
                  disabled={busy}
                >
                  Approve label <kbd className="kbd">A</kbd>
                </button>
                <button
                  className="btn-secondary rounded-full py-2.5 text-[14px]"
                  onClick={() => run('reject', null)}
                  disabled={busy}
                >
                  Reject row <kbd className="kbd">R</kbd>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary rounded-full"
                  onClick={() => run('edit', null)}
                  disabled={busy}
                >
                  <Icon name="pencil" size={13} /> Edit <kbd className="kbd">E</kbd>
                </button>
                <div className="relative flex-1">
                  <Icon
                    name="message-square"
                    size={14}
                    className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
                  />
                  <input
                    type="text"
                    aria-label="Instruction for the model"
                    className="field w-full rounded-full pl-9 text-[13px]"
                    placeholder="Or tell the model what to change, then press Enter"
                    value={instruction}
                    maxLength={2000}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={textKeys('instruction')}
                  />
                </div>
              </div>
            </>
          )}
          {instruct.isPending && <p className="text-[13px] text-muted">Asking the model…</p>}
          {(submit.error || instruct.error) && (
            <ErrorText>{(submit.error ?? instruct.error)?.message}</ErrorText>
          )}
        </div>
      </div>
    </>
  )
}
