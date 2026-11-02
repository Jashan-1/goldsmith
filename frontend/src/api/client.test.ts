import { afterEach, expect, test, vi } from 'vitest'
import { api, ApiError } from './client'

afterEach(() => vi.unstubAllGlobals())

test('api returns parsed JSON', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"status":"ok"}')),
  )
  expect(await api('/health')).toEqual({ status: 'ok' })
})

test('api surfaces the server detail message', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"detail":"Not signed in"}', { status: 401 })),
  )
  await expect(api('/auth/me')).rejects.toEqual(new ApiError(401, 'Not signed in'))
})

test('api handles empty 204 responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 204 })),
  )
  expect(await api('/auth/logout', { method: 'POST' })).toBeUndefined()
})
