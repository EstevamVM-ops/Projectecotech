import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createTestEnv } from './test-helper.js'

describe('Admin Users & Staff Management (/admin/users, /admin/staff)', () => {
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

  describe('GET /admin/users', () => {
    test('fails with 401 when unauthenticated', async () => {
      const res = await env.request('/admin/users')
      assert.equal(res.status, 401)
      assert.equal(res.body.error, 'Não autorizado.')
    })

    test('fails with 403 when called by regular user or staff', async () => {
      const user = env.createUser()
      const res1 = await env.request('/admin/users', { token: user.token })
      assert.equal(res1.status, 403)
      assert.equal(res1.body.error, 'Acesso restrito a administradores.')

      const staff = env.createStaff()
      const res2 = await env.request('/admin/users', { token: staff.token })
      assert.equal(res2.status, 403)
    })

    test('returns 200 with all users and their items_count for admin', async () => {
      const admin = env.createAdmin()
      const student = env.createUser({
        username: 'estudante1@ecotech.local',
        fullName: 'Estudante Um'
      })
      env.createStaff(['items.view'], {
        username: 'staff1@ecotech.local',
        fullName: 'Staff Um'
      })

      // Insert 2 items owned by student
      const now = new Date().toISOString()
      env.db.prepare(`INSERT INTO items (uuid, name, owner, weight, state, organization, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('ITEM-1', 'Cel', 'estudante1@ecotech.local', 0.2, 'State', 'Org', now)
      env.db.prepare(`INSERT INTO items (uuid, name, owner, weight, state, organization, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('ITEM-2', 'Not', 'Estudante Um', 2.0, 'State', 'Org', now)

      const res = await env.request('/admin/users', { token: admin.token })
      assert.equal(res.status, 200)
      assert.ok(Array.isArray(res.body.users))
      assert.equal(res.body.users.length, 3)

      const studentFound = res.body.users.find((u) => u.username === 'estudante1@ecotech.local')
      assert.ok(studentFound)
      assert.equal(studentFound.items_count, 2)
      assert.equal(studentFound.role, 'user')
      assert.equal(studentFound.active, true)
    })
  })

  describe('POST /admin/staff (Create Staff Account)', () => {
    test('fails with 401 when unauthenticated', async () => {
      const res = await env.request('/admin/staff', {
        method: 'POST',
        body: { full_name: 'Novo Staff', email: 's@eco.local', password: 'pass' }
      })
      assert.equal(res.status, 401)
    })

    test('fails with 403 when non-admin attempts staff creation', async () => {
      const staff = env.createStaff()
      const res = await env.request('/admin/staff', {
        method: 'POST',
        body: { full_name: 'Novo Staff', email: 's@eco.local', password: 'pass' },
        token: staff.token
      })
      assert.equal(res.status, 403)
    })

    test('fails with 400 when missing required fields (name, email, password)', async () => {
      const admin = env.createAdmin()
      const res1 = await env.request('/admin/staff', {
        method: 'POST',
        body: { email: 'staff@test.com', password: 'pass' },
        token: admin.token
      })
      assert.equal(res1.status, 400)
      assert.equal(res1.body.error, 'Nome completo é obrigatório.')

      const res2 = await env.request('/admin/staff', {
        method: 'POST',
        body: { full_name: 'Nome', password: 'pass' },
        token: admin.token
      })
      assert.equal(res2.status, 400)
      assert.equal(res2.body.error, 'E-mail e senha são obrigatórios.')
    })

    test('fails with 400 when invalid permissions are provided', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/admin/staff', {
        method: 'POST',
        body: {
          full_name: 'Staff Invalido',
          username: 'invalidperms@ecotech.local',
          password: 'password123',
          permissions: ['items.view', 'superadmin.hack']
        },
        token: admin.token
      })

      assert.equal(res.status, 400)
      assert.ok(res.body.error.includes('Permissões inválidas: superadmin.hack'))
    })

    test('fails with 409 when staff email is already taken', async () => {
      const admin = env.createAdmin()
      env.createUser({ username: 'existente@ecotech.local' })

      const res = await env.request('/admin/staff', {
        method: 'POST',
        body: {
          full_name: 'Staff Duplicado',
          email: 'existente@ecotech.local',
          password: 'password123'
        },
        token: admin.token
      })

      assert.equal(res.status, 409)
      assert.equal(res.body.error, 'Este e-mail já está cadastrado.')
    })

    test('successfully creates staff account with valid permissions', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/admin/staff', {
        method: 'POST',
        body: {
          full_name: 'Prof. Carlos Santos',
          username: 'carlos.staff@ecotech.local',
          password: 'secretPassword123',
          organization: 'IFTM UPT',
          permissions: ['items.view', 'items.create', 'labels.print']
        },
        token: admin.token
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.message, 'Conta de funcionário criada com sucesso!')
      assert.equal(res.body.username, 'carlos.staff@ecotech.local')
      assert.equal(res.body.full_name, 'Prof. Carlos Santos')
      assert.equal(res.body.role, 'staff')
      assert.deepEqual(res.body.permissions, ['items.view', 'items.create', 'labels.print'])

      const inDb = env.db.prepare('SELECT * FROM users WHERE username = ?').get('carlos.staff@ecotech.local')
      assert.ok(inDb)
      assert.equal(inDb.role, 'staff')
      assert.equal(inDb.active, 1)
    })
  })

  describe('PATCH /admin/staff/:id (Update Staff Account)', () => {
    test('fails with 401 when unauthenticated', async () => {
      const res = await env.request('/admin/staff/1', {
        method: 'PATCH',
        body: { active: false }
      })
      assert.equal(res.status, 401)
    })

    test('fails with 404 when target user does not exist or is not role staff', async () => {
      const admin = env.createAdmin()
      const regularUser = env.createUser({ username: 'reg@eco.local' })

      const res1 = await env.request('/admin/staff/99999', {
        method: 'PATCH',
        body: { active: false },
        token: admin.token
      })
      assert.equal(res1.status, 404)
      assert.equal(res1.body.error, 'Funcionário não encontrado.')

      const res2 = await env.request(`/admin/staff/${regularUser.id}`, {
        method: 'PATCH',
        body: { active: false },
        token: admin.token
      })
      assert.equal(res2.status, 404)
    })

    test('fails with 400 when invalid permissions array is provided', async () => {
      const admin = env.createAdmin()
      const staff = env.createStaff(['items.view'])

      const res = await env.request(`/admin/staff/${staff.id}`, {
        method: 'PATCH',
        body: { permissions: ['invalid.perm'] },
        token: admin.token
      })

      assert.equal(res.status, 400)
      assert.ok(res.body.error.includes('Permissões inválidas'))
    })

    test('fails with 400 when body has no updates', async () => {
      const admin = env.createAdmin()
      const staff = env.createStaff(['items.view'])

      const res = await env.request(`/admin/staff/${staff.id}`, {
        method: 'PATCH',
        body: {},
        token: admin.token
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'Nada para atualizar.')
    })

    test('successfully updates staff permissions, name, organization, and active status', async () => {
      const admin = env.createAdmin()
      const staff = env.createStaff(['items.view'], {
        username: 'staff.update@ecotech.local',
        fullName: 'Staff Inicial',
        organization: 'Org Antiga'
      })

      const res = await env.request(`/admin/staff/${staff.id}`, {
        method: 'PATCH',
        body: {
          full_name: 'Staff Atualizado',
          organization: 'Nova Org',
          permissions: ['items.view', 'items.create', 'items.status', 'items.delete'],
          active: false
        },
        token: admin.token
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.message, 'Funcionário atualizado com sucesso.')
      assert.equal(res.body.full_name, 'Staff Atualizado')
      assert.equal(res.body.organization, 'Nova Org')
      assert.equal(res.body.active, false)
      assert.deepEqual(res.body.permissions, ['items.view', 'items.create', 'items.status', 'items.delete'])

      const inDb = env.db.prepare('SELECT * FROM users WHERE id = ?').get(staff.id)
      assert.equal(inDb.full_name, 'Staff Atualizado')
      assert.equal(inDb.active, 0)
    })
  })

  describe('DELETE /admin/users/:id & /admin/staff/:id (Single Account Deletion)', () => {
    test('fails with 401 when unauthenticated', async () => {
      const res = await env.request('/admin/users/1', { method: 'DELETE' })
      assert.equal(res.status, 401)
    })

    test('fails with 404 when target account does not exist', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/admin/users/99999', {
        method: 'DELETE',
        token: admin.token
      })
      assert.equal(res.status, 404)
      assert.equal(res.body.error, 'Conta não encontrada.')
    })

    test('fails with 400 when admin attempts to delete own account', async () => {
      const admin = env.createAdmin()
      const res = await env.request(`/admin/users/${admin.id}`, {
        method: 'DELETE',
        token: admin.token
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'Você não pode excluir sua própria conta.')
    })

    test('fails with 400 when attempting to delete the only remaining admin account', async () => {
      const admin1 = env.createAdmin({ username: 'admin1@eco.local' })
      const admin2 = env.createUser({ username: 'admin2@eco.local', admin: 1, role: 'admin' })

      const resOk = await env.request(`/admin/users/${admin1.id}`, {
        method: 'DELETE',
        token: admin2.token
      })
      assert.equal(resOk.status, 200)
    })

    test('successfully deletes a user and removes their active sessions', async () => {
      const admin = env.createAdmin()
      const userToDelete = env.createUser({ username: 'deletar@ecotech.local' })

      const sessionBefore = env.db.prepare('SELECT token FROM sessions WHERE user_id = ?').get(userToDelete.id)
      assert.ok(sessionBefore)

      const res = await env.request(`/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
        token: admin.token
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.id, userToDelete.id)

      const userAfter = env.db.prepare('SELECT id FROM users WHERE id = ?').get(userToDelete.id)
      assert.equal(userAfter, undefined)

      const sessionAfter = env.db.prepare('SELECT token FROM sessions WHERE user_id = ?').get(userToDelete.id)
      assert.equal(sessionAfter, undefined)
    })
  })

  describe('DELETE /admin/users (Bulk Delete by Scope)', () => {
    test('fails with 400 when invalid scope is provided', async () => {
      const admin = env.createAdmin()
      const res = await env.request('/admin/users', {
        method: 'DELETE',
        body: { scope: 'all' },
        token: admin.token
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'Informe scope=users ou scope=staff.')
    })

    test('bulk deletes all regular users with scope=users without touching admin/staff', async () => {
      const admin = env.createAdmin()
      env.createUser({ username: 'u1@eco.local' })
      env.createUser({ username: 'u2@eco.local' })
      env.createUser({ username: 'u3@eco.local' })
      env.createStaff(['items.view'], { username: 'staff@eco.local' })

      const res = await env.request('/admin/users', {
        method: 'DELETE',
        body: { scope: 'users' },
        token: admin.token
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.deleted, 3)
      assert.equal(res.body.scope, 'users')

      const remainingUsers = env.db.prepare('SELECT username, role FROM users').all()
      assert.equal(remainingUsers.length, 2) // admin + staff
      assert.ok(remainingUsers.some((u) => u.role === 'admin'))
      assert.ok(remainingUsers.some((u) => u.role === 'staff'))
    })

    test('bulk deletes all staff with scope=staff without touching admin or users', async () => {
      const admin = env.createAdmin()
      env.createStaff(['items.view'], { username: 's1@eco.local' })
      env.createStaff(['items.create'], { username: 's2@eco.local' })
      env.createUser({ username: 'student@eco.local' })

      const res = await env.request('/admin/users?scope=staff', {
        method: 'DELETE',
        token: admin.token
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.deleted, 2)
      assert.equal(res.body.scope, 'staff')

      const remainingUsers = env.db.prepare('SELECT username, role FROM users').all()
      assert.equal(remainingUsers.length, 2) // admin + student
      assert.ok(remainingUsers.some((u) => u.role === 'admin'))
      assert.ok(remainingUsers.some((u) => u.role === 'user'))
    })
  })
})
