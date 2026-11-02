import { useEffect, useRef, useState } from 'react'
import { api, type User } from '../api/client'
import Icon from './Icon'

async function signOut() {
  await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
  // Full reload so every cached query is dropped and the sign-in page shows.
  window.location.assign('/')
}

/** Avatar (optionally with email) that opens a small menu with Sign out. */
export default function AccountMenu({
  user,
  showEmail = false,
  up = false,
}: {
  user: User
  showEmail?: boolean
  up?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-hover"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-hover text-[11px] font-semibold text-ink ring-1 ring-line">
          {user.email.slice(0, 1).toUpperCase()}
        </span>
        {showEmail && (
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{user.email}</span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-40 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-[0_12px_40px_rgba(10,10,10,0.12)] ${
            up ? 'bottom-full mb-2 left-0' : 'top-full mt-2'
          }`}
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] font-medium">{user.name || 'Signed in'}</p>
            <p className="truncate text-[12px] text-muted">{user.email}</p>
          </div>
          <div className="my-1 border-t border-line" />
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-hover"
            onClick={signOut}
          >
            <Icon name="log-out" size={14} className="text-muted" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
