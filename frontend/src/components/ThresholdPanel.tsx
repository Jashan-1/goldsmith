import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type LabelStats, type Project } from '../api/client'
import { Stat } from './ui'

const BINS = 25

export default function ThresholdPanel({
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

  const bins = Array.from({ length: BINS }, () => 0)
  for (const u of stats.uncertainties) bins[Math.min(BINS - 1, Math.floor(u * BINS))]++
  const peak = Math.max(1, ...bins)

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
      queryClient.invalidateQueries({ queryKey: ['review', projectId] })
    },
  })
  const commit = () => threshold !== stats.threshold && save.mutate(threshold)

  return (
    <section className="card overflow-hidden">
      <div className="m-4 mb-0 grid grid-cols-3 divide-x divide-line rounded-xl bg-sunken">
        <Stat label="To review" value={toReview} tone="gold" />
        <Stat label="Auto-accepted" value={auto} />
        <Stat label="Seeds and approved" value={seeds} />
      </div>
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-medium">
            Review threshold <span className="font-mono text-muted">{threshold.toFixed(2)}</span>
          </span>
          <span className="text-muted">Left: safer, more review · Right: faster</span>
        </div>
        {/* Uncertainty distribution; bars at or above the threshold go to review. */}
        <div className="mt-4 flex h-14 items-end gap-[3px]" aria-hidden="true">
          {bins.map((n, i) => (
            <div
              key={i}
              className={`flex-1 rounded-t-[3px] transition-colors ${
                (i + 1) / BINS > threshold ? 'bg-ink' : 'bg-line-strong'
              }`}
              style={{ height: n ? `${Math.max(8, (100 * n) / peak)}%` : '2px' }}
              title={`${n} rows`}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={threshold}
          aria-label="Review threshold"
          className="mt-1 w-full accent-ink"
          onChange={(e) => setThreshold(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
        />
        <div className="flex justify-between font-mono text-[10px] text-faint">
          <span>0 · certain</span>
          <span>uncertain · 1</span>
        </div>
        {save.error && <p className="mt-2 text-[13px] text-bad">{save.error.message}</p>}
      </div>
    </section>
  )
}
