import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { api, type Report } from '../../api/client'
import Icon from '../../components/Icon'
import { ErrorText, Loading, PageHeader, Stat } from '../../components/ui'

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)

export default function ReportStep() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const report = useQuery({
    queryKey: ['report', projectId],
    queryFn: () => api<Report>(`/projects/${projectId}/report`),
  })
  const audit = useMutation({
    mutationFn: () => api<{ sampled: number }>(`/projects/${projectId}/audit`, { method: 'POST' }),
    onSuccess: () => {
      for (const key of ['report', 'label-stats', 'review', 'rows'])
        queryClient.invalidateQueries({ queryKey: [key, projectId] })
    },
  })

  const r = report.data
  const s = r?.status ?? {}
  const maxRows = Math.max(1, ...(r?.coverage.map((c) => c.rows) ?? []))
  const flagged = r?.coverage.filter((c) => c.flagged).length ?? 0
  const auditPending = r ? r.audit.sampled - r.audit.reviewed : 0

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8 md:px-10">
      <PageHeader
        kicker={<span className="mono-label">06 · Report</span>}
        title="How golden is it?"
        description="What the model did, what you changed, and an honest estimate of quality for the rows nobody reviewed. Rejected rows are left out of the export."
        actions={
          <div className="flex gap-2">
            {(['jsonl', 'csv'] as const).map((f) => (
              // Plain link: the browser downloads the zip with the session cookie.
              <a
                key={f}
                href={`/api/projects/${projectId}/export?format=${f}`}
                className={f === 'jsonl' ? 'btn-primary' : 'btn-secondary'}
              >
                <Icon name="download" size={14} />
                Export {f.toUpperCase()}
              </a>
            ))}
          </div>
        }
      />
      {report.isPending && <Loading />}
      {report.error && <ErrorText>{report.error.message}</ErrorText>}

      {r && (
        <>
          <section className="card p-4">
            <div className="grid grid-cols-2 divide-line rounded-xl bg-sunken md:grid-cols-4 md:divide-x">
              <Stat label="Rows" value={r.total_rows} />
              <Stat label="Duplicates removed" value={r.duplicates} />
              <Stat label="Review change rate" value={pct(r.review_rate)} />
              <Stat label="Human minutes" value={r.human_minutes} />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="card p-6">
              <h2 className="text-[15px] font-semibold">Where labels came from</h2>
              <dl className="mt-4 divide-y divide-line text-[13px]">
                {[
                  ['Seeds you labelled', r.seeds],
                  ['Auto-accepted', s.auto_accepted ?? 0],
                  ['Waiting for review', s.needs_review ?? 0],
                  ['Approved', s.approved ?? 0],
                  ['Edited', s.edited ?? 0],
                  ['Rejected', s.rejected ?? 0],
                  ['Unlabelled', r.unlabelled],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="card flex flex-col p-6">
              <h2 className="text-[15px] font-semibold">Audit estimate</h2>
              <p className="mt-1 text-[13px] text-muted">
                Review 10 random auto-accepted rows. How many you change is an honest estimate of
                quality for everything nobody looked at.
              </p>
              <div className="mt-5 rounded-xl bg-sunken px-4 py-4">
                {r.audit.reviewed > 0 ? (
                  <>
                    <p className="text-[28px] font-semibold tracking-[-0.03em] tabular-nums">
                      {pct(1 - r.audit.changed / r.audit.reviewed)}
                    </p>
                    <p className="text-[13px] text-muted">
                      of audited rows were right ({r.audit.changed} of {r.audit.reviewed} needed
                      changes)
                    </p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted">No audit yet.</p>
                )}
              </div>
              <div className="mt-auto pt-5">
                {auditPending > 0 ? (
                  <Link to="../review" relative="path" className="btn-primary">
                    Review {auditPending} audit rows <Icon name="chevron-right" size={14} />
                  </Link>
                ) : (
                  <button
                    className="btn-secondary"
                    disabled={audit.isPending || !s.auto_accepted}
                    onClick={() => audit.mutate()}
                  >
                    <Icon name="check-check" size={14} />
                    {r.audit.sampled ? 'Audit 10 more' : 'Start audit'}
                  </button>
                )}
                {audit.error && <ErrorText>{audit.error.message}</ErrorText>}
              </div>
            </div>
          </section>

          <section className="card p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">Coverage by cluster</h2>
              <span className="text-[12px] text-muted">
                {flagged ? `${flagged} with too few human-checked rows` : 'Every cluster checked'}
              </span>
            </div>
            <ul className="mt-4 space-y-2">
              {r.coverage.map((c) => (
                <li
                  key={c.cluster_id}
                  className="grid grid-cols-[72px_1fr_88px] items-center gap-3"
                >
                  <span className="text-[12px] text-muted">Cluster {c.cluster_id}</span>
                  <div className="relative h-5 overflow-hidden rounded-md bg-sunken">
                    <div
                      className="absolute inset-y-0 left-0 rounded-md bg-line-strong"
                      style={{ width: `${(c.rows / maxRows) * 100}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-md bg-ink"
                      style={{ width: `${(c.human / maxRows) * 100}%` }}
                    />
                  </div>
                  <span
                    className={`text-right text-[12px] tabular-nums ${c.flagged ? 'font-medium text-alert' : 'text-muted'}`}
                  >
                    {c.human}/{c.rows} checked
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-center gap-4 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-ink" /> Human-checked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-line-strong" /> All rows
              </span>
            </p>
          </section>
        </>
      )}
    </div>
  )
}
