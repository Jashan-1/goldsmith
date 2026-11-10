import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, type Job, type LabelStats, type Project } from '../../api/client'
import Icon from '../../components/Icon'
import ThresholdPanel from '../../components/ThresholdPanel'
import { ErrorText, Loading, PageHeader, Progress } from '../../components/ui'
import { useJob } from '../../lib/useJob'

const SIGNALS = [
  ['Disagrees with your file', 'The label differs from the one already in your upload.'],
  ['Samples disagree', 'Asked three times, the model gave different answers.'],
  ['Rule concern', 'A guideline is borderline or hard to satisfy for this row.'],
  ['Unfamiliar', 'Unlike anything a human has labelled so far.'],
]

export default function LabelStep() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const [jobId, setJobId] = useState<string | null>(null)
  const [cheap, setCheap] = useState(false)
  const [bestOf, setBestOf] = useState(false)
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
  })
  const textTask = !!project.data && project.data.task_type !== 'classification'
  const stats = useQuery({
    queryKey: ['label-stats', projectId],
    queryFn: () => api<LabelStats>(`/projects/${projectId}/label/stats`),
  })
  const job = useJob(jobId)
  const status = job.data?.status
  const running = !!jobId && status !== 'done' && status !== 'failed'

  useEffect(() => {
    if (status === 'done') {
      queryClient.invalidateQueries({ queryKey: ['label-stats', projectId] })
      queryClient.invalidateQueries({ queryKey: ['rows', projectId] })
      queryClient.invalidateQueries({ queryKey: ['review', projectId] })
    }
  }, [status, projectId, queryClient])

  const start = useMutation({
    mutationFn: () =>
      api<Job>(`/projects/${projectId}/label`, {
        method: 'POST',
        body: JSON.stringify({ cheap, best_of: textTask && bestOf && !cheap }),
      }),
    onSuccess: (j) => setJobId(j.id),
  })

  const counts = stats.data?.counts ?? {}
  const labelled = (stats.data?.uncertainties.length ?? 0) > 0

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8 md:px-10">
      <PageHeader
        kicker={<span className="mono-label">04 · Label dataset</span>}
        title="Let the model do the first pass"
        description="Every row except seeds and duplicates gets a label and an uncertainty score. Only uncertain rows go to your review queue. Rows you've reviewed are never relabelled."
        actions={
          (counts.needs_review ?? 0) > 0 && (
            <Link to="../review" relative="path" className="btn-primary">
              Review {counts.needs_review} rows
              <Icon name="chevron-right" size={14} />
            </Link>
          )
        }
      />
      {stats.isPending && <Loading />}
      {stats.error && <ErrorText>{stats.error.message}</ErrorText>}

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <button
            className="btn-primary"
            disabled={running || start.isPending}
            onClick={() => start.mutate()}
          >
            <Icon name="sparkles" size={14} />
            {running ? 'Labelling…' : labelled ? 'Relabel rows' : 'Start labelling'}
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              className="accent-ink"
              checked={cheap}
              onChange={(e) => setCheap(e.target.checked)}
            />
            Cheap mode: one sample per row, skips the disagreement check
          </label>
          {textTask && (
            <label
              className={`flex items-center gap-2 text-[13px] text-muted ${cheap ? 'opacity-40' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                className="accent-ink"
                checked={bestOf && !cheap}
                disabled={cheap}
                onChange={(e) => setBestOf(e.target.checked)}
              />
              Best of 3: a judge picks the strongest answer (one extra call per row)
            </label>
          )}
        </div>
        {running && (
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-[13px] text-muted">
              <span>Labelling rows…</span>
              <span className="tabular-nums">{job.data?.progress ?? 0}%</span>
            </div>
            <Progress value={job.data?.progress ?? 0} />
          </div>
        )}
        {start.error && (
          <div className="mt-3">
            <ErrorText>{start.error.message}</ErrorText>
          </div>
        )}
        {job.data?.error && (
          <p className={`mt-3 text-[13px] ${status === 'failed' ? 'text-bad' : 'text-gold'}`}>
            {job.data.error}
          </p>
        )}
      </section>

      {stats.data && labelled && (
        <ThresholdPanel
          key={stats.data.threshold}
          projectId={projectId}
          stats={stats.data}
          seeds={counts.approved ?? 0}
        />
      )}
      {labelled && (counts.unlabelled ?? 0) > 0 && (
        <p className="text-[13px] text-muted">{counts.unlabelled} rows are still unlabelled.</p>
      )}

      <section>
        <p className="kicker">What sends a row to review</p>
        <div className="mt-3 grid overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-2">
          {SIGNALS.map(([title, text], i) => (
            <div
              key={title}
              className={`p-5 ${i % 2 ? 'sm:border-l' : ''} ${i > 1 ? 'border-t' : i === 1 ? 'border-t sm:border-t-0' : ''} border-line`}
            >
              <p className="mono-label">{String(i + 1).padStart(2, '0')}</p>
              <p className="mt-3 text-[14px] font-medium">{title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
