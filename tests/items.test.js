import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createTestEnv } from './test-helper.js'

describe('Items & Products Management (/items)', () => {
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

  describe('GET /items', () => {
    test('returns 200 with empty list when no items exist', async () => {
      const res = await env.request('/items')
      assert.equal(res.status, 200)
      assert.deepEqual(res.body.items, [])
    })

    test('returns 200 with items and owner_name resolved from users table', async () => {
      env.createUser({
        username: 'estudante@ecotech.local',
        fullName: 'Estudante Exemplar'
      })

      const now = new Date().toISOString()
      env.db.prepare(`
        INSERT INTO items (uuid, name, owner, weight, state, organization, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('ECO-1', 'Celular Antigo', 'estudante@ecotech.local', 0.25, 'Na organização', 'Escola 1', now)

      const res = await env.request('/items')
      assert.equal(res.status, 200)
      assert.equal(res.body.items.length, 1)
      assert.equal(res.body.items[0].uuid, 'ECO-1')
      assert.equal(res.body.items[0].name, 'Celular Antigo')
      assert.equal(res.body.items[0].owner, 'estudante@ecotech.local')
      assert.equal(res.body.items[0].owner_name, 'Estudante Exemplar')
      assert.equal(res.body.items[0].weight, 0.25)
      assert.equal(res.body.items[0].state, 'Na organização')
    })

    test('fails with 403 when staff lacks items.view permission', async () => {
      const staff = env.createStaff(['organizations.manage'])
      const res = await env.request('/items', { token: staff.token })
      assert.equal(res.status, 403)
      assert.equal(res.body.error, 'Sem permissão para visualizar aparelhos.')
    })

    test('succeeds with 200 when staff has items.view permission', async () => {
      const staff = env.createStaff(['items.view'])
      const res = await env.request('/api/items', { token: staff.token })
      assert.equal(res.status, 200)
      assert.ok(Array.isArray(res.body.items))
    })
  })

  describe('POST /items', () => {
    test('fails with 401 when no auth token is provided', async () => {
      const res = await env.request('/items', {
        method: 'POST',
        body: { name: 'Monitor LED', weight: 3.2 }
      })
      assert.equal(res.status, 401)
    })

    test('fails with 403 when staff lacks items.create permission', async () => {
      const staff = env.createStaff(['items.view', 'labels.print'])
      const res = await env.request('/items', {
        method: 'POST',
        body: { name: 'Monitor LED', weight: 3.2 },
        token: staff.token
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error, 'Sem permissão para cadastrar aparelhos.')
    })

    test('fails with 400 when item name is missing', async () => {
      const user = env.createUser()
      const res = await env.request('/items', {
        method: 'POST',
        body: { weight: 1.5 },
        token: user.token
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'Nome do aparelho é obrigatório.')
    })

    test('fails with 404 when specified owner email does not exist in users', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/items', {
        method: 'POST',
        body: {
          name: 'Tablet',
          owner: 'naoexiste@ecotech.local',
          weight: 0.5,
          organization: 'Escola Central'
        },
        token: admin.token
      })

      assert.equal(res.status, 404)
      assert.ok(res.body.error.includes('não possui cadastro no sistema'))
    })

    test('successfully registers item when user is registered', async () => {
      const student = env.createUser({
        username: 'alunocadastrado@ecotech.local',
        fullName: 'Aluno Cadastrado'
      })

      const res = await env.request('/items', {
        method: 'POST',
        body: {
          uuid: 'ECO-2026-CUSTOM-ID',
          name: 'Notebook Dell',
          owner: 'alunocadastrado@ecotech.local',
          weight: 2.1,
          state: 'No IFTM UPT',
          organization: 'Escola Modelo'
        },
        token: student.token
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.uuid, 'ECO-2026-CUSTOM-ID')
      assert.equal(res.body.name, 'Notebook Dell')
      assert.equal(res.body.owner, 'alunocadastrado@ecotech.local')
      assert.equal(res.body.weight, 2.1)
      assert.equal(res.body.state, 'No IFTM UPT')
      assert.equal(res.body.organization, 'Escola Modelo')
      assert.ok(res.body.createdAt)

      const inDb = env.db.prepare('SELECT * FROM items WHERE uuid = ?').get('ECO-2026-CUSTOM-ID')
      assert.ok(inDb)
      assert.equal(inDb.name, 'Notebook Dell')
    })

    test('auto-generates uuid when none is provided in payload', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/items', {
        method: 'POST',
        body: { name: 'Teclado USB', weight: 0.4 },
        token: admin.token
      })

      assert.equal(res.status, 201)
      assert.ok(res.body.uuid)
      assert.ok(res.body.uuid.startsWith('ECO-'))
    })
  })

  describe('PATCH & PUT /items/:uuid & /admin/items/state (Status Updates)', () => {
    test('fails with 401 when unauthenticated', async () => {
      const res = await env.request('/items/ECO-1', {
        method: 'PATCH',
        body: { state: 'Desmantelado' }
      })
      assert.equal(res.status, 401)
    })

    test('fails with 403 when user lacks items.status permission', async () => {
      const user = env.createUser()
      const res = await env.request('/items/ECO-1', {
        method: 'PATCH',
        body: { state: 'Desmantelado' },
        token: user.token
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error, 'Sem permissão para alterar o status.')
    })

    test('fails with 404 when item uuid does not exist', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/items/ECO-NONEXISTENT', {
        method: 'PATCH',
        body: { state: 'Coletado pela Cooperu' },
        token: admin.token
      })
      assert.equal(res.status, 404)
      assert.equal(res.body.error, 'Aparelho não encontrado.')
    })

    test('successfully updates item status with staff items.status permission', async () => {
      const staff = env.createStaff(['items.status', 'items.view'])
      env.db.prepare(`
        INSERT INTO items (uuid, name, owner, weight, state, organization, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('ECO-STATUS-1', 'Impressora', 'usuario', 5.0, 'Na organização', 'Org', new Date().toISOString())

      const res = await env.request('/items/ECO-STATUS-1', {
        method: 'PATCH',
        body: { state: 'Coletado pela Cooperu' },
        token: staff.token
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.uuid, 'ECO-STATUS-1')
      assert.equal(res.body.state, 'Coletado pela Cooperu')

      const updated = env.db.prepare('SELECT state FROM items WHERE uuid = ?').get('ECO-STATUS-1')
      assert.equal(updated.state, 'Coletado pela Cooperu')
    })

    test('successfully updates state using /admin/items/state endpoint', async () => {
      const admin = env.createAdmin()
      env.db.prepare(`
        INSERT INTO items (uuid, name, owner, weight, state, organization, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('ECO-STATUS-2', 'Mouse', 'usuario', 0.1, 'Na organização', 'Org', new Date().toISOString())

      const res = await env.request('/admin/items/state', {
        method: 'POST',
        body: { uuid: 'ECO-STATUS-2', state: 'Desmantelado' },
        token: admin.token
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.state, 'Desmantelado')
    })
  })

  describe('DELETE /items/:uuid & /items', () => {
    test('fails with 401 when unauthenticated', async () => {
      const res = await env.request('/items/ECO-1', { method: 'DELETE' })
      assert.equal(res.status, 401)
    })

    test('fails with 403 when user lacks items.delete permission', async () => {
      const user = env.createUser()
      const res = await env.request('/items/ECO-1', {
        method: 'DELETE',
        token: user.token
      })
      assert.equal(res.status, 403)
      assert.equal(res.body.error, 'Sem permissão para excluir aparelhos.')
    })

    test('fails with 404 when target item does not exist', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/items/ECO-NONEXISTENT', {
        method: 'DELETE',
        token: admin.token
      })
      assert.equal(res.status, 404)
      assert.equal(res.body.error, 'Aparelho não encontrado.')
    })

    test('successfully deletes item when admin or staff with items.delete', async () => {
      const staff = env.createStaff(['items.delete'])
      env.db.prepare(`
        INSERT INTO items (uuid, name, owner, weight, state, organization, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('ECO-DEL-1', 'Aparelho Deletar', 'usuario', 1.0, 'Na organização', 'Org', new Date().toISOString())

      const res = await env.request('/items/ECO-DEL-1', {
        method: 'DELETE',
        token: staff.token
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.uuid, 'ECO-DEL-1')
      assert.ok(res.body.message.includes('excluído com sucesso'))

      const inDb = env.db.prepare('SELECT * FROM items WHERE uuid = ?').get('ECO-DEL-1')
      assert.equal(inDb, undefined)
    })
  })
})
