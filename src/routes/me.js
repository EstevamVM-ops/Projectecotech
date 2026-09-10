import utils from '../utils.js'

export default {
  route: '/me',
  method: 'GET',
  handler: async (req, res) => {
    const user = await utils.getUserFromReq(req)
    if (!user) {
      res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

      return;
    }

    res.answer(200, {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        organization: user.organization || '',
        grade: user.grade || '',
        permissions: utils.parsePermissions(user.permissions)
      }
    })
  }
}
