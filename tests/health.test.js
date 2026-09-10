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

  test('GET non-existent route returns 404 with error message', async () => {
    const res = await env.request('/non-existent-route')
    assert.equal(res.status, 404)
    assert.equal(res.body.error, 'Not Found')
  })

  test('POST non-existent route returns 404', async () => {
    const res = await env.request('/unknown/action', { method: 'POST', body: { a: 1 } })
    assert.equal(res.status, 404)
    assert.equal(res.body.error, 'Not Found')
  })

  test('CORS headers are present on regular responses', async () => {
    const res = await env.request('/health')
    assert.equal(res.headers.get('access-control-allow-origin'), '*')
  })
})
