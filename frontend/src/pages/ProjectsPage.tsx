import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, type Project, type TaskType } from '../api/client'
import Icon, { type IconName } from '../components/Icon'
import { EmptyState, ErrorText, Loading } from '../components/ui'

const TASKS: { value: TaskType; label: string; hint: string; icon: IconName }[] = [
  { value: 'classification', label: 'Classification', hint: 'Pick one label per row', icon: 'tag' },
  {
    value: 'qa',
    label: 'Question answering',
    hint: 'Write the ideal answer',
    icon: 'message-square',
  },
  { value: 'chat', label: 'Chat', hint: 'Write the next reply', icon: 'file-text' },
]
const TASK_LABEL = Object.fromEntries(TASKS.map((t) => [t.value, t.label])) as Record<
  TaskType,
  string
>

const FLOW = [
  ['01', 'Upload', 'CSV, JSONL, Q&A pairs or chat logs.'],
  ['02', 'Label ~10 seeds', 'Goldsmith picks varied examples for you.'],
  ['03', 'Review what matters', 'Only rows the model is unsure about.'],
  ['04', 'Export, measured', 'With coverage and accuracy, not vibes.'],
]

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
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <section className="grid items-end gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="kicker">Your evaluation workspace</p>
          <h1 className="mt-2 text-[44px] leading-[1.02] font-semibold tracking-[-0.045em] md:text-[56px]">
            Make every example count.
          </h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted">
            Turn raw conversations into a labelled dataset your agent can learn from, without losing
            the human judgement behind it.
          </p>
        </div>

        <form
          className="card p-5 shadow-[0_12px_40px_rgba(10,10,10,0.05)]"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate()
          }}
        >
          <p className="text-[15px] font-semibold tracking-[-0.02em]">Start a new dataset</p>
          <label className="sr-only" htmlFor="project-name">
            Dataset name
          </label>
          <input
            id="project-name"
            className="field mt-4 w-full"
            placeholder="e.g. Support ticket routing"
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
          <fieldset className="mt-3 grid grid-cols-3 gap-2">
            <legend className="sr-only">Task type</legend>
            {TASKS.map((t) => (
              <label
                key={t.value}
                className={`cursor-pointer rounded-xl border p-2.5 transition-colors ${
                  taskType === t.value
                    ? 'border-ink bg-surface shadow-[0_0_0_1px_var(--color-ink)]'
                    : 'border-line hover:border-line-strong'
                }`}
              >
                <input
                  type="radio"
                  name="task"
                  className="sr-only"
                  checked={taskType === t.value}
                  onChange={() => setTaskType(t.value)}
                />
                <Icon name={t.icon} className="text-muted" />
                <span className="mt-2 block text-[12px] leading-tight font-medium">{t.label}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-muted">{t.hint}</span>
              </label>
            ))}
          </fieldset>
          <button className="btn-primary mt-4 w-full" disabled={!name.trim() || create.isPending}>
            Create dataset
            <Icon name="chevron-right" size={14} />
          </button>
          {create.error && (
            <div className="mt-2">
              <ErrorText>{create.error.message}</ErrorText>
            </div>
          )}
        </form>
      </section>

      <section className="mt-12 grid overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-2 lg:grid-cols-4">
        {FLOW.map(([n, title, text], i) => (
          <div
            key={n}
            className={`p-5 ${i > 0 ? 'border-t border-line sm:border-t-0 sm:border-l' : ''} ${
              i === 2 ? 'sm:border-l-0 sm:border-t lg:border-t-0 lg:border-l' : ''
            } ${i === 3 ? 'sm:border-t lg:border-t-0' : ''}`}
          >
            <p className="mono-label">{n}</p>
            <p className="mt-6 text-[15px] font-semibold tracking-[-0.02em]">{title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{text}</p>
          </div>
        ))}
      </section>

      <section className="mt-14">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-[20px] font-semibold tracking-[-0.03em]">Your datasets</h2>
          <span className="text-[13px] text-muted">{projects.data?.length ?? 0} total</span>
        </div>
        {projects.isPending && <Loading />}
        {projects.error && <ErrorText>{projects.error.message}</ErrorText>}
        {projects.data?.length === 0 && (
          <div className="card">
            <EmptyState icon="layers" title="No datasets yet">
              Create your first dataset above to start building a reliable evaluation set.
            </EmptyState>
          </div>
        )}
        {!!projects.data?.length && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.data.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/projects/${p.id}`}
                  className="group card flex h-full min-h-36 flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_30px_rgba(10,10,10,0.06)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="mono-label">{TASK_LABEL[p.task_type]}</span>
                    <span className="grid size-7 place-items-center rounded-full bg-sunken text-muted transition-colors group-hover:bg-ink group-hover:text-white">
                      <Icon name="chevron-right" size={14} />
                    </span>
                  </div>
                  <p className="mt-auto pt-6 text-[17px] font-semibold tracking-[-0.025em]">
                    {p.name}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    Created {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
