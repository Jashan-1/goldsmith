import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { api, type RowsPage } from '../../api/client'
import Icon from '../../components/Icon'
import RowsTable from '../../components/RowsTable'
import UploadPanel from '../../components/UploadPanel'
import { PageHeader } from '../../components/ui'

export default function DataStep() {
  const { projectId = '' } = useParams()
  // Shares the rows table's first-page cache entry, so this costs no extra request.
  const rows = useQuery({
    queryKey: ['rows', projectId, '', 'include', '', 0],
    queryFn: () =>
      api<RowsPage>(`/projects/${projectId}/rows?duplicates=include&offset=0&limit=50`),
  })
  const hasRows = (rows.data?.total ?? 0) > 0

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8 md:px-10">
      <PageHeader
        kicker={<span className="mono-label">01 · Data</span>}
        title={hasRows ? 'Your data' : 'Bring your data'}
        description="Upload production logs or an existing set. Goldsmith removes near-duplicates and groups similar rows so seeds and coverage can span every kind of input."
        actions={
          hasRows && (
            <Link to="rules" className="btn-primary">
              Next: guidelines
              <Icon name="chevron-right" size={14} />
            </Link>
          )
        }
      />
      <UploadPanel projectId={projectId} compact={hasRows} />
      {hasRows && (
        <section className="card p-4">
          <div className="grid grid-cols-3 rounded-xl bg-sunken">
            <Metric label="Rows" value={rows.data!.total} />
            <Metric label="Near-duplicates" value={rows.data!.duplicates} border />
            <Metric label="Clusters" value={rows.data!.clusters.length} border />
          </div>
        </section>
      )}
      <RowsTable projectId={projectId} />
    </div>
  )
}

function Metric({ label, value, border }: { label: string; value: number; border?: boolean }) {
  return (
    <div className={`px-5 py-4 ${border ? 'border-l border-line' : ''}`}>
      <div className="text-[24px] font-semibold tracking-[-0.03em] tabular-nums">{value}</div>
      <div className="text-[13px] text-muted">{label}</div>
    </div>
  )
}
