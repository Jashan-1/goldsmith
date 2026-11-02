import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { api, type Seed } from '../../api/client'
import { inputText, valueText } from '../../lib/rows'

export default function SeedsStep() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const seeds = useQuery({
    queryKey: ['seeds', projectId],
    queryFn: () => api<Seed[]>(`/projects/${projectId}/seeds`),
  })
  const select = useMutation({
    mutationFn: () => api<Seed[]>(`/projects/${projectId}/seeds/select`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['seeds', projectId], data)
      queryClient.invalidateQueries({ queryKey: ['rows', projectId] })
    },
  })

  if (seeds.isPending) return <p className="text-stone-500">Loading…</p>
  if (seeds.error) return <p className="text-red-600">{seeds.error.message}</p>

  const list = seeds.data
  const done = list.filter((s) => s.expected_output != null).length
  const selectButton = (label: string) => (
    <button
      className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
      disabled={select.isPending}
      onClick={() => select.mutate()}
    >
      {select.isPending ? 'Selecting…' : label}
    </button>
  )

  if (list.length === 0)
    return (
      <div className="space-y-3">
        <p className="text-sm text-stone-600">
          Goldsmith picks about 10 varied rows, at least one from each cluster. You label them, and
          they become the examples the model learns from.
        </p>
        {selectButton('Select seeds')}
        {select.error && <p className="text-sm text-red-600">{select.error.message}</p>}
      </div>
    )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium">
            {done} of {list.length} seeds labelled
          </p>
          <div className="mt-1 h-2 overflow-hidden rounded bg-stone-200">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${(100 * done) / list.length}%` }}
            />
          </div>
        </div>
        <button
          className="rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          disabled={select.isPending}
          title="Picks new seeds; labelled ones are kept"
          onClick={() => select.mutate()}
        >
          Reselect unlabelled
        </button>
      </div>
      {select.error && <p className="text-sm text-red-600">{select.error.message}</p>}
      <ul className="space-y-3">
        {list.map((s) => (
          <SeedCard
            key={`${s.row.id}:${valueText(s.expected_output)}`}
            projectId={projectId}
            seed={s}
          />
        ))}
      </ul>
    </div>
  )
}

function SeedCard({ projectId, seed }: { projectId: string; seed: Seed }) {
  const queryClient = useQueryClient()
  const saved = valueText(seed.expected_output)
  // Pre-fill from the uploaded reference so the user only has to correct it.
  const [text, setText] = useState(saved || valueText(seed.row.reference_output))
  const isSaved = seed.expected_output != null && text === saved

  const save = useMutation({
    mutationFn: () =>
      api<Seed>(`/projects/${projectId}/seeds/${seed.row.id}`, {
        method: 'POST',
        body: JSON.stringify({ expected_output: text.trim() }),
      }),
    onSuccess: (updated) =>
      queryClient.setQueryData<Seed[]>(['seeds', projectId], (old) =>
        old?.map((s) => (s.row.id === updated.row.id ? updated : s)),
      ),
  })

  return (
    <li className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-stone-500">
        <span>
          Row {seed.row.row_index + 1} · Cluster {seed.row.cluster_id}
        </span>
        {isSaved && <span className="font-medium text-green-700">✓ Labelled</span>}
      </div>
      <p className="whitespace-pre-line text-sm">{inputText(seed.row.input)}</p>
      <label className="mt-3 block text-xs font-medium text-stone-600">
        Expected output
        <textarea
          className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal text-stone-900"
          rows={Math.min(6, Math.max(2, text.split('\n').length))}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="mt-2 flex items-center gap-2">
        <button
          className="rounded-lg bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-40"
          disabled={!text.trim() || isSaved || save.isPending}
          onClick={() => save.mutate()}
        >
          {isSaved ? 'Saved' : seed.expected_output != null ? 'Update label' : 'Save label'}
        </button>
        {save.error && <span className="text-sm text-red-600">{save.error.message}</span>}
      </div>
    </li>
  )
}
