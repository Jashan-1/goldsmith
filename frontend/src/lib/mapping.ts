import type { FieldMapping } from '../api/client'

export type Role = 'input' | 'reference' | 'metadata' | 'ignore'

export function toRoles(columns: string[], m: FieldMapping): Record<string, Role> {
  return Object.fromEntries(
    columns.map((c) => [
      c,
      m.input.includes(c)
        ? 'input'
        : m.reference_output === c
          ? 'reference'
          : m.metadata.includes(c)
            ? 'metadata'
            : 'ignore',
    ]),
  )
}

export function toMapping(roles: Record<string, Role>): FieldMapping {
  const cols = (role: Role) => Object.keys(roles).filter((c) => roles[c] === role)
  return {
    input: cols('input'),
    reference_output: cols('reference')[0] ?? null,
    metadata: cols('metadata'),
  }
}

export function mappingError(roles: Record<string, Role>): string | null {
  const values = Object.values(roles)
  if (!values.includes('input')) return 'Choose at least one input column.'
  if (values.filter((r) => r === 'reference').length > 1)
    return 'Choose at most one reference output column.'
  return null
}
