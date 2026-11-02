import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, type Project, type TaskType } from '../api/client'
import Icon from '../components/Icon'
import { ErrorText, Loading } from '../components/ui'

const TASKS: { value: TaskType; label: string; hint: string }[] = [
  { value: 'classification', label: 'Classification', hint: 'One label per row' },
  { value: 'qa', label: 'Question answering', hint: 'The ideal answer' },
  { value: 'chat', label: 'Chat', hint: 'The next reply' },
]
const TASK_LABEL = Object.fromEntries(TASKS.map((t) => [t.value, t.label])) as Record<
  TaskType,
  string
>
const STEPS = ['Upload your data', 'Label ~10 seed examples', 'Review only uncertain rows']

export default function ProjectsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') })
  const [name, setName] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('classification')

  const create = useMutation({
    mutationFn: () =>
      api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), task_type: taskType }),
      }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/projects/${project.id}`)
    },
  })

  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:px-10">
      <header className="text-center">
        <h1 className="text-[44px] leading-[1.05] font-semibold tracking-[-0.045em] md:text-[52px]">
          Make every example count
        </h1>
        <p className="mt-3 text-[16px] text-muted">
          Label ten rows, review only the ones that matter, export a dataset you can trust.
        </p>
      </header>

      <section className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Featured card: create */}
        <form
          className="flex flex-col rounded-[18px] bg-ink p-6 text-white"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate()
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold">New dataset</p>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px]">Start here</span>
          </div>
          <p className="mt-1 text-[13px] text-white/60">Set up a workspace in a moment.</p>
          <label className="sr-only" htmlFor="project-name">
            Dataset name
          </label>
          <input
            id="project-name"
            className="mt-5 rounded-[10px] border border-white/10 bg-white/5 px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-white/40 focus:border-white/30"
            placeholder="e.g. Support ticket routing"
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="mt-3 grid grid-cols-3 divide-x divide-white/10 rounded-xl bg-white/5">
            {TASKS.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => setTaskType(t.value)}
                className={`px-3 py-2.5 text-left transition-colors first:rounded-l-xl last:rounded-r-xl ${
                  taskType === t.value ? 'bg-white/15' : 'hover:bg-white/10'
                }`}
              >
                <span className="block text-[12px] leading-tight font-medium">{t.label}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-white/50">
                  {t.hint}
                </span>
              </button>
            ))}
          </div>
          <ul className="mt-5 space-y-2 text-[13px] text-white/80">
            {STEPS.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <Icon name="check" size={14} className="text-white/60" /> {s}
              </li>
            ))}
          </ul>
          <button
            className="mt-auto rounded-[10px] bg-white py-2.5 text-[13px] font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ marginTop: 24 }}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create dataset'}
          </button>
          {create.error && <p className="mt-2 text-[13px] text-red-300">{create.error.message}</p>}
        </form>

        {projects.data?.map((p) => (
          <Link
            key={p.id}
            to={`/projects/${p.id}`}
            className="card group flex flex-col p-6 transition-shadow hover:shadow-[0_10px_30px_rgba(10,10,10,0.06)]"
          >
            <p className="text-[15px] font-semibold">{p.name}</p>
            <p className="mt-1 text-[13px] text-muted">{TASK_LABEL[p.task_type]}</p>
            <div className="mt-5 grid grid-cols-2 divide-x divide-line rounded-xl bg-sunken">
              <div className="px-3 py-2.5">
                <p className="text-[14px] font-medium tabular-nums">
                  {p.review_threshold.toFixed(2)}
                </p>
                <p className="text-[11px] text-muted">review threshold</p>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[14px] font-medium">
                  {new Date(p.created_at).toLocaleDateString()}
                </p>
                <p className="text-[11px] text-muted">created</p>
              </div>
            </div>
            <span className="mt-6 flex items-center justify-center gap-1.5 rounded-[10px] bg-ink py-2.5 text-[13px] font-medium text-white transition-colors group-hover:bg-ink-soft">
              Open dataset <Icon name="chevron-right" size={14} />
            </span>
          </Link>
        ))}
      </section>

      {projects.isPending && <Loading />}
      {projects.error && <ErrorText>{projects.error.message}</ErrorText>}
      {projects.data?.length === 0 && (
        <p className="mt-6 text-center text-[13px] text-muted">
          No datasets yet. Create your first one to begin.
        </p>
      )}
    </div>
  )
}
