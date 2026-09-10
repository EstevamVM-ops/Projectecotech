import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createTestEnv } from './test-helper.js'

describe('Health, CORS & General Routing', () => {
  const env = createTestEnv()

  before(async () => {
    await env.start()
  })

  after(async () => {
    await env.stop()
  })

  beforeEach(() => {
    env.reset()
  })

  test('GET /health returns 200 with ok status and ISO timestamp', async () => {
    const res = await env.request('/health')
    assert.equal(res.status, 200)
    assert.equal(res.body.status, 'ok')
    assert.ok(res.body.timestamp)
    assert.ok(!isNaN(Date.parse(res.body.timestamp)))
  })

  test('GET /api/health (with /api prefix) returns 200 with ok status', async () => {
    const res = await env.request('/api/health')
    assert.equal(res.status, 200)
    assert.equal(res.body.status, 'ok')
    assert.ok(res.body.timestamp)
  })

  test('OPTIONS preflight request returns 204 with CORS headers', async () => {
    const res = await env.request('/api/items', { method: 'OPTIONS' })
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('access-control-allow-origin'), '*')
    assert.ok(res.headers.get('access-control-allow-methods').includes('GET'))
    assert.ok(res.headers.get('access-control-allow-methods').includes('POST'))
    assert.ok(res.headers.get('access-control-allow-methods').includes('DELETE'))
  })

  test('GET non-existent route returns 404 with error message', async () => {
    const res = await env.request('/non-existent-route')
    assert.equal(res.status, 404)
    assert.equal(res.body.error, 'Rota não encontrada.')
  })

  test('POST non-existent route returns 404', async () => {
    const res = await env.request('/api/unknown/action', { method: 'POST', body: { a: 1 } })
    assert.equal(res.status, 404)
    assert.equal(res.body.error, 'Rota não encontrada.')
  })

  test('CORS headers are present on regular responses', async () => {
    const res = await env.request('/health')
    assert.equal(res.headers.get('access-control-allow-origin'), '*')
  })
})
