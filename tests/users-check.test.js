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

  test('returns 200 with user data when querying by exact username', async () => {
    env.createUser({
      username: 'maria@ecotech.local',
      fullName: 'Maria Souza',
      organization: 'Escola Central',
      grade: '3º Ano'
    })

    const res = await env.request('/users/check?username=maria@ecotech.local')
    assert.equal(res.status, 200)
    assert.equal(res.body.exists, true)
    assert.equal(res.body.username, 'maria@ecotech.local')
    assert.equal(res.body.full_name, 'Maria Souza')
    assert.equal(res.body.organization, 'Escola Central')
    assert.equal(res.body.grade, '3º Ano')
  })

  test('returns 200 when querying case-insensitively', async () => {
    env.createUser({
      username: 'maria@ecotech.local',
      fullName: 'Maria Souza'
    })

    const res = await env.request('/users/check?username=MARIA@ECOTECH.LOCAL')
    assert.equal(res.status, 200)
    assert.equal(res.body.exists, true)
    assert.equal(res.body.username, 'maria@ecotech.local')
  })

  test('returns 200 when querying with email param alias', async () => {
    env.createUser({
      username: 'joao@ecotech.local',
      fullName: 'João Silva'
    })

    const res = await env.request('/api/users/check?email=joao@ecotech.local')
    assert.equal(res.status, 200)
    assert.equal(res.body.exists, true)
    assert.equal(res.body.username, 'joao@ecotech.local')
  })

  test('returns 200 when querying by full_name', async () => {
    env.createUser({
      username: 'joao@ecotech.local',
      fullName: 'João Pedro da Silva'
    })

    const res = await env.request('/users/check?username=João Pedro da Silva')
    assert.equal(res.status, 200)
    assert.equal(res.body.exists, true)
    assert.equal(res.body.full_name, 'João Pedro da Silva')
  })

  test('returns 404 when user is not found', async () => {
    const res = await env.request('/users/check?username=nobody@ecotech.local')
    assert.equal(res.status, 404)
    assert.equal(res.body.exists, false)
    assert.ok(res.body.error.includes('nobody@ecotech.local'))
  })

  test('returns 400 when neither username nor email param is provided', async () => {
    const res = await env.request('/users/check')
    assert.equal(res.status, 400)
    assert.equal(res.body.exists, false)
    assert.equal(res.body.error, 'Informe um e-mail ou nome de usuário.')
  })
})
