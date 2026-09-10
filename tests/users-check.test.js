import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createTestEnv } from './test-helper.js'

describe('User Check Route (/users/check)', () => {
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

  test('returns 200 with user data when querying by exact email', async () => {
    env.createUser({
      username: 'maria@ecotech.local',
      fullName: 'Maria Oliveira',
      organization: 'IFTM Uberaba',
      grade: '3º Informática'
    })

    const res = await env.request('/users/check?email=maria@ecotech.local')

    assert.equal(res.status, 200)
    assert.equal(res.body.exists, true)
    assert.equal(res.body.email, 'maria@ecotech.local')
    assert.equal(res.body.fullName, 'Maria Oliveira')
    assert.equal(res.body.organization, 'IFTM Uberaba')
    assert.equal(res.body.grade, '3º Informática')
  })

  test('returns 404 when user is not found', async () => {
    const res = await env.request('/users/check?email=naoexiste@ecotech.local')

    assert.equal(res.status, 404)
    assert.equal(res.body.exists, false)
    assert.equal(res.body.code, 'NOT_FOUND')
  })

  test('returns 400 when email param is missing', async () => {
    const res = await env.request('/users/check')

    assert.equal(res.status, 400)
    assert.equal(res.body.exists, false)
    assert.equal(res.body.code, 'INVALID_PARAMETERS')
  })
})
