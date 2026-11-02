import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  api,
  type LabelStats,
  type Project,
  type ReviewCard,
  type ReviewResult,
  type Row,
  type RuleSet,
} from '../../api/client'
import ThresholdPanel from '../../components/ThresholdPanel'
import { keyAction, whyReasons, type Mode } from '../../lib/review'
import { inputText, valueText } from '../../lib/rows'
import { useJob } from '../../lib/useJob'

export default function ReviewStep() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const card = useQuery({
    queryKey: ['review', projectId],
    queryFn: () => api<ReviewCard>(`/projects/${projectId}/review/next`),
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
  const [similarJobId, setSimilarJobId] = useState<string | null>(null)
  const similarJob = useJob(similarJobId)
  const similarStatus = similarJob.data?.status

  useEffect(() => {
    if (similarStatus === 'done') {
      queryClient.invalidateQueries({ queryKey: ['review', projectId] })
      queryClient.invalidateQueries({ queryKey: ['label-stats', projectId] })
    }
  }, [similarStatus, projectId, queryClient])

  if (card.isPending || stats.isPending) return <p className="text-stone-500">Loading…</p>
  if (card.error) return <p className="text-red-600">{card.error.message}</p>
  if (stats.error) return <p className="text-red-600">{stats.error.message}</p>

  const counts = card.data.counts
  const row = card.data.row

  return (
    <div className="space-y-6 pb-72">
      {stats.data.uncertainties.length > 0 && (
        <ThresholdPanel
          key={stats.data.threshold}
          projectId={projectId}
          stats={stats.data}
          seeds={counts.approved ?? 0}
        />
      )}
      {similarJobId && similarStatus !== 'done' && similarStatus !== 'failed' && (
        <p className="text-sm text-stone-500">Relabelling similar rows with your instruction…</p>
      )}
      {similarJob.data?.error && <p className="text-sm text-amber-700">{similarJob.data.error}</p>}

      {row ? (
        <Card
          key={row.id}
          projectId={projectId}
          row={row}
          rules={rules.data?.rules ?? []}
          isClassification={project.data?.task_type === 'classification'}
          onDone={(result) => {
            if (result.similar_job) setSimilarJobId(result.similar_job.id)
            queryClient.invalidateQueries({ queryKey: ['review', projectId] })
            queryClient.invalidateQueries({ queryKey: ['label-stats', projectId] })
            queryClient.invalidateQueries({ queryKey: ['rows', projectId] })
          }}
        />
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white p-8 text-center">
          <p className="text-lg font-medium">Nothing to review</p>
          <p className="mt-1 text-sm text-stone-500">
            {stats.data.uncertainties.length > 0
              ? 'Every uncertain row has been reviewed. Spot-check auto-accepted rows in the Data tab, or lower the threshold to review more.'
              : 'Run labelling first.'}
          </p>
          <Link
            to={stats.data.uncertainties.length > 0 ? '..' : '../label'}
            relative="path"
            className="mt-4 inline-block text-sm font-medium text-amber-700 hover:underline"
          >
            {stats.data.uncertainties.length > 0 ? 'Go to rows →' : 'Go to labelling →'}
          </Link>
        </div>
      )}
    </div>
  )
}

function Card({
  projectId,
  row,
  rules,
  isClassification,
  onDone,
}: {
  projectId: string
  row: Row
  rules: RuleSet['rules']
  isClassification: boolean
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

  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<ReviewResult>(base, {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          seconds_spent: Math.round((Date.now() - shownAt.current) / 1000),
        }),
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
    if (action === 'approve') submit.mutate({ action: 'approve' })
    else if (action === 'reject') submit.mutate({ action: 'reject' })
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

  return (
    <>
      <article className="space-y-4 rounded-lg border border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span>
            Row {row.row_index + 1} · Cluster {row.cluster_id}
          </span>
          <span>Uncertainty {label.uncertainty?.toFixed(2)}</span>
        </div>
        <section>
          <h3 className="text-xs font-medium tracking-wide text-stone-500 uppercase">Input</h3>
          <p className="mt-1 whitespace-pre-line">{inputText(row.input)}</p>
        </section>
        <section>
          <h3 className="text-xs font-medium tracking-wide text-stone-500 uppercase">
            Proposed output
          </h3>
          <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 font-medium whitespace-pre-line">
            {valueText(label.expected_output)}
          </p>
          {label.rationale && <p className="mt-2 text-sm text-stone-600">{label.rationale}</p>}
        </section>
        <section className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2">
          <h3 className="text-xs font-medium text-amber-800">Why you're seeing this</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-stone-700">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      </article>

      {/* Bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur">
        <div className="mx-auto max-w-5xl space-y-3 px-6 py-4">
          {mode === 'edit' && (
            <label className="block text-sm font-medium">
              New expected output{' '}
              <span className="font-normal text-stone-500">(Enter to save, Esc to cancel)</span>
              <textarea
                ref={editRef}
                className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 font-normal"
                rows={3}
                value={edit}
                onChange={(e) => setEdit(e.target.value)}
                onKeyDown={textKeys('edit')}
              />
            </label>
          )}
          {mode === 'preview' && preview && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
              <p className="text-xs font-medium text-stone-500">New version</p>
              <p className="mt-1 font-medium whitespace-pre-line">{preview.expected_output}</p>
              <p className="mt-1 text-stone-600">{preview.rationale}</p>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={applySimilar}
                  onChange={(e) => setApplySimilar(e.target.checked)}
                />
                Also apply this instruction to the 10 most similar unreviewed rows
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {mode === 'preview' ? (
              <>
                <Btn primary onClick={() => run('submit', null)} disabled={busy}>
                  Accept <Kbd>Enter</Kbd>
                </Btn>
                <Btn onClick={() => run('cancel', null)}>
                  Discard <Kbd>Esc</Kbd>
                </Btn>
              </>
            ) : mode === 'edit' ? (
              <>
                <Btn primary onClick={() => run('submit', 'edit')} disabled={busy || !edit.trim()}>
                  Save edit <Kbd>Enter</Kbd>
                </Btn>
                <Btn onClick={() => run('cancel', null)}>
                  Cancel <Kbd>Esc</Kbd>
                </Btn>
              </>
            ) : (
              <>
                <Btn primary onClick={() => run('approve', null)} disabled={busy}>
                  Approve <Kbd>A</Kbd>
                </Btn>
                <Btn onClick={() => run('reject', null)} disabled={busy}>
                  Reject <Kbd>R</Kbd>
                </Btn>
                <Btn onClick={() => run('edit', null)} disabled={busy}>
                  Edit <Kbd>E</Kbd>
                </Btn>
                <input
                  aria-label="Instruction for the model"
                  className="min-w-64 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  placeholder="Or tell the model what to change, e.g. “be stricter about tone” (Enter)"
                  value={instruction}
                  maxLength={2000}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={textKeys('instruction')}
                />
              </>
            )}
            {instruct.isPending && (
              <span className="text-sm text-stone-500">Asking the model…</span>
            )}
          </div>
          {(submit.error || instruct.error) && (
            <p className="text-sm text-red-600">{(submit.error ?? instruct.error)?.message}</p>
          )}
        </div>
      </div>
    </>
  )
}

function Btn({
  primary,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      {...props}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
        primary
          ? 'bg-amber-500 text-white hover:bg-amber-600'
          : 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
      }`}
    >
      {children}
    </button>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-current/30 px-1 font-mono text-[10px] opacity-70">
      {children}
    </kbd>
  )
}
