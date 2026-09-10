import crypto from 'node:crypto'

import constants from '../constants.js'
import db from '../database.js'
import utils from '../utils.js'

export default {
  route: '/login',
  method: 'POST',
  handler: async (req, res) => {
    const body = await req.getJsonBody()
    if (!body) {
      res.answer(400, { error: 'Formato JSON inválido.', code: 'INVALID_PAYLOAD' })

      return;
    }

    const email = body.email
    const password = body.password
    if ((!email || typeof email !== 'string') ||
        (!password || typeof password !== 'string')
    ) {
      res.answer(400, { error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })

      return;
    }

    const user = await db.getUser(email)
    if (!user) {
      res.answer(401, { error: 'Credenciais inválidas.', code: 'INVALID_CREDENTIALS' })

      return;
    }

    if (user.active === 0) {
      res.answer(403, { error: 'Conta desativada. Fale com um administrador.', code: 'ACCOUNT_DEACTIVATED' })

      return;
    }

    const computedHash = crypto.pbkdf2Sync(password, user.salt, constants.HASH_ITERATIONS, constants.KEY_LEN, constants.DIGEST).toString('hex')
    if (computedHash !== user.password_hash) {
      res.answer(401, { error: 'Credenciais inválidas.', code: 'INVALID_CREDENTIALS' })

      return;
    }

    const token = crypto.randomBytes(32).toString('hex')
    await db.createSession(token, user.id)

    res.answer(200, {
      message: 'Login realizado com sucesso.',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        admin: Boolean(user.admin),
        organization: user.organization || '',
        grade: user.grade || '',
        permissions: utils.parsePermissions(user.permissions)
      }
    })
  }
}
