import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createTestEnv } from './test-helper.js'

describe('Organizations Management (/organizations)', () => {
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

  describe('GET /organizations', () => {
    test('returns 200 with empty list when no organizations exist', async () => {
      const res = await env.request('/organizations')
      assert.equal(res.status, 200)
      assert.deepEqual(res.body.organizations, [])
    })

    test('returns 200 with organizations sorted by name ASC', async () => {
      const now = new Date().toISOString()
      env.db.prepare(`INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)`).run('Escola B', 'Uberaba', now)
      env.db.prepare(`INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)`).run('Escola A', 'Uberaba', now)

      const res = await env.request('/organizations')
      assert.equal(res.status, 200)
      assert.equal(res.body.organizations.length, 2)
      assert.equal(res.body.organizations[0].name, 'Escola A')
      assert.equal(res.body.organizations[1].name, 'Escola B')
    })
  })

  describe('POST /organizations', () => {
    test('fails with 401 when no auth token is provided', async () => {
      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: 'Escola Modelo', city: 'Uberaba' }
      })
      assert.equal(res.status, 401)
      assert.equal(res.body.code, 'UNAUTHORIZED')
    })

    test('fails with 403 when regular user attempts to register organization', async () => {
      const user = env.createUser()
      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: 'Escola Modelo', city: 'Uberaba' },
        token: user.token
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.code, 'INSUFFICIENT_PERMISSIONS')
    })

    test('fails with 403 when staff lacks organizations.manage permission', async () => {
      const staff = env.createStaff(['items.view', 'items.create'])
      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: 'Escola Modelo', city: 'Uberaba' },
        token: staff.token
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.code, 'INSUFFICIENT_PERMISSIONS')
    })

    test('successfully creates organization when admin requests', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: 'IFTM UPT Unidade I', city: 'Uberaba' },
        token: admin.token
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.name, 'IFTM UPT Unidade I')
      assert.equal(res.body.city, 'Uberaba')
      assert.ok(res.body.id)
      assert.ok(res.body.createdAt)

      const inDb = env.db.prepare('SELECT * FROM organizations WHERE name = ?').get('IFTM UPT Unidade I')
      assert.ok(inDb)
      assert.equal(inDb.city, 'Uberaba')
    })

    test('successfully creates organization when staff has organizations.manage permission', async () => {
      const staff = env.createStaff(['organizations.manage'])
      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: 'Escola Estadual Minas', city: 'Uberaba' },
        token: staff.token
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.name, 'Escola Estadual Minas')
    })

    test('fails with 400 when organization parameters are invalid', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: '' },
        token: admin.token
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.code, 'INVALID_PARAMETERS')
    })

    test('fails with 409 when organization name already exists', async () => {
      const admin = env.createAdmin()
      env.db.prepare(`INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)`).run('Escola Repetida', 'Uberaba', new Date().toISOString())

      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: 'Escola Repetida', city: 'Uberaba' },
        token: admin.token
      })

      assert.equal(res.status, 409)
      assert.equal(res.body.code, 'ORGANIZATION_ALREADY_EXISTS')
    })

    test('fails with 400 on invalid JSON format', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/organizations', {
        method: 'POST',
        rawBody: 'invalid-json',
        token: admin.token
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.code, 'INVALID_PAYLOAD')
    })
  })

  describe('DELETE /organizations', () => {
    test('fails with 401 when unauthenticated', async () => {
      const res = await env.request('/organizations', {
        method: 'DELETE',
        body: { id: 1 }
      })
      assert.equal(res.status, 401)
      assert.equal(res.body.code, 'UNAUTHORIZED')
    })

    test('fails with 403 when user lacks organizations.manage permission', async () => {
      const user = env.createUser()
      const res = await env.request('/organizations', {
        method: 'DELETE',
        body: { id: 1 },
        token: user.token
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.code, 'INSUFFICIENT_PERMISSIONS')
    })

    test('fails with 404 when organization is not found by ID', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/organizations', {
        method: 'DELETE',
        body: { id: 99999 },
        token: admin.token
      })
      assert.equal(res.status, 404)
      assert.equal(res.body.code, 'NOT_FOUND')
    })

    test('fails with 409 when organization has linked items in database', async () => {
      const admin = env.createAdmin()
      const now = new Date().toISOString()
      const orgResult = env.db.prepare(`INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)`).run('Org Vinculada', 'Uberaba', now)
      const orgId = Number(orgResult.lastInsertRowid)

      env.db.prepare(`
        INSERT INTO items (uuid, name, owner, weight, state, organization, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('ITEM-1', 'Monitor', 'owner', 2.5, 'State', 'Org Vinculada', now)

      const res = await env.request('/organizations', {
        method: 'DELETE',
        body: { id: orgId },
        token: admin.token
      })

      assert.equal(res.status, 409)
      assert.equal(res.body.code, 'ORGANIZATION_LINKED_DEVICES')
    })

    test('successfully deletes organization by ID when no items are linked', async () => {
      const admin = env.createAdmin()
      const now = new Date().toISOString()
      const orgResult = env.db.prepare(`INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)`).run('Org Sem Itens', 'Uberaba', now)
      const orgId = Number(orgResult.lastInsertRowid)

      const res = await env.request('/organizations', {
        method: 'DELETE',
        body: { id: orgId },
        token: admin.token
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.ok, true)

      const inDb = env.db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId)
      assert.equal(inDb, undefined)
    })
  })
})
