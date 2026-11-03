import type { IconName } from '../components/Icon'

export const STEPS: { to: string; label: string; icon: IconName }[] = [
  { to: '', label: 'Data', icon: 'database' },
  { to: 'rules', label: 'Guidelines', icon: 'list-checks' },
  { to: 'seeds', label: 'Seed examples', icon: 'sprout' },
  { to: 'label', label: 'Label dataset', icon: 'sparkles' },
  { to: 'review', label: 'Review queue', icon: 'inbox' },
  { to: 'report', label: 'Report', icon: 'file-text' },
]
