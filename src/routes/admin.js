import crypto from 'node:crypto'

import constants from '../constants.js'
import db from '../database.js'
import utils from '../utils.js'

export default [
  {
    route: '/admin/items/state',
    method: 'POST',
    handler: async (req, res) => {
      const user = await utils.getUserFromReq(req)
      if (!user) {
        res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

        return;
      }

      if (!utils.hasPermission(user, 'items.status')) {
        res.answer(403, { error: 'Sem permissão para alterar o status.', code: 'INSUFFICIENT_PERMISSIONS' })

        return;
      }

      const body = await req.getJsonBody()
      if (!body) {
        res.answer(400, { error: 'Formato JSON inválido.', code: 'INVALID_PAYLOAD' })

        return;
      }

      const uuid = body.uuid
      const state = body.state
      if ((!uuid || typeof uuid !== 'string') ||
          (!state || typeof state !== 'string')
      ) {
        res.answer(400, { error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })

        return;
      }

      const item = await db.getItem(uuid)
      if (!item) {
        res.answer(404, { error: 'Aparelho não encontrado.', code: 'NOT_FOUND' })

        return;
      }

      if (!await db.updateItemState(uuid, state)) {
        res.answer(500, { error: 'Erro ao atualizar status.', code: 'DATABASE_ERROR' })

        return;
      }

      res.answer(200, {
        uuid,
        state
      })
    }
  },
  {
    route: '/admin/users',
    method: 'GET',
    handler: async (req, res) => {
      const user = await utils.getUserFromReq(req)
      if (!user) {
        res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

        return;
      }

      if (!utils.isAdmin(user)) {
        res.answer(403, { error: 'Acesso restrito a administradores.', code: 'INSUFFICIENT_PERMISSIONS' })

        return;
      }

      const users = await db.getUsersWithItemCount()

      res.answer(200, { users })
    }
  },
  {
    route: '/admin/staff',
    method: 'POST',
    handler: async (req, res) => {
      const user = await utils.getUserFromReq(req)
      if (!user) {
        res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

        return;
      }

      if (!utils.isAdmin(user)) {
        res.answer(403, { error: 'Acesso restrito a administradores.', code: 'INSUFFICIENT_PERMISSIONS' })

        return;
      }

      const body = await req.getJsonBody()
      if (!body) {
        res.answer(400, { error: 'Formato JSON inválido.', code: 'INVALID_PAYLOAD' })

        return;
      }

      const fullName = body.fullName
      const email = body.email
      const password = body.password
      const organization = body.organization || ''
      const permissions = body.permissions || []

      if ((!fullName || typeof fullName !== 'string') ||
          (!email || typeof email !== 'string') ||
          (!password || typeof password !== 'string') ||
          (!Array.isArray(permissions))
      ) {
        res.answer(400, { error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })

        return;
      }

      const existingUser = await db.getUser(email)
      if (existingUser) {
        res.answer(409, { error: 'Este e-mail já está cadastrado.', code: 'EMAIL_ALREADY_EXISTS' })

        return;
      }

      const salt = crypto.randomBytes(16).toString('hex')
      const passwordHash = crypto.pbkdf2Sync(password, salt, constants.HASH_ITERATIONS, constants.KEY_LEN, constants.DIGEST).toString('hex')

      const created = await db.createStaff(email, fullName, passwordHash, salt, organization, JSON.stringify(permissions))
      if (!created) {
        res.answer(500, { error: 'Erro ao criar funcionário.', code: 'DATABASE_ERROR' })

        return;
      }

      res.answer(201, {
        message: 'Conta de funcionário criada com sucesso!',
        id: created.id,
        email,
        fullName,
        role: 'staff',
        organization,
        permissions
      })
    }
  },
  {
    route: '/admin/staff',
    method: 'PATCH',
    handler: async (req, res) => {
      const user = await utils.getUserFromReq(req)
      if (!user) {
        res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

        return;
      }

      if (!utils.isAdmin(user)) {
        res.answer(403, { error: 'Acesso restrito a administradores.', code: 'INSUFFICIENT_PERMISSIONS' })

        return;
      }

      const body = await req.getJsonBody()
      if (!body) {
        res.answer(400, { error: 'Formato JSON inválido.', code: 'INVALID_PAYLOAD' })

        return;
      }

      const id = body.id
      if (!id || typeof id !== 'number') {
        res.answer(400, { error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })

        return;
      }

      const staff = await db.getUserById(id)
      if (!staff || staff.role !== 'staff') {
        res.answer(404, { error: 'Funcionário não encontrado.', code: 'NOT_FOUND' })

        return;
      }

      const fullName = body.fullName !== undefined ? body.fullName : staff.fullName
      const organization = body.organization !== undefined ? body.organization : staff.organization
      const permissions = body.permissions !== undefined ? body.permissions : (typeof staff.permissions === 'string' ? JSON.parse(staff.permissions || '[]') : staff.permissions)
      const active = body.active !== undefined ? (body.active ? 1 : 0) : staff.active

      if (typeof fullName !== 'string' || !fullName.trim() || !Array.isArray(permissions)) {
        res.answer(400, { error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })

        return;
      }

      if (!await db.updateStaff(id, fullName.trim(), organization, JSON.stringify(permissions), active)) {
        res.answer(500, { error: 'Erro ao atualizar funcionário.', code: 'DATABASE_ERROR' })

        return;
      }

      res.answer(200, {
        message: 'Funcionário atualizado com sucesso.',
        id,
        fullName: fullName.trim(),
        organization,
        permissions,
        active: Boolean(active)
      })
    }
  },
  {
    route: '/admin/users',
    method: 'DELETE',
    handler: async (req, res) => {
      const user = await utils.getUserFromReq(req)
      if (!user) {
        res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

        return;
      }

      if (!utils.isAdmin(user)) {
        res.answer(403, { error: 'Acesso restrito a administradores.', code: 'INSUFFICIENT_PERMISSIONS' })

        return;
      }

      const body = await req.getJsonBody()
      if (!body) {
        res.answer(400, { error: 'Formato JSON inválido.', code: 'INVALID_PAYLOAD' })

        return;
      }

      const id = body.id
      const scope = body.scope

      if (id !== undefined) {
        if (typeof id !== 'number') {
          res.answer(400, { error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })

          return;
        }

        if (id === user.id) {
          res.answer(400, { error: 'Você não pode excluir sua própria conta.', code: 'SELF_DELETION_NOT_ALLOWED' })

          return;
        }

        if (!await db.deleteUser(id)) {
          res.answer(500, { error: 'Erro ao excluir conta.', code: 'DATABASE_ERROR' })

          return;
        }

        res.answer(200, { ok: true, id })

        return;
      }

      if (scope !== undefined) {
        if (scope !== 'users' && scope !== 'staff') {
          res.answer(400, { error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })

          return;
        }

        const deleted = await db.bulkDeleteUsers(scope === 'users' ? 'user' : 'staff')

        res.answer(200, { ok: true, scope, deleted })

        return;
      }

      res.answer(400, { error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })
    }
  }
]
