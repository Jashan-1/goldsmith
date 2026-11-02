import { useQuery } from '@tanstack/react-query'
import { Outlet, useParams } from 'react-router'
import { api, type Project } from '../api/client'
import { ErrorText, Loading } from '../components/ui'

/** Guards the dataset routes; navigation lives in the app sidebar. */
export default function ProjectPage() {
  const { projectId = '' } = useParams()
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
  })

  if (project.isPending) return <Loading />
  if (project.error)
    return (
      <div className="p-8">
        <ErrorText>{project.error.message}</ErrorText>
      </div>
    )
  return <Outlet />
}
