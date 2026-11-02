import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type LabelStats, type Project } from '../api/client'

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
    <section className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="To review" value={toReview} accent />
        <Stat label="Auto-accepted" value={auto} />
        <Stat label="Seeds and approved" value={seeds} />
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
