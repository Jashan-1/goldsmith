import { expect, test } from 'vitest'
import { mappingError, toMapping, toRoles } from './mapping'

const columns = ['question', 'answer', 'category', 'id']

test('roles round-trip to the same mapping', () => {
  const mapping = { input: ['question'], reference_output: 'answer', metadata: ['category'] }
  const roles = toRoles(columns, mapping)
  expect(roles.id).toBe('ignore')
  expect(toMapping(roles)).toEqual(mapping)
})

test('mapping needs an input and at most one reference', () => {
  expect(mappingError({ a: 'metadata' })).toMatch(/input/)
  expect(mappingError({ a: 'input', b: 'reference', c: 'reference' })).toMatch(/at most one/)
  expect(mappingError({ a: 'input', b: 'reference' })).toBeNull()
})
