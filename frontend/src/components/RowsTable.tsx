import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type RowsPage } from '../api/client'
import { inputText, STATUS, valueText } from '../lib/rows'
import { Badge, EmptyState, ErrorText, Loading } from './ui'

const PAGE = 50
const TABS = [
  ['', 'All'],
  ['needs_review', 'Needs review'],
  ['auto_accepted', 'Auto-accepted'],
  ['approved', 'Approved'],
  ['edited', 'Edited'],
  ['rejected', 'Rejected'],
  ['unlabelled', 'Unlabelled'],
]

export default function RowsTable({ projectId }: { projectId: string }) {
  const [cluster, setCluster] = useState('')
  const [duplicates, setDuplicates] = useState('include')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)

  const params = new URLSearchParams({ duplicates, offset: String(offset), limit: String(PAGE) })
  if (cluster) params.set('cluster', cluster)
  if (status) params.set('status', status)
  const rows = useQuery({
    queryKey: ['rows', projectId, cluster, duplicates, status, offset],
    queryFn: () => api<RowsPage>(`/projects/${projectId}/rows?${params}`),
    placeholderData: keepPreviousData,
  })

  if (rows.isPending) return <Loading />
  if (rows.error) return <ErrorText>{rows.error.message}</ErrorText>
  const { items, total, clusters, duplicates: dupCount } = rows.data
  const filtered = !!cluster || !!status || duplicates !== 'include'
  if (total === 0 && !filtered)
    return (
      <div className="card">
        <EmptyState icon="database" title="No rows yet">
          Upload a file above and your rows will appear here, grouped and de-duplicated.
        </EmptyState>
      </div>
    )

  const chip = 'field cursor-pointer py-1.5 text-[13px]'
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            className={`rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
              status === value ? 'bg-hover font-medium text-ink' : 'text-muted hover:text-ink'
            }`}
            onClick={() => {
              setStatus(value)
              setOffset(0)
            }}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2 py-1">
          <select
            aria-label="Filter by cluster"
            className={chip}
            value={cluster}
            onChange={(e) => {
              setCluster(e.target.value)
              setOffset(0)
            }}
          >
            <option value="">All clusters</option>
            {clusters.map((c) => (
              <option key={c.cluster_id} value={c.cluster_id}>
                Cluster {c.cluster_id} · {c.count}
              </option>
            ))}
          </select>
          <select
            aria-label="Duplicates"
            className={chip}
            value={duplicates}
            onChange={(e) => {
              setDuplicates(e.target.value)
              setOffset(0)
            }}
          >
            <option value="include">With duplicates</option>
            <option value="exclude">Hide duplicates</option>
            <option value="only">Only duplicates · {dupCount}</option>
          </select>
        </div>
      </div>

      {total === 0 ? (
        <EmptyState icon="search" title="Nothing matches">
          Try another status or cluster.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-muted">
              <tr className="border-b border-line">
                <th className="w-12 px-4 py-2.5 font-normal">#</th>
                <th className="px-4 py-2.5 font-normal">Input</th>
                <th className="px-4 py-2.5 font-normal">From your file</th>
                <th className="px-4 py-2.5 font-normal">Label</th>
                <th className="w-20 px-4 py-2.5 font-normal">Cluster</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((r) => (
                <tr
                  key={r.id}
                  className={`align-top transition-colors hover:bg-sunken/50 ${r.duplicate_of ? 'text-faint' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-[12px] text-faint tabular-nums">
                    {r.row_index + 1}
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <div className="line-clamp-3 whitespace-pre-line">{inputText(r.input)}</div>
                    <div className="mt-1.5 flex gap-1">
                      {r.duplicate_of && <Badge>Duplicate</Badge>}
                      {r.is_seed && <Badge tone="dark">Seed</Badge>}
                    </div>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-muted">
                    <div className="line-clamp-3">{valueText(r.reference_output) || '—'}</div>
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    {r.label ? (
                      <>
                        <div className="line-clamp-3 font-medium">
                          {valueText(r.label.expected_output)}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Badge tone={STATUS[r.label.status]?.tone}>
                            {STATUS[r.label.status]?.label ?? r.label.status}
                          </Badge>
                          {r.label.uncertainty != null && r.label.source !== 'human_seed' && (
                            <span className="font-mono text-[11px] text-faint">
                              u {r.label.uncertainty.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-muted">
                    {r.cluster_id ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[13px] text-muted">
        <span>{total} rows</span>
        {total > PAGE && (
          <div className="flex items-center gap-1">
            <button
              className="btn-ghost px-2 py-1"
              disabled={offset === 0}
              onClick={() => setOffset(offset - PAGE)}
            >
              Previous
            </button>
            <span className="tabular-nums">
              {offset + 1}–{Math.min(offset + PAGE, total)}
            </span>
            <button
              className="btn-ghost px-2 py-1"
              disabled={offset + PAGE >= total}
              onClick={() => setOffset(offset + PAGE)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
