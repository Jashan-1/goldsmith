import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, type Project, type TaskType } from '../api/client'

const TASK_LABELS: Record<TaskType, string> = {
  classification: 'Classification',
  qa: 'Question answering',
  chat: 'Chat',
}

export default function ProjectsPage() {
  const queryClient = useQueryClient()
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') })
  const [name, setName] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('qa')

  const create = useMutation({
    mutationFn: () =>
      api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), task_type: taskType }),
      }),
    onSuccess: () => {
      setName('')
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">New project</h2>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate()
          }}
        >
          <label className="sr-only" htmlFor="project-name">
            Project name
          </label>
          <input
            id="project-name"
            className="min-w-48 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2"
            placeholder="Project name"
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="sr-only" htmlFor="task-type">
            Task type
          </label>
          <select
            id="task-type"
            className="rounded-lg border border-stone-300 bg-white px-3 py-2"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as TaskType)}
          >
            {Object.entries(TASK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            disabled={!name.trim() || create.isPending}
          >
            Create
          </button>
        </form>
        {create.error && <p className="mt-2 text-sm text-red-600">{create.error.message}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Projects</h2>
        {projects.isPending && <p className="text-stone-500">Loading…</p>}
        {projects.error && <p className="text-red-600">{projects.error.message}</p>}
        {projects.data?.length === 0 && (
          <p className="text-stone-500">No projects yet. Create one above.</p>
        )}
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {projects.data?.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-stone-50"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-stone-500">
                  {TASK_LABELS[p.task_type]} · {p.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
