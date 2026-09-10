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
      env.db.prepare('INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)').run('Escola Z', 'Uberaba', now)
      env.db.prepare('INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)').run('Escola A', 'Uberaba', now)
      env.db.prepare('INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)').run('Escola M', 'Uberaba', now)

      const res = await env.request('/api/organizations')
      assert.equal(res.status, 200)
      assert.equal(res.body.organizations.length, 3)
      assert.equal(res.body.organizations[0].name, 'Escola A')
      assert.equal(res.body.organizations[1].name, 'Escola M')
      assert.equal(res.body.organizations[2].name, 'Escola Z')
    })
  })

  describe('POST /organizations', () => {
    test('fails with 401 when no auth token is provided', async () => {
      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: 'Nova Escola' }
      })
      assert.equal(res.status, 401)
      assert.equal(res.body.error, 'Não autorizado.')
    })

    test('fails with 403 when regular user attempts to register organization', async () => {
      const user = env.createUser()
      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: 'Nova Escola' },
        token: user.token
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error, 'Sem permissão para gerenciar organizações.')
    })

    test('fails with 403 when staff lacks organizations.manage permission', async () => {
      const staff = env.createStaff(['items.view', 'items.create'])
      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: 'Nova Escola' },
        token: staff.token
      })
      assert.equal(res.status, 403)
    })

    test('successfully creates organization when admin requests', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: 'IFTM Campus Uberaba', city: 'Uberaba' },
        token: admin.token
      })

      assert.equal(res.status, 201)
      assert.ok(res.body.id)
      assert.equal(res.body.name, 'IFTM Campus Uberaba')
      assert.equal(res.body.city, 'Uberaba')
      assert.ok(res.body.createdAt)

      const orgInDb = env.db.prepare('SELECT * FROM organizations WHERE name = ?').get('IFTM Campus Uberaba')
      assert.ok(orgInDb)
    })

    test('successfully creates organization when staff has organizations.manage permission', async () => {
      const staff = env.createStaff(['organizations.manage'])
      const res = await env.request('/api/organizations', {
        method: 'POST',
        body: { name: 'Escola Municipal Triângulo' },
        token: staff.token
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.name, 'Escola Municipal Triângulo')
      assert.equal(res.body.city, 'Uberaba')
    })

    test('fails with 400 when organization name is empty', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: '   ' },
        token: admin.token
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'Nome da organização é obrigatório.')
    })

    test('fails with 409 when organization name already exists (case-insensitive)', async () => {
      const admin = env.createAdmin()
      env.db.prepare('INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)').run('Escola Modelo', 'Uberaba', new Date().toISOString())

      const res = await env.request('/organizations', {
        method: 'POST',
        body: { name: 'ESCOLA MODELO' },
        token: admin.token
      })

      assert.equal(res.status, 409)
      assert.equal(res.body.error, 'Esta organização já está cadastrada.')
    })

    test('fails with 400 on invalid JSON format', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/organizations', {
        method: 'POST',
        rawBody: 'not-json',
        token: admin.token
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'Formato JSON inválido.')
    })
  })

  describe('DELETE /organizations/:id & /organizations/delete', () => {
    test('fails with 401 when unauthenticated', async () => {
      const res = await env.request('/organizations/1', { method: 'DELETE' })
      assert.equal(res.status, 401)
    })

    test('fails with 403 when user lacks organizations.manage permission', async () => {
      const user = env.createUser()
      const res = await env.request('/organizations/1', {
        method: 'DELETE',
        token: user.token
      })
      assert.equal(res.status, 403)
    })

    test('fails with 404 when organization is not found by ID', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/organizations/9999', {
        method: 'DELETE',
        token: admin.token
      })
      assert.equal(res.status, 404)
      assert.equal(res.body.error, 'Organização não encontrada.')
    })

    test('fails with 409 when organization has linked items in database', async () => {
      const admin = env.createAdmin()
      const now = new Date().toISOString()
      const insertOrg = env.db.prepare('INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)').run('Escola Ativa', 'Uberaba', now)
      const orgId = Number(insertOrg.lastInsertRowid)

      env.db.prepare(`
        INSERT INTO items (uuid, name, owner, weight, state, organization, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('ECO-TEST-1', 'Notebook', 'aluno', 2.5, 'Na organização', 'Escola Ativa', now)

      const res = await env.request(`/organizations/${orgId}`, {
        method: 'DELETE',
        token: admin.token
      })

      assert.equal(res.status, 409)
      assert.ok(res.body.error.includes('existem 1 dispositivo(s) vinculado(s)'))

      const stillInDb = env.db.prepare('SELECT id FROM organizations WHERE id = ?').get(orgId)
      assert.ok(stillInDb)
    })

    test('successfully deletes organization by ID when no items are linked', async () => {
      const admin = env.createAdmin()
      const now = new Date().toISOString()
      const insertOrg = env.db.prepare('INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)').run('Escola Vazia', 'Uberaba', now)
      const orgId = Number(insertOrg.lastInsertRowid)

      const res = await env.request(`/organizations/${orgId}`, {
        method: 'DELETE',
        token: admin.token
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.id, orgId)
      assert.ok(res.body.message.includes('excluída com sucesso'))

      const deletedFromDb = env.db.prepare('SELECT id FROM organizations WHERE id = ?').get(orgId)
      assert.equal(deletedFromDb, undefined)
    })

    test('successfully deletes organization using /organizations/delete by name', async () => {
      const admin = env.createAdmin()
      const now = new Date().toISOString()
      env.db.prepare('INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)').run('Escola Por Nome', 'Uberaba', now)

      const res = await env.request('/organizations/delete', {
        method: 'POST',
        body: { name: 'Escola Por Nome' },
        token: admin.token
      })

      assert.equal(res.status, 200)
      const deleted = env.db.prepare('SELECT id FROM organizations WHERE name = ?').get('Escola Por Nome')
      assert.equal(deleted, undefined)
    })
  })
})
