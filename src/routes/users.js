import db from '../database.js'

export default {
  route: '/users/check',
  method: 'GET',
  handler: async (req, res) => {
    const reqUrl = new URL(req.url, 'http://localhost')
    const email = reqUrl.searchParams.get('email')
    if (!email || typeof email !== 'string') {
      res.answer(400, { exists: false, error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })

      return;
    }

    const user = await db.getUser(email)
    if (!user) {
      res.answer(404, { exists: false, error: `Nenhum usuário cadastrado com o e-mail "${email}".`, code: 'NOT_FOUND' })

      return;
    }

    res.answer(200, {
      exists: true,
      email: user.email,
      fullName: user.full_name,
      organization: user.organization || '',
      grade: user.grade || ''
    })
  }
}
