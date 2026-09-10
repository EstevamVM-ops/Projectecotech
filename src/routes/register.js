import crypto from 'node:crypto'

import constants from '../constants.js'
import db from '../database.js'

export default {
  route: '/register',
  method: 'POST',
  handler: async (req, res) => {
    const body = await req.getJsonBody()
    if (!body) {
      res.answer(400, { error: 'Formato JSON inválido.', code: 'INVALID_PAYLOAD' })

      return;
    }

    const fullName = body.fullName
    const email = body.email
    const password = body.password
    const organization = body.organization
    const grade = body.grade
    const role = 'user'

    /* TODO: Verificar todos que precisam */
    if (!fullName) {
      res.answer(400, { error: 'Nome completo é obrigatório.', code: 'INVALID_PARAMETERS' })

      return;
    }

    if ((!email || typeof email !== 'string') ||
        (!password || typeof password !== 'string')
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

    if (!await db.createUser(email, fullName, passwordHash, salt, role, organization, grade)) {
      res.answer(500, { error: 'Erro ao criar usuário.', code: 'DATABASE_ERROR' })

      return;
    }

    res.answer(200, { message: 'Conta criada com sucesso!' })
  }
}
