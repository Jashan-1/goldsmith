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
    <div className="mx-auto max-w-6xl px-6 pt-8 pb-20 md:px-10">
      <section className="relative overflow-hidden rounded-[28px] border border-line bg-[radial-gradient(120%_90%_at_50%_0%,#ffffff_0%,#f4f3ef_55%,#ebe8e1_100%)] px-6 pt-16 pb-0 text-center md:px-12">
        <a
          href="https://github.com/Jashan-1/goldsmith"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-[12px] text-muted backdrop-blur hover:text-ink"
        >
          <span className="size-1.5 rounded-full bg-ok" /> Open source · Apache-2.0
          <Icon name="chevron-right" size={12} />
        </a>
        <h1 className="mx-auto mt-6 max-w-3xl text-[44px] leading-[1.02] font-semibold tracking-[-0.05em] md:text-[64px]">
          Golden eval datasets,
          <br />
          without the guesswork
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
          Label ten rows. Goldsmith labels the rest, asks you only about the ones it&apos;s unsure
          of, and measures how golden the result really is.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <button
            className="btn-primary px-5 py-3 text-[14px]"
            onClick={() => document.getElementById('project-name')?.focus()}
          >
            New dataset <Icon name="chevron-right" size={14} />
          </button>
          <a
            href="https://github.com/Jashan-1/goldsmith"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary px-5 py-3 text-[14px]"
          >
            <Icon name="github" size={15} /> Star on GitHub
          </a>
        </div>

        {/* Product preview: an illustrative review card. */}
        <div className="mx-auto mt-14 max-w-3xl translate-y-2 rounded-t-[20px] border border-b-0 border-line bg-surface p-2 pb-0 text-left shadow-[0_30px_80px_rgba(60,50,30,0.14)]">
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="ml-3 text-[11px] text-faint">Review queue · 3 of 12</span>
          </div>
          <div className="grid gap-0 rounded-t-[14px] border border-b-0 border-line md:grid-cols-[220px_1fr]">
            <ul className="hidden border-r border-line md:block">
              {[
                ['bug', 'Tracking number does not work', '83%'],
                ['account', 'Session keeps logging me out', '61%'],
                ['billing', 'Charged twice this month', '44%'],
              ].map(([l, t, u], i) => (
                <li
                  key={t}
                  className={`border-b border-line px-3.5 py-3 ${i === 0 ? 'bg-sunken' : ''}`}
                >
                  <p className="text-[12px] font-semibold">{l}</p>
                  <p className="truncate text-[12px] text-muted">{t}</p>
                  <p className="mt-1 text-[10px] text-faint">{u} unsure</p>
                </li>
              ))}
            </ul>
            <div className="p-5">
              <p className="text-[11px] text-muted">Model label · 83% unsure</p>
              <p className="mt-2 text-[17px] font-semibold tracking-[-0.02em]">
                The tracking number does not work
              </p>
              <div className="mt-3 rounded-xl bg-sunken px-3.5 py-2.5 text-[12px] text-ink-soft">
                Differs from the label in your file (&ldquo;shipping&rdquo;)
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 pb-5">
                <span className="rounded-full bg-ink py-2 text-center text-[12px] font-medium text-white">
                  Approve label
                </span>
                <span className="rounded-full border border-line py-2 text-center text-[12px] font-medium">
                  Reject row
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-16 flex items-end justify-between">
        <h2 className="text-[24px] font-semibold tracking-[-0.035em]">Your datasets</h2>
        <span className="text-[13px] text-muted">{projects.data?.length ?? 0} total</span>
      </div>

      <section className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            <div className="mt-5 mb-6 grid grid-cols-2 divide-x divide-line rounded-xl bg-sunken">
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
            <span className="mt-auto flex items-center justify-center gap-1.5 rounded-[10px] bg-ink py-2.5 text-[13px] font-medium text-white transition-colors group-hover:bg-ink-soft">
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
