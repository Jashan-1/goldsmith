import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

/** Page title block: small kicker, tight headline, muted description, optional actions. */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {kicker && <p className="kicker">{kicker}</p>}
        <h1 className="mt-2 text-[34px] leading-[1.08] font-semibold tracking-[-0.045em]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Friendly empty state: icon tile, short title, one muted line. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <Icon name={icon} />
      </span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      {children && (
        <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted">{children}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'gold' | 'ok' | 'bad' | 'dark'
}) {
  const tones = {
    neutral: 'bg-sunken text-muted',
    gold: 'bg-sunken text-ink',
    ok: 'bg-ok-soft text-ok',
    bad: 'bg-bad-soft text-bad',
    dark: 'bg-ink text-white',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'gold' }) {
  return (
    <div className="px-4 py-3">
      <div
        className={`text-[24px] font-semibold tracking-[-0.03em] tabular-nums ${tone === 'gold' ? 'text-ink' : ''}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[13px] text-muted">{label}</div>
    </div>
  )
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
      <div
        className="h-full rounded-full bg-ink transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-bad">{children}</p>
}

export function Loading() {
  return <p className="py-10 text-center text-[13px] text-muted">Loading…</p>
}
