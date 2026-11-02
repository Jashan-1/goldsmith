import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Route, Routes, useLocation, useMatch } from 'react-router'
import { api, ApiError, type LabelStats, type Project, type User } from './api/client'
import Icon from './components/Icon'
import { STEPS } from './lib/steps'
import DataStep from './pages/project/DataStep'
import LabelStep from './pages/project/LabelStep'
import ReviewStep from './pages/project/ReviewStep'
import RulesStep from './pages/project/RulesStep'
import SeedsStep from './pages/project/SeedsStep'
import ProjectPage from './pages/ProjectPage'
import ProjectsPage from './pages/ProjectsPage'
import SignInPage from './pages/SignInPage'

export default function App() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me') })

  if (me.isPending) return <Centered>Loading…</Centered>
  if (me.error instanceof ApiError && me.error.status === 401) return <SignInPage />
  if (me.error) return <Centered>Can't reach the API: {me.error.message}</Centered>

  return (
    <div className="flex min-h-screen">
      <Sidebar user={me.data} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-w-0 flex-1">
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectPage />}>
              <Route index element={<DataStep />} />
              <Route path="rules" element={<RulesStep />} />
              <Route path="seeds" element={<SeedsStep />} />
              <Route path="label" element={<LabelStep />} />
              <Route path="review" element={<ReviewStep />} />
            </Route>
            <Route path="*" element={<ProjectsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function useProjectId(): string | null {
  return useMatch('/projects/:projectId/*')?.params.projectId ?? null
}

function Sidebar({ user }: { user: User }) {
  const queryClient = useQueryClient()
  const projectId = useProjectId()
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
    enabled: !!projectId,
  })
  const stats = useQuery({
    queryKey: ['label-stats', projectId],
    queryFn: () => api<LabelStats>(`/projects/${projectId}/label/stats`),
    enabled: !!projectId,
  })
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: () => queryClient.clear(),
  })
  const toReview = stats.data?.counts.needs_review ?? 0

  const item = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
      isActive ? 'bg-hover font-medium text-ink' : 'text-ink-soft hover:bg-hover'
    }`

  return (
    <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line bg-sunken px-3 py-4 md:flex">
      <Link
        to="/"
        className="flex items-center gap-2 px-2 text-[15px] font-semibold tracking-[-0.03em]"
      >
        <span className="grid size-6 place-items-center rounded-md bg-ink text-[13px] text-[#f5cd5b]">
          ✦
        </span>
        Goldsmith
      </Link>

      <nav className="mt-6 grid gap-0.5">
        <NavLink to="/" end className={item}>
          <Icon name="layers" className="text-muted" />
          Datasets
        </NavLink>
      </nav>

      {projectId && (
        <>
          <p className="mt-6 truncate px-2.5 text-[11px] font-medium tracking-wide text-faint uppercase">
            {project.data?.name ?? 'Dataset'}
          </p>
          <nav className="mt-1.5 grid gap-0.5">
            {STEPS.map((s) => (
              <NavLink
                key={s.to}
                to={`/projects/${projectId}${s.to ? `/${s.to}` : ''}`}
                end={!s.to}
                className={item}
              >
                <Icon name={s.icon} className="text-muted" />
                <span className="flex-1">{s.label}</span>
                {s.to === 'review' && toReview > 0 && (
                  <span className="grid min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[11px] font-semibold text-white tabular-nums">
                    {toReview}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </>
      )}

      <div className="mt-auto flex items-center gap-2.5 rounded-lg px-2 py-2">
        <span className="grid size-7 place-items-center rounded-full bg-gold-soft text-[11px] font-semibold text-gold">
          {user.email.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{user.email}</span>
        <button
          className="btn-ghost px-1.5 py-1.5"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => logout.mutate()}
        >
          <Icon name="log-out" size={15} />
        </button>
      </div>
    </aside>
  )
}

function TopBar() {
  const projectId = useProjectId()
  const { pathname } = useLocation()
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
    enabled: !!projectId,
  })
  const stepPath = projectId ? (pathname.split('/')[3] ?? '') : null
  const step = STEPS.find((s) => s.to === stepPath)

  return (
    <div className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-line bg-canvas/85 px-6 backdrop-blur">
      <nav className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
        <Link to="/" className="md:hidden">
          ✦
        </Link>
        <Link to="/" className="hover:text-ink">
          Datasets
        </Link>
        {projectId && (
          <>
            <span className="text-faint">/</span>
            <Link to={`/projects/${projectId}`} className="truncate hover:text-ink">
              {project.data?.name ?? '…'}
            </Link>
            {step && (
              <>
                <span className="text-faint">/</span>
                <span className="text-ink">{step.label}</span>
              </>
            )}
          </>
        )}
      </nav>
      <a
        href="https://github.com/Jashan-1/goldsmith"
        target="_blank"
        rel="noreferrer"
        className="text-[13px] text-muted hover:text-ink"
      >
        Docs
      </a>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-[13px] text-muted">
      {children}
    </div>
  )
}
