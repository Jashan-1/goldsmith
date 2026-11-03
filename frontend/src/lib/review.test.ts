import { expect, test } from 'vitest'
import type { LabelInfo } from '../api/client'
import { keyAction, whyReasons } from './review'

test('shortcuts act only when not typing', () => {
  expect(keyAction('a', false, false, 'idle')).toBe('approve')
  expect(keyAction('R', false, false, 'idle')).toBe('reject')
  expect(keyAction('e', false, false, 'idle')).toBe('edit')
  expect(keyAction('a', false, true, 'idle')).toBeNull() // typing an instruction
  expect(keyAction('a', false, false, 'preview')).toBeNull()
})

test('J/K and arrows move through the queue', () => {
  expect(keyAction('j', false, false, 'idle')).toBe('next')
  expect(keyAction('ArrowDown', false, false, 'idle')).toBe('next')
  expect(keyAction('k', false, false, 'idle')).toBe('prev')
  expect(keyAction('ArrowUp', false, false, 'idle')).toBe('prev')
  expect(keyAction('j', false, true, 'idle')).toBeNull()
  expect(keyAction('j', false, false, 'edit')).toBeNull()
})

test('Enter submits text or accepts a preview; Shift+Enter is a newline', () => {
  expect(keyAction('Enter', false, true, 'edit')).toBe('submit')
  expect(keyAction('Enter', true, true, 'edit')).toBeNull()
  expect(keyAction('Enter', false, false, 'preview')).toBe('submit')
  expect(keyAction('Enter', false, false, 'idle')).toBeNull()
})

test('Escape cancels edit or preview', () => {
  expect(keyAction('Escape', false, true, 'edit')).toBe('cancel')
  expect(keyAction('Escape', false, false, 'preview')).toBe('cancel')
  expect(keyAction('Escape', false, false, 'idle')).toBeNull()
})

const label = (breakdown: Record<string, unknown>, uncertainty = 0.7): LabelInfo => ({
  expected_output: 'bug',
  rationale: null,
  source: 'llm',
  status: 'needs_review',
  uncertainty,
  uncertainty_breakdown: breakdown,
})

test('why reasons explain each signal', () => {
  const rules = [{ id: 'r2', kind: 'guardrail' as const, text: 'No medical dosing' }]
  const reasons = whyReasons(
    label({
      signals: { reference: 1, disagreement: 1 / 3, novelty: 0.9 },
      samples: ['bug', 'bug', 'account'],
      rule_concerns: ['r2'],
      stated_confidence: 0.4,
    }),
    rules,
    'account',
    true,
  )
  expect(reasons).toEqual([
    'Differs from the label in your file ("account")',
    '1 of 3 samples disagreed',
    'Possible guardrail issue: No medical dosing',
    'Unlike the rows a human has labelled so far',
    'Model was only 40% confident',
  ])
})

test('why reasons fall back to the score', () => {
  expect(whyReasons(label({ signals: { novelty: 0.2 } }, 0.55), [], null, false)).toEqual([
    'Uncertainty 0.55 is above your threshold',
  ])
  expect(whyReasons(label({ signals: { reference: 0.9 } }), [], 'x', false)[0]).toBe(
    'Differs from the reference answer in your file',
  )
})
