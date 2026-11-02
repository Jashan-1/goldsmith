import { afterEach, expect, test, vi } from 'vitest'
import { getHealth } from './client'

afterEach(() => vi.unstubAllGlobals())

test('getHealth returns parsed body', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"status":"ok","db":true}')),
  )
  expect(await getHealth()).toEqual({ status: 'ok', db: true })
})

test('getHealth throws on HTTP error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 500 })),
  )
  await expect(getHealth()).rejects.toThrow('API error 500')
})
