import { DatabaseSync } from 'node:sqlite'
import crypto from 'node:crypto'
import { createServer, initDb, _hashPassword } from '../index.js'

export const createTestEnv = () => {
  const db = initDb(new DatabaseSync(':memory:'))
  const server = createServer(db)
  let serverInstance = null
  let baseUrl = ''

  const start = () => {
    return new Promise((resolve) => {
      serverInstance = server.listen(0, '127.0.0.1', () => {
        const port = serverInstance.address().port
        baseUrl = `http://127.0.0.1:${port}`
        resolve({ server: serverInstance, baseUrl })
      })
    })
  }

  const stop = () => {
    return new Promise((resolve) => {
      if (serverInstance && serverInstance.listening) {
        serverInstance.close(() => {
          serverInstance = null
          baseUrl = ''
          try { db.close() } catch {}
          resolve()
        })
      } else {
        try { db.close() } catch {}
        resolve()
      }
    })
  }

  const reset = () => {
    db.exec('DELETE FROM sessions;')
    db.exec('DELETE FROM items;')
    db.exec('DELETE FROM organizations;')
    db.exec('DELETE FROM users;')
  }

  const createUser = ({
    username = 'user@ecotech.local',
    fullName = 'Usuário Teste',
    password = 'password123',
    role = 'user',
    admin = 0,
    organization = 'Escola Teste',
    grade = '1º A',
    permissions = [],
    active = 1
  } = {}) => {
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = _hashPassword(password, salt)

    const result = db.prepare(`
      INSERT INTO users (username, full_name, password_hash, salt, role, admin, permissions, active, organization, grade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      username,
      fullName,
      passwordHash,
      salt,
      role,
      admin ? 1 : 0,
      JSON.stringify(permissions),
      active ? 1 : 0,
      organization,
      grade
    )

    const userId = Number(result.lastInsertRowid)
    const token = crypto.randomBytes(32).toString('hex')
    const createdAt = new Date().toISOString()

    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, createdAt)

    return {
      id: userId,
      username,
      fullName,
      password,
      role,
      admin: Boolean(admin),
      permissions,
      active: Boolean(active),
      organization,
      grade,
      token
    }
  }

  const createAdmin = (overrides = {}) => {
    return createUser({
      username: 'admin@ecotech.local',
      fullName: 'Administrador Master',
      password: 'adminpassword',
      role: 'admin',
      admin: 1,
      active: 1,
      ...overrides
    })
  }

  const createStaff = (permissions = ['items.view', 'items.create', 'items.status', 'items.delete', 'labels.print', 'reports.pdf', 'organizations.manage'], overrides = {}) => {
    return createUser({
      username: 'staff@ecotech.local',
      fullName: 'Funcionário Teste',
      password: 'staffpassword',
      role: 'staff',
      admin: 0,
      permissions,
      active: 1,
      ...overrides
    })
  }

  const request = async (path, {
    method = 'GET',
    body = null,
    headers = {},
    token = null,
    rawBody = null
  } = {}) => {
    if (!baseUrl) {
      await start()
    }

    const reqHeaders = { ...headers }

    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`
    }

    let requestBody = null

    if (rawBody !== null && rawBody !== undefined) {
      requestBody = rawBody
    } else if (body !== null && body !== undefined) {
      requestBody = typeof body === 'string' ? body : JSON.stringify(body)
      if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
        reqHeaders['Content-Type'] = 'application/json'
      }
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: reqHeaders,
      body: requestBody
    })

    let json = null
    const text = await response.text()

    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }

    return {
      status: response.status,
      headers: response.headers,
      body: json,
      text
    }
  }

  return {
    db,
    server,
    start,
    stop,
    reset,
    createUser,
    createAdmin,
    createStaff,
    request
  }
}
