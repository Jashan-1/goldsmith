import { useState } from 'react'
import type { FieldMapping, Upload } from '../api/client'
import { mappingError, toMapping, toRoles, type Role } from '../lib/mapping'

function cell(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text && text.length > 80 ? `${text.slice(0, 80)}…` : (text ?? '')
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
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        <span className="font-medium text-stone-900">{upload.filename}</span> · {upload.format} ·{' '}
        {upload.row_count} rows. Check what each column is used for.
      </p>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-100">
            <tr>
              {upload.columns.map((c) => (
                <th key={c} className="px-3 py-2 align-top font-medium">
                  <div>{c}</div>
                  <select
                    aria-label={`Use of column ${c}`}
                    className="mt-1 rounded border border-stone-300 bg-white px-1 py-0.5 text-xs font-normal"
                    value={roles[c]}
                    onChange={(e) => setRoles({ ...roles, [c]: e.target.value as Role })}
                  >
                    <option value="input">Input</option>
                    <option value="reference">Reference output</option>
                    <option value="metadata">Metadata</option>
                    <option value="ignore">Ignore</option>
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {upload.preview.map((r, i) => (
              <tr key={i}>
                {upload.columns.map((c) => (
                  <td key={c} className="px-3 py-2 align-top text-stone-700">
                    {cell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          disabled={!!error || submitting}
          onClick={() => onSubmit(toMapping(roles))}
        >
          Confirm and import
        </button>
        <button
          className="rounded-lg px-4 py-2 text-stone-600 hover:bg-stone-100"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
