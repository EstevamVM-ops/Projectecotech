import crypto from 'node:crypto'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'

import constants from '../src/constants.js'

const DB_PATH = process.env.DB_PATH || 'db.sqlite'
const db = new DatabaseSync(DB_PATH)

db.exec(`
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
`)

const args = process.argv.slice(2)
const email = (args[0] || 'admin@ecotech.local').trim()
const password = args[1] || 'admin123'
const fullName = (args[2] || 'Administrador EcoTech').trim()

const salt = crypto.randomBytes(16).toString('hex')
const passwordHash = crypto.pbkdf2Sync(password, salt, constants.HASH_ITERATIONS, constants.KEY_LEN, constants.DIGEST).toString('hex')

try {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)

  if (existing) {
    db.prepare("UPDATE users SET full_name = ?, password_hash = ?, salt = ?, role = 'admin', active = 1 WHERE id = ?")
      .run(fullName, passwordHash, salt, existing.id)
    console.log(`Admin account "${email}" updated successfully.`)
  } else {
    db.prepare("INSERT INTO users (email, full_name, password_hash, salt, role, permissions, active) VALUES (?, ?, ?, ?, 'admin', '[]', 1)")
      .run(email, fullName, passwordHash, salt)
    console.log(`Admin account "${email}" created successfully.`)
  }

  console.log('--- Account Details ---')
  console.log(`E-mail:    ${email}`)
  console.log(`Password:  ${password}`)
  console.log(`Full Name: ${fullName}`)
  console.log('-----------------------')
} catch (err) {
  console.error('Failed to create admin account:', err.message)
  process.exit(1)
}
