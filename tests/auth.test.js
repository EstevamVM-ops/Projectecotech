import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createTestEnv } from './test-helper.js'

describe('Authentication & User Registration (/register, /login)', () => {
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
          full_name: 'Ana Silva',
          username: 'ana@escola.com',
          password: 'secretPassword123',
          organization: 'Escola Municipal Uberaba',
          grade: '8º Ano A'
        }
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.message, 'Conta criada com sucesso!')
      assert.equal(res.body.username, 'ana@escola.com')
      assert.equal(res.body.full_name, 'Ana Silva')
      assert.equal(res.body.role, 'user')
      assert.equal(res.body.admin, false)
      assert.equal(res.body.organization, 'Escola Municipal Uberaba')
      assert.equal(res.body.grade, '8º Ano A')
    })

    test('accepts alternate field names (fullName, email, classroom)', async () => {
      const res = await env.request('/api/register', {
        method: 'POST',
        body: {
          fullName: 'Carlos Mendes',
          email: 'carlos@escola.com',
          password: 'pass',
          classroom: '9º B'
        }
      })

      assert.equal(res.status, 201)
      assert.equal(res.body.username, 'carlos@escola.com')
      assert.equal(res.body.full_name, 'Carlos Mendes')
      assert.equal(res.body.grade, '9º B')
    })

    test('fails with 400 when full_name is missing or empty', async () => {
      const res = await env.request('/register', {
        method: 'POST',
        body: {
          username: 'semnome@escola.com',
          password: 'password123'
        }
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'Nome completo é obrigatório.')
    })

    test('fails with 400 when full_name is only whitespace', async () => {
      const res = await env.request('/register', {
        method: 'POST',
        body: {
          full_name: '   ',
          username: 'espacos@escola.com',
          password: 'password123'
        }
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'Nome completo é obrigatório.')
    })

    test('fails with 400 when username/email is missing', async () => {
      const res = await env.request('/register', {
        method: 'POST',
        body: {
          full_name: 'Ana Silva',
          password: 'password123'
        }
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'E-mail e senha são obrigatórios.')
    })

    test('fails with 400 when password is missing', async () => {
      const res = await env.request('/register', {
        method: 'POST',
        body: {
          full_name: 'Ana Silva',
          username: 'ana@escola.com'
        }
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'E-mail e senha são obrigatórios.')
    })

    test('fails with 409 when email/username is already registered', async () => {
      env.createUser({ username: 'duplicado@escola.com' })

      const res = await env.request('/register', {
        method: 'POST',
        body: {
          full_name: 'Novo Usuário',
          username: 'duplicado@escola.com',
          password: 'password123'
        }
      })

      assert.equal(res.status, 409)
      assert.equal(res.body.error, 'Este e-mail já está cadastrado.')
    })

    test('fails with 400 on invalid JSON format', async () => {
      const res = await env.request('/register', {
        method: 'POST',
        rawBody: '{"invalid-json'
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'Formato JSON inválido.')
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
          username: 'aluno@ecotech.local',
          password: 'mypassword'
        }
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.message, 'Login realizado com sucesso.')
      assert.ok(res.body.token)
      assert.equal(res.body.user.username, 'aluno@ecotech.local')
      assert.equal(res.body.user.full_name, 'Aluno Aluno')
      assert.equal(res.body.user.organization, 'IFTM UPT')
      assert.equal(res.body.user.grade, '2º Informática')
      assert.equal(res.body.user.role, 'user')
      assert.equal(res.body.user.active, true)
    })

    test('accepts email field instead of username for login', async () => {
      env.createUser({
        username: 'aluno2@ecotech.local',
        password: 'mypassword'
      })

      const res = await env.request('/api/login', {
        method: 'POST',
        body: {
          email: 'aluno2@ecotech.local',
          password: 'mypassword'
        }
      })

      assert.equal(res.status, 200)
      assert.ok(res.body.token)
    })

    test('fails with 401 on wrong password', async () => {
      env.createUser({
        username: 'aluno@ecotech.local',
        password: 'correctpassword'
      })

      const res = await env.request('/login', {
        method: 'POST',
        body: {
          username: 'aluno@ecotech.local',
          password: 'wrongpassword'
        }
      })

      assert.equal(res.status, 401)
      assert.equal(res.body.error, 'Credenciais inválidas.')
    })

    test('fails with 401 when username does not exist', async () => {
      const res = await env.request('/login', {
        method: 'POST',
        body: {
          username: 'inexistente@ecotech.local',
          password: 'anypassword'
        }
      })

      assert.equal(res.status, 401)
      assert.equal(res.body.error, 'Credenciais inválidas.')
    })

    test('fails with 400 when missing username or password', async () => {
      const res1 = await env.request('/login', {
        method: 'POST',
        body: { username: 'user@ecotech.local' }
      })
      assert.equal(res1.status, 400)
      assert.equal(res1.body.error, 'E-mail e senha são obrigatórios.')

      const res2 = await env.request('/login', {
        method: 'POST',
        body: { password: 'secret' }
      })
      assert.equal(res2.status, 400)
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
          username: 'desativado@ecotech.local',
          password: 'password123'
        }
      })

      assert.equal(res.status, 403)
      assert.equal(res.body.error, 'Conta desativada. Fale com um administrador.')
    })

    test('fails with 400 on invalid JSON format', async () => {
      const res = await env.request('/login', {
        method: 'POST',
        rawBody: 'not a json'
      })

      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'Formato JSON inválido.')
    })
  })
})
