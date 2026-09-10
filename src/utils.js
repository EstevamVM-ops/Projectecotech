import db from './database.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
}

function setupFunctions(req, res) {
  res.answer = (statusCode, data) => {
    res.writeHead(statusCode, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  req.getBody = async () => {
    return new Promise((resolve) => {
      let body = ''

      req.on('data', (chunk) => body += chunk)
      req.on('end', () => resolve(body))
    })
  }

  req.getJsonBody = async () => {
    const body = await req.getBody()

    try {
      return JSON.parse(body)
    } catch (err) {
      return null
    }
  }
}

async function getUserFromReq(req) {
  const authHeader = req.headers.authorization
  if (!authHeader) return null

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null

  const token = parts[1]

  return await db.getUserBySession(token)
}

function isAdmin(user) {
  return !!user && (user.role === 'admin' || user.admin === 1)
}

function parsePermissions(permissions) {
  try {
    return JSON.parse(permissions)
  } catch (err) {
    return []
  }
}

function hasPermission(user, perm) {
  if (isAdmin(user)) return true
  if (user.role === 'staff') return parsePermissions(user.permissions).includes(perm)
  if (user.role === 'user') return perm === 'items.create' || perm === 'items.view'

  return false
}

export default {
  setupFunctions,
  getUserFromReq,
  isAdmin,
  parsePermissions,
  hasPermission
}
