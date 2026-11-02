import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { api, type Project } from '../api/client'

const STEPS = [
  { to: '', label: '1. Data', end: true },
  { to: 'rules', label: '2. Rules', end: false },
  { to: 'seeds', label: '3. Seeds', end: false },
  { to: 'label', label: '4. Label', end: false },
]

export default function ProjectPage() {
  const { projectId = '' } = useParams()
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
  })

  if (project.isPending) return <p className="text-stone-500">Loading…</p>
  if (project.error) return <p className="text-red-600">{project.error.message}</p>

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-stone-500 hover:underline">
          ← Projects
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{project.data.name}</h1>
      </div>
      <nav className="flex gap-1 border-b border-stone-200">
        {STEPS.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            end={s.end}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 text-sm ${
                isActive
                  ? 'border-amber-500 font-medium text-stone-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`
            }
          >
            {s.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
