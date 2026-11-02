import { useEffect, useState } from 'react'
import { getHealth } from './api/client'

export default function App() {
  const [status, setStatus] = useState('Checking API…')

  useEffect(() => {
    getHealth()
      .then((h) => setStatus(h.db ? 'API OK' : 'API OK, database unreachable'))
      .catch(() => setStatus('API unreachable'))
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-900">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-amber-600">Goldsmith</h1>
        <p className="mt-2">{status}</p>
      </div>
    </main>
  )
}
