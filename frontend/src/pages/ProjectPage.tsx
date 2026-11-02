import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { api, type Project } from '../api/client'
import RowsTable from '../components/RowsTable'
import UploadPanel from '../components/UploadPanel'

export default function ProjectPage() {
  const { projectId = '' } = useParams()
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
  })

  if (project.isPending) return <p className="text-stone-500">Loading…</p>
  if (project.error) return <p className="text-red-600">{project.error.message}</p>

  return (
    <div className="space-y-8">
      <div>
        <Link to="/" className="text-sm text-stone-500 hover:underline">
          ← Projects
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{project.data.name}</h1>
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Upload data</h2>
        <UploadPanel projectId={projectId} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Rows</h2>
        <RowsTable projectId={projectId} />
      </section>
    </div>
  )
}
