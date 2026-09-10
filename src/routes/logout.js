import db from '../database.js'

export default {
  route: '/logout',
  method: 'POST',
  handler: async (req, res) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

      return;
    }

    const parts = authHeader.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

      return;
    }

    const token = parts[1]
    await db.deleteSession(token)

    res.answer(200, { ok: true, message: 'Logout realizado com sucesso.' })
  }
}
