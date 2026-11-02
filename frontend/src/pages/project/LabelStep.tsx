import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { api, type Job, type LabelStats, type Project } from '../../api/client'
import { useJob } from '../../lib/useJob'

export default function LabelStep() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const [jobId, setJobId] = useState<string | null>(null)
  const [cheap, setCheap] = useState(false)
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
    }
  }, [status, projectId, queryClient])

  const start = useMutation({
    mutationFn: () =>
      api<Job>(`/projects/${projectId}/label`, {
        method: 'POST',
        body: JSON.stringify({ cheap }),
      }),
    onSuccess: (j) => setJobId(j.id),
  })

  if (stats.isPending) return <p className="text-stone-500">Loading…</p>
  if (stats.error) return <p className="text-red-600">{stats.error.message}</p>
  const counts = stats.data.counts
  const labelled = stats.data.uncertainties.length > 0

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <p className="text-sm text-stone-600">
          The model labels every row except seeds and duplicates, using your rules and seed labels
          as examples. Each row gets an uncertainty score, and only uncertain rows go to review.
          Rows you've already reviewed are never relabelled.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            disabled={running || start.isPending}
            onClick={() => start.mutate()}
          >
            {labelled ? 'Relabel rows' : 'Start labelling'}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cheap} onChange={(e) => setCheap(e.target.checked)} />
            Cheap mode (1 sample per row, skips the disagreement check)
          </label>
        </div>
        {running && (
          <div>
            <p className="text-sm text-stone-600">Labelling… {job.data?.progress ?? 0}%</p>
            <div className="mt-1 h-2 overflow-hidden rounded bg-stone-100">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${job.data?.progress ?? 0}%` }}
              />
            </div>
          </div>
        )}
        {start.error && <p className="text-sm text-red-600">{start.error.message}</p>}
        {job.data?.error && (
          <p className={`text-sm ${status === 'failed' ? 'text-red-600' : 'text-amber-700'}`}>
            {job.data.error}
          </p>
        )}
      </section>

      {labelled && (
        <ThresholdPanel
          key={stats.data.threshold}
          projectId={projectId}
          stats={stats.data}
          seeds={counts.approved ?? 0}
        />
      )}
      {(counts.unlabelled ?? 0) > 0 && labelled && (
        <p className="text-sm text-stone-500">{counts.unlabelled} rows are still unlabelled.</p>
      )}
    </div>
  )
}

function ThresholdPanel({
  projectId,
  stats,
  seeds,
}: {
  projectId: string
  stats: LabelStats
  seeds: number
}) {
  const queryClient = useQueryClient()
  const [threshold, setThreshold] = useState(stats.threshold)
  const toReview = stats.uncertainties.filter((u) => u >= threshold).length
  const auto = stats.uncertainties.length - toReview

  const save = useMutation({
    mutationFn: (value: number) =>
      api<Project>(`/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ review_threshold: value }),
      }),
    onSuccess: (project) => {
      queryClient.setQueryData(['project', projectId], project)
      queryClient.invalidateQueries({ queryKey: ['label-stats', projectId] })
      queryClient.invalidateQueries({ queryKey: ['rows', projectId] })
    },
  })
  const commit = () => threshold !== stats.threshold && save.mutate(threshold)

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="To review" value={toReview} accent />
        <Stat label="Auto-accepted" value={auto} />
        <Stat label="Seeds and reviewed" value={seeds} />
      </div>
      <label className="block text-sm">
        <span className="flex justify-between">
          <span className="font-medium">Review threshold: {threshold.toFixed(2)}</span>
          <span className="text-stone-500">Lower = safer, more review · Higher = faster</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={threshold}
          className="mt-2 w-full accent-amber-500"
          onChange={(e) => setThreshold(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
        />
      </label>
      {save.error && <p className="text-sm text-red-600">{save.error.message}</p>}
    </section>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className={`text-2xl font-semibold ${accent ? 'text-amber-600' : ''}`}>{value}</div>
      <div className="text-sm text-stone-500">{label}</div>
    </div>
  )
}
