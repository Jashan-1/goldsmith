import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Route, Routes } from 'react-router'
import { api, ApiError, type User } from './api/client'
import ProjectsPage from './pages/ProjectsPage'
import SignInPage from './pages/SignInPage'

export default function App() {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me') })
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: () => queryClient.clear(),
  })

  if (me.isPending) return <Centered>Loading…</Centered>
  if (me.error instanceof ApiError && me.error.status === 401) return <SignInPage />
  if (me.error) return <Centered>Can't reach the API: {me.error.message}</Centered>

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="flex items-center justify-between border-b border-stone-200 px-6 py-3">
        <span className="text-lg font-semibold text-amber-600">Goldsmith</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-stone-500">{me.data.email}</span>
          <button className="hover:underline" onClick={() => logout.mutate()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Routes>
          <Route path="*" element={<ProjectsPage />} />
        </Routes>
      </main>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-600">
      {children}
    </div>
  )
}
