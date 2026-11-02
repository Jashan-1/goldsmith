import { useState } from 'react'
import type { FieldMapping, Upload } from '../api/client'
import { mappingError, toMapping, toRoles, type Role } from '../lib/mapping'
import Icon from './Icon'
import { Badge, ErrorText } from './ui'

const ROLES: { value: Role; label: string; dot: string }[] = [
  { value: 'input', label: 'Input', dot: 'bg-ink' },
  { value: 'reference', label: 'Reference', dot: 'bg-gold' },
  { value: 'metadata', label: 'Metadata', dot: 'bg-faint' },
  { value: 'ignore', label: 'Ignore', dot: 'bg-line-strong' },
]

function cell(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text && text.length > 90 ? `${text.slice(0, 90)}…` : (text ?? '')
}

export default function MappingForm({
  upload,
  submitting,
  onSubmit,
  onCancel,
}: {
  upload: Upload
  submitting: boolean
  onSubmit: (m: FieldMapping) => void
  onCancel: () => void
}) {
  const [roles, setRoles] = useState(() => toRoles(upload.columns, upload.proposed_mapping))
  const error = mappingError(roles)

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-sunken text-muted">
            <Icon name="file-text" />
          </span>
          <div>
            <p className="text-[14px] font-medium">{upload.filename}</p>
            <p className="text-[12px] text-muted">
              {upload.row_count} rows · <span className="uppercase">{upload.format}</span>
            </p>
          </div>
        </div>
        <p className="text-[13px] text-muted">Tell Goldsmith what each column is for.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line bg-sunken/60">
              {upload.columns.map((c) => {
                const role = ROLES.find((r) => r.value === roles[c])!
                return (
                  <th key={c} className="min-w-40 px-4 py-3 align-top font-normal">
                    <div className="font-mono text-[12px] text-ink">{c}</div>
                    <label className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-1 pl-2">
                      <span className={`size-1.5 rounded-full ${role.dot}`} />
                      <select
                        aria-label={`Use of column ${c}`}
                        className="cursor-pointer bg-transparent pr-1 text-[12px] font-medium outline-none"
                        value={roles[c]}
                        onChange={(e) => setRoles({ ...roles, [c]: e.target.value as Role })}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {upload.preview.map((r, i) => (
              <tr key={i}>
                {upload.columns.map((c) => (
                  <td
                    key={c}
                    className={`px-4 py-2.5 align-top ${roles[c] === 'ignore' ? 'text-faint' : 'text-ink-soft'}`}
                  >
                    {cell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        <button
          className="btn-primary"
          disabled={!!error || submitting}
          onClick={() => onSubmit(toMapping(roles))}
        >
          {submitting ? 'Importing…' : 'Confirm and import'}
        </button>
        <button className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <span className="ml-auto">
          {error ? <ErrorText>{error}</ErrorText> : <Badge tone="ok">Mapping looks good</Badge>}
        </span>
      </div>
    </div>
  )
}
