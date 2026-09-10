import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createTestEnv } from './test-helper.js'

describe('Authentication & User Registration (/register, /login, /logout, /me)', () => {
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

  describe('POST /register', () => {
    test('successfully registers a new user with valid fields', async () => {
      const res = await env.request('/register', {
        method: 'POST',
        body: {
          fullName: 'Ana Silva',
          email: 'ana@escola.com',
          password: 'secretPassword123',
          organization: 'Escola Municipal Uberaba',
          grade: '8º Ano A'
        }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.message, 'Conta criada com sucesso!')

      const inDb = env.db.prepare('SELECT * FROM users WHERE email = ?').get('ana@escola.com')
      assert.ok(inDb)
      assert.equal(inDb.full_name, 'Ana Silva')
      assert.equal(inDb.organization, 'Escola Municipal Uberaba')
      assert.equal(inDb.grade, '8º Ano A')
      assert.equal(inDb.role, 'user')
    })

    test('fails with 400 when fullName is missing or empty', async () => {
      const res = await env.request('/register', {
        method: 'POST',
        body: {
          email: 'semnome@escola.com',
          password: 'password123'
        }
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.code, 'INVALID_PARAMETERS')
    })

    test('fails with 400 when email or password is missing', async () => {
      const res = await env.request('/register', {
        method: 'POST',
        body: {
          fullName: 'Ana Silva',
          password: 'password123'
        }
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.code, 'INVALID_PARAMETERS')
    })

    test('fails with 409 when email is already registered', async () => {
      env.createUser({ username: 'duplicado@escola.com' })

      const res = await env.request('/register', {
        method: 'POST',
        body: {
          fullName: 'Novo Usuário',
          email: 'duplicado@escola.com',
          password: 'password123'
        }
      })

      assert.equal(res.status, 409)
      assert.equal(res.body.code, 'EMAIL_ALREADY_EXISTS')
    })

    test('fails with 400 on invalid JSON format', async () => {
      const res = await env.request('/register', {
        method: 'POST',
        rawBody: '{"invalid-json'
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.code, 'INVALID_PAYLOAD')
    })
  })

  describe('POST /login', () => {
    test('successfully logs in with correct credentials', async () => {
      env.createUser({
        username: 'aluno@ecotech.local',
        password: 'mypassword',
        fullName: 'Aluno Aluno',
        organization: 'IFTM UPT',
        grade: '2º Informática'
      })

      const res = await env.request('/login', {
        method: 'POST',
        body: {
          email: 'aluno@ecotech.local',
          password: 'mypassword'
        }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.message, 'Login realizado com sucesso.')
      assert.ok(res.body.token)
      assert.equal(res.body.user.email, 'aluno@ecotech.local')
      assert.equal(res.body.user.fullName, 'Aluno Aluno')
      assert.equal(res.body.user.organization, 'IFTM UPT')
      assert.equal(res.body.user.grade, '2º Informática')
      assert.equal(res.body.user.role, 'user')
    })

    test('fails with 401 on wrong password', async () => {
      env.createUser({
        username: 'aluno@ecotech.local',
        password: 'correctpassword'
      })

      const res = await env.request('/login', {
        method: 'POST',
        body: {
          email: 'aluno@ecotech.local',
          password: 'wrongpassword'
        }
      })

      assert.equal(res.status, 401)
      assert.equal(res.body.code, 'INVALID_CREDENTIALS')
    })

    test('fails with 401 when email does not exist', async () => {
      const res = await env.request('/login', {
        method: 'POST',
        body: {
          email: 'inexistente@ecotech.local',
          password: 'anypassword'
        }
      })

      assert.equal(res.status, 401)
      assert.equal(res.body.code, 'INVALID_CREDENTIALS')
    })

    test('fails with 400 when missing email or password', async () => {
      const res = await env.request('/login', {
        method: 'POST',
        body: { email: 'user@ecotech.local' }
      })
      assert.equal(res.status, 400)
      assert.equal(res.body.code, 'INVALID_PARAMETERS')
    })

    test('fails with 403 when account is deactivated (active = 0)', async () => {
      env.createUser({
        username: 'desativado@ecotech.local',
        password: 'password123',
        active: 0
      })

      const res = await env.request('/login', {
        method: 'POST',
        body: {
          email: 'desativado@ecotech.local',
          password: 'password123'
        }
      })

      assert.equal(res.status, 403)
      assert.equal(res.body.code, 'ACCOUNT_DEACTIVATED')
    })

    test('fails with 400 on invalid JSON format', async () => {
      const res = await env.request('/login', {
        method: 'POST',
        rawBody: 'not a json'
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.code, 'INVALID_PAYLOAD')
    })
  })

  describe('POST /logout', () => {
    test('successfully invalidates session token', async () => {
      const user = env.createUser()

      const res = await env.request('/logout', {
        method: 'POST',
        token: user.token
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.ok, true)

      const sessionAfter = env.db.prepare('SELECT * FROM sessions WHERE token = ?').get(user.token)
      assert.equal(sessionAfter, undefined)
    })

    test('fails with 401 when unauthenticated', async () => {
      const res = await env.request('/logout', { method: 'POST' })
      assert.equal(res.status, 401)
      assert.equal(res.body.code, 'UNAUTHORIZED')
    })
  })

  describe('GET /me', () => {
    test('returns 200 with current user profile when authenticated', async () => {
      const staff = env.createStaff(['items.view', 'items.create'])

      const res = await env.request('/me', {
        token: staff.token
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.user.email, staff.username)
      assert.equal(res.body.user.fullName, staff.fullName)
      assert.equal(res.body.user.role, 'staff')
      assert.deepEqual(res.body.user.permissions, ['items.view', 'items.create'])
    })

    test('fails with 401 when unauthenticated', async () => {
      const res = await env.request('/me')
      assert.equal(res.status, 401)
      assert.equal(res.body.code, 'UNAUTHORIZED')
    })
  })
})
