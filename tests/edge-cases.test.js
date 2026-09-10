import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createTestEnv } from './test-helper.js'

describe('Server Edge Cases & Boundary Conditions', () => {
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

  describe('Authorization Header & Token Edge Cases', () => {
    test('treats malformed Authorization headers as unauthenticated', async () => {
      const headers = [
        'Bearer',
        'Bearer ',
        'Basic dXNlcjpwYXNz',
        'Token 123456',
        'Bearer invalid-token-xyz',
        'Bearer   extra spaces   '
      ]

      for (const auth of headers) {
        const res = await env.request('/admin/users', {
          headers: { 'Authorization': auth }
        })
        assert.equal(res.status, 401, `Failed for header: "${auth}"`)
      }
    })

    test('rejects token of a deactivated user immediately', async () => {
      const user = env.createUser({
        username: 'ativo@eco.local',
        active: 1
      })

      // Verify token initially works for user-level route
      const res1 = await env.request('/items', {
        method: 'POST',
        body: { name: 'Item 1' },
        token: user.token
      })
      assert.equal(res1.status, 201)

      // Deactivate user in database
      env.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(user.id)

      // Next request with same token must return 401
      const res2 = await env.request('/items', {
        method: 'POST',
        body: { name: 'Item 2' },
        token: user.token
      })
      assert.equal(res2.status, 401)
    })

    test('rejects token when session exists but user was deleted', async () => {
      const user = env.createUser()

      // Temporarily disable foreign keys to simulate orphaned session
      env.db.exec('PRAGMA foreign_keys = OFF;')
      env.db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
      env.db.exec('PRAGMA foreign_keys = ON;')

      const res = await env.request('/items', {
        method: 'POST',
        body: { name: 'Item Orphan' },
        token: user.token
      })
      assert.equal(res.status, 401)
    })
  })

  describe('Unicode, UTF-8 & Special Characters', () => {
    test('handles Portuguese accents, symbols, and emojis in user registration and items', async () => {
      const resReg = await env.request('/register', {
        method: 'POST',
        body: {
          full_name: 'José da Conceição ✨ — 100% Reciclagem',
          username: 'jose.recicla@ecotech.org.br',
          password: 'senha🔑forte!',
          organization: 'Escola São José dos Pinhais (Unidade I)',
          grade: '3º Ano — Técnico em Eletrônica ⚡'
        }
      })
      assert.equal(resReg.status, 201)
      assert.equal(resReg.body.full_name, 'José da Conceição ✨ — 100% Reciclagem')
      assert.equal(resReg.body.organization, 'Escola São José dos Pinhais (Unidade I)')

      // Login with the registered user to get session token
      const resLogin = await env.request('/login', {
        method: 'POST',
        body: {
          username: 'jose.recicla@ecotech.org.br',
          password: 'senha🔑forte!'
        }
      })
      assert.equal(resLogin.status, 200)
      assert.ok(resLogin.body.token)

      const resItem = await env.request('/items', {
        method: 'POST',
        body: {
          name: 'Micro-ondas Brastemp & Placas Mãe (Várias)',
          owner: 'jose.recicla@ecotech.org.br',
          weight: 12.75,
          organization: 'Escola São José dos Pinhais (Unidade I)'
        },
        token: resLogin.body.token
      })

      assert.equal(resItem.status, 201)
      assert.equal(resItem.body.name, 'Micro-ondas Brastemp & Placas Mãe (Várias)')
    })

    test('handles single and double quotes, angle brackets in names without SQL injection', async () => {
      const admin = env.createAdmin()
      const maliciousName = "Escola ' OR '1'='1' <script>alert(1)</script>"

      const resOrg = await env.request('/organizations', {
        method: 'POST',
        body: { name: maliciousName },
        token: admin.token
      })
      assert.equal(resOrg.status, 201)

      const orgInDb = env.db.prepare('SELECT * FROM organizations WHERE name = ?').get(maliciousName)
      assert.ok(orgInDb)
      assert.equal(orgInDb.name, maliciousName)
    })
  })

  describe('Payload & Numeric Boundaries', () => {
    test('handles floating point weights with high precision correctly', async () => {
      const user = env.createUser({ username: 'peso@eco.local' })
      const res = await env.request('/items', {
        method: 'POST',
        body: {
          name: 'Resistor de Precisão',
          owner: 'peso@eco.local',
          weight: 0.00045
        },
        token: user.token
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.weight, 0.00045)
    })

    test('handles zero weight as default 0', async () => {
      const user = env.createUser({ username: 'zeropeso@eco.local' })
      const res = await env.request('/items', {
        method: 'POST',
        body: {
          name: 'Manual impresso',
          owner: 'zeropeso@eco.local',
          weight: 0
        },
        token: user.token
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.weight, 0)
    })
  })

  describe('Concurrent Operations', () => {
    test('handles simultaneous requests without database locking errors', async () => {
      const admin = env.createAdmin()

      // Concurrently create 20 items
      const requests = Array.from({ length: 20 }, (_, i) => {
        return env.request('/items', {
          method: 'POST',
          body: {
            name: `Aparelho Concorrente ${i + 1}`,
            weight: i + 0.5
          },
          token: admin.token
        })
      })

      const results = await Promise.all(requests)

      for (const res of results) {
        assert.equal(res.status, 201)
      }

      const count = env.db.prepare('SELECT COUNT(*) as count FROM items').get()
      assert.equal(count.count, 20)
    })
  })
})
