import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { api, type Job, type LabelStats } from '../../api/client'
import ThresholdPanel from '../../components/ThresholdPanel'
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
