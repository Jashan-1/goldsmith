import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type RowsPage } from '../api/client'
import { inputText, valueText } from '../lib/rows'

const PAGE = 50

export default function RowsTable({ projectId }: { projectId: string }) {
  const [cluster, setCluster] = useState('')
  const [duplicates, setDuplicates] = useState('include')
  const [offset, setOffset] = useState(0)

  const params = new URLSearchParams({ duplicates, offset: String(offset), limit: String(PAGE) })
  if (cluster) params.set('cluster', cluster)
  const rows = useQuery({
    queryKey: ['rows', projectId, cluster, duplicates, offset],
    queryFn: () => api<RowsPage>(`/projects/${projectId}/rows?${params}`),
    placeholderData: keepPreviousData,
  })

  if (rows.isPending) return <p className="text-stone-500">Loading rows…</p>
  if (rows.error) return <p className="text-red-600">{rows.error.message}</p>
  const { items, total, clusters, duplicates: dupCount } = rows.data
  if (total === 0 && !cluster && duplicates === 'include')
    return <p className="text-stone-500">No rows yet. Upload a file to get started.</p>

  const select = 'rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm'
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          aria-label="Filter by cluster"
          className={select}
          value={cluster}
          onChange={(e) => {
            setCluster(e.target.value)
            setOffset(0)
          }}
        >
          <option value="">All clusters</option>
          {clusters.map((c) => (
            <option key={c.cluster_id} value={c.cluster_id}>
              Cluster {c.cluster_id} ({c.count})
            </option>
          ))}
        </select>
        <select
          aria-label="Duplicates"
          className={select}
          value={duplicates}
          onChange={(e) => {
            setDuplicates(e.target.value)
            setOffset(0)
          }}
        >
          <option value="include">Include duplicates</option>
          <option value="exclude">Hide duplicates</option>
          <option value="only">Only duplicates ({dupCount})</option>
        </select>
        <span className="ml-auto text-stone-500">{total} rows</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-100 text-stone-600">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Input</th>
              <th className="px-3 py-2 font-medium">Reference</th>
              <th className="px-3 py-2 font-medium">Cluster</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {items.map((r) => (
              <tr key={r.id} className={r.duplicate_of ? 'text-stone-400' : ''}>
                <td className="px-3 py-2 align-top">{r.row_index + 1}</td>
                <td className="max-w-md px-3 py-2 align-top">
                  <div className="line-clamp-3 whitespace-pre-line">{inputText(r.input)}</div>
                  {r.duplicate_of && (
                    <span className="mt-1 inline-block rounded bg-stone-100 px-1.5 text-xs">
                      duplicate
                    </span>
                  )}
                </td>
                <td className="max-w-xs px-3 py-2 align-top">
                  <div className="line-clamp-3">{valueText(r.reference_output) || '—'}</div>
                </td>
                <td className="px-3 py-2 align-top">{r.cluster_id ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button
            className="rounded px-2 py-1 hover:bg-stone-100 disabled:opacity-40"
            disabled={offset === 0}
            onClick={() => setOffset(offset - PAGE)}
          >
            Previous
          </button>
          <span className="text-stone-500">
            {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
          </span>
          <button
            className="rounded px-2 py-1 hover:bg-stone-100 disabled:opacity-40"
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
