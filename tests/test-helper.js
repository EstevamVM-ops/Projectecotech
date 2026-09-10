import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

import constants from '../src/constants.js'
import db from '../src/database.js'
import utils from '../src/utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROUTES_DIR = path.join(__dirname, '../src/routes')

let cachedRoutes = null

const loadRoutes = async () => {
  const routes = []
  const files = fs.readdirSync(ROUTES_DIR)

  for (const file of files) {
    if (!file.endsWith('.js')) {
      continue
    }

    const filePath = path.join(ROUTES_DIR, file)
    const routeModule = await import(`file://${filePath}`)
    const exported = routeModule.default

    if (!exported) {
      continue
    }

    if (Array.isArray(exported)) {
      for (const route of exported) {
        if (route?.route && route?.method && route?.handler) {
          routes.push(route)
        }
      }
    } else if (typeof exported === 'object') {
      if (exported.route && exported.method && exported.handler) {
        routes.push(exported)
      }
    }
  }

  return routes
}

const createServer = (routes) => {
  return http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const pathname = reqUrl.pathname
    const method = req.method.toUpperCase()

    utils.setupFunctions(req, res)

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
      })
      res.end()

      return;
    }

    const handlerRoute = routes.find((r) => r.route === pathname && r.method.toUpperCase() === method)
    if (handlerRoute) {
      await handlerRoute.handler(req, res)

      return;
    }

    res.answer(404, { error: 'Not Found' })
  })
}

export const createTestEnv = () => {
  const sqliteDb = db.db
  let serverInstance = null
  let baseUrl = ''

  const start = async () => {
    if (!cachedRoutes) {
      cachedRoutes = await loadRoutes()
    }

    const server = createServer(cachedRoutes)

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
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  const reset = () => {
    sqliteDb.exec('DELETE FROM sessions;')
    sqliteDb.exec('DELETE FROM items;')
    sqliteDb.exec('DELETE FROM organizations;')
    sqliteDb.exec('DELETE FROM users;')
  }

  const createUser = ({
    email = 'user@ecotech.local',
    username = null,
    fullName = 'Usuário Teste',
    password = 'password123',
    role = 'user',
    admin = 0,
    organization = 'Escola Teste',
    grade = '1º A',
    permissions = [],
    active = 1
  } = {}) => {
    const userEmail = username || email
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = crypto.pbkdf2Sync(password, salt, constants.HASH_ITERATIONS, constants.KEY_LEN, constants.DIGEST).toString('hex')

    const result = sqliteDb.prepare(`
      INSERT INTO users (email, full_name, password_hash, salt, role, permissions, active, organization, grade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userEmail,
      fullName,
      passwordHash,
      salt,
      role,
      JSON.stringify(permissions),
      active ? 1 : 0,
      organization,
      grade
    )

    const userId = Number(result.lastInsertRowid)
    const token = crypto.randomBytes(32).toString('hex')
    const createdAt = new Date().toISOString()

    sqliteDb.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, createdAt)

    return {
      id: userId,
      email: userEmail,
      username: userEmail,
      fullName,
      password,
      role,
      admin: Boolean(role === 'admin' || admin),
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
    } catch (err) {
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
    db: sqliteDb,
    start,
    stop,
    reset,
    createUser,
    createAdmin,
    createStaff,
    request
  }
}
