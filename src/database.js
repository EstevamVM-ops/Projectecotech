import { DatabaseSync } from 'node:sqlite'

const DB_PATH = process.env.DB_PATH || 'db.sqlite'
const db = new DatabaseSync(DB_PATH)

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    permissions TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    organization TEXT NOT NULL DEFAULT '',
    grade TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS items (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner TEXT NOT NULL DEFAULT '',
    weight REAL NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT '',
    organization TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    city TEXT NOT NULL DEFAULT 'Uberaba',
    created_at TEXT NOT NULL
);
`)

async function getUser(email) {
  return await db.prepare('SELECT * FROM users WHERE email = ?').get(email)
}

async function createUser(email, fullName, passwordHash, salt, role, organization, grade) {
  try {
    await db.prepare('INSERT INTO users (email, full_name, password_hash, salt, role, organization, grade) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      email,
      fullName,
      passwordHash,
      salt,
      role,
      organization,
      grade
    )

    return true
  } catch (error) {
    return false
  }
}

async function createSession(token, userId) {
  try {
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, new Date().toISOString())

    return true
  } catch (error) {
    return false
  }
}

async function getUserBySession(token) {
  if (!token) return null

  const user = await db.prepare(`
    SELECT users.id, users.email, users.full_name, users.role, users.organization, users.grade, users.permissions, users.active
    FROM sessions
    JOIN users ON sessions.user_id = users.id
    WHERE sessions.token = ?
  `).get(token)

  if (!user || user.active === 0) return null

  return user
}

async function getItems() {
  return await db.prepare(`
    SELECT items.uuid, items.name, items.owner, items.weight, items.state, items.organization, items.created_at AS createdAt,
           COALESCE(NULLIF(users.full_name, ''), items.owner) AS owner_name
    FROM items
    LEFT JOIN users ON LOWER(items.owner) = LOWER(users.email) OR LOWER(items.owner) = LOWER(users.full_name)
  `).all()
}

async function createItem(uuid, name, owner, weight, state, organization, createdAt) {
  try {
    await db.prepare('INSERT INTO items (uuid, name, owner, weight, state, organization, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      uuid,
      name,
      owner,
      weight,
      state,
      organization,
      createdAt
    )

    return true
  } catch (error) {
    return false
  }
}

async function getOrganizations() {
  return await db.prepare('SELECT id, name, city, created_at AS createdAt FROM organizations ORDER BY name ASC').all()
}

async function getOrganization(name) {
  return await db.prepare('SELECT id, name, city, created_at AS createdAt FROM organizations WHERE name = ?').get(name)
}

async function getOrganizationById(id) {
  return await db.prepare('SELECT id, name, city, created_at AS createdAt FROM organizations WHERE id = ?').get(id)
}

async function createOrganization(name, city, createdAt) {
  try {
    const result = await db.prepare('INSERT INTO organizations (name, city, created_at) VALUES (?, ?, ?)').run(name, city, createdAt)

    return { id: Number(result.lastInsertRowid), name, city, createdAt }
  } catch (error) {
    return null
  }
}

async function countItemsByOrganization(organizationName) {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM items WHERE organization = ?').get(organizationName)

  return row ? row.count : 0
}

async function deleteOrganization(id) {
  try {
    await db.prepare('DELETE FROM organizations WHERE id = ?').run(id)

    return true
  } catch (error) {
    return false
  }
}

async function getItem(uuid) {
  return await db.prepare('SELECT uuid, name, owner, weight, state, organization, created_at AS createdAt FROM items WHERE uuid = ?').get(uuid)
}

async function updateItemState(uuid, state) {
  try {
    await db.prepare('UPDATE items SET state = ? WHERE uuid = ?').run(state, uuid)

    return true
  } catch (error) {
    return false
  }
}

async function getUsersWithItemCount() {
  const rows = await db.prepare(`
    SELECT users.id, users.email, users.full_name AS fullName, users.role, users.organization, users.grade, users.active, users.permissions,
      (SELECT COUNT(*) FROM items WHERE LOWER(items.owner) = LOWER(users.email) OR LOWER(items.owner) = LOWER(users.full_name)) AS itemsCount
    FROM users ORDER BY users.full_name ASC
  `).all()

  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    organization: u.organization || '',
    grade: u.grade || '',
    active: u.active !== 0,
    permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions || '[]') : u.permissions,
    itemsCount: u.itemsCount
  }))
}

async function createStaff(email, fullName, passwordHash, salt, organization, permissions) {
  try {
    const result = await db.prepare('INSERT INTO users (email, full_name, password_hash, salt, role, organization, permissions, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      email,
      fullName,
      passwordHash,
      salt,
      'staff',
      organization,
      permissions,
      1
    )

    return { id: Number(result.lastInsertRowid), email, fullName, role: 'staff', organization, permissions }
  } catch (error) {
    return null
  }
}

async function deleteUser(id) {
  try {
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    await db.prepare('DELETE FROM users WHERE id = ?').run(id)

    return true
  } catch (error) {
    return false
  }
}

async function bulkDeleteUsers(role) {
  try {
    await db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = ?)').run(role)
    const result = await db.prepare('DELETE FROM users WHERE role = ?').run(role)

    return Number(result.changes)
  } catch (error) {
    return 0
  }
}

async function deleteItem(uuid) {
  try {
    await db.prepare('DELETE FROM items WHERE uuid = ?').run(uuid)

    return true
  } catch (error) {
    return false
  }
}

async function deleteSession(token) {
  try {
    await db.prepare('DELETE FROM sessions WHERE token = ?').run(token)

    return true
  } catch (error) {
    return false
  }
}

async function getUserById(id) {
  return await db.prepare('SELECT id, email, full_name AS fullName, role, organization, grade, active, permissions FROM users WHERE id = ?').get(id)
}

async function updateStaff(id, fullName, organization, permissions, active) {
  try {
    await db.prepare('UPDATE users SET full_name = ?, organization = ?, permissions = ?, active = ? WHERE id = ?').run(
      fullName,
      organization,
      permissions,
      active,
      id
    )

    return true
  } catch (error) {
    return false
  }
}

export default {
  db,
  getUser,
  getUserById,
  getUserBySession,
  createUser,
  createSession,
  deleteSession,
  getItems,
  getItem,
  createItem,
  updateItemState,
  deleteItem,
  getUsersWithItemCount,
  createStaff,
  updateStaff,
  deleteUser,
  bulkDeleteUsers,
  getOrganizations,
  getOrganization,
  getOrganizationById,
  createOrganization,
  countItemsByOrganization,
  deleteOrganization
}