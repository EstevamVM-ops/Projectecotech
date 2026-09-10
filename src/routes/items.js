import db from '../database.js'
import utils from '../utils.js'

export default [{
  route: '/items',
  method: 'GET',
  handler: async (req, res) => {
    const user = await utils.getUserFromReq(req)
    if (user && user.role === 'staff' && !utils.parsePermissions(user.permissions).includes('items.view')) {
      res.answer(403, { error: 'Sem permissão para visualizar aparelhos.', code: 'INSUFFICIENT_PERMISSIONS' })

      return;
    }

    const items = await db.getItems()

    res.answer(200, { items })
  }
},
{
  route: '/items',
  method: 'POST',
  handler: async (req, res) => {
    const user = await utils.getUserFromReq(req)
    const body = await req.getJsonBody()

    if (!user) {
      res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

      return;
    }

    if (!utils.hasPermission(user, 'items.create')) {
      res.answer(403, { error: 'Sem permissão para cadastrar aparelhos.', code: 'INSUFFICIENT_PERMISSIONS' })

      return;
    }

    if (!body) {
      res.answer(400, { error: 'Formato JSON inválido.', code: 'INVALID_PAYLOAD' })

      return;
    }

    const name = body.name
    const owner = body.owner
    const weight = body.weight
    const state = body.state
    const organization = body.organization

    if ((!name || typeof name !== 'string') ||
        (!owner || typeof owner !== 'string') ||
        (typeof weight !== 'number' || isNaN(weight) || weight < 0) ||
        (!state || typeof state !== 'string') ||
        (!organization || typeof organization !== 'string')
    ) {
      res.answer(400, { error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })

      return;
    }

    /* INFO: Verify if the said owner's email actually is registered */
    const registeredUser = await db.getUser(owner)
    if (!registeredUser) {
      res.answer(404, { error: `O usuário/e-mail "${owner}" não existe.`, code: 'NOT_FOUND' })

      return;
    }

    const uuid = body.uuid || body.id || `ECO-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    const createdAt = new Date().toISOString()

    if (!await db.createItem(uuid, name, owner, weight, state, organization, createdAt)) {
      res.answer(500, { error: 'Erro ao salvar dispositivo no banco de dados.', code: 'DATABASE_ERROR' })

      return;
    }

    res.answer(201, {
      uuid,
      name,
      owner,
      weight,
      state,
      organization,
      createdAt
    })
  }
},
{
  route: '/items',
  method: 'DELETE',
  handler: async (req, res) => {
    const user = await utils.getUserFromReq(req)
    if (!user) {
      res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

      return;
    }

    if (!utils.hasPermission(user, 'items.delete')) {
      res.answer(403, { error: 'Sem permissão para excluir aparelhos.', code: 'INSUFFICIENT_PERMISSIONS' })

      return;
    }

    const body = await req.getJsonBody()
    if (!body) {
      res.answer(400, { error: 'Formato JSON inválido.', code: 'INVALID_PAYLOAD' })

      return;
    }

    const uuid = body.uuid
    if (!uuid || typeof uuid !== 'string') {
      res.answer(400, { error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })

      return;
    }

    const item = await db.getItem(uuid)
    if (!item) {
      res.answer(404, { error: 'Aparelho não encontrado.', code: 'NOT_FOUND' })

      return;
    }

    if (!await db.deleteItem(uuid)) {
      res.answer(500, { error: 'Erro ao excluir aparelho.', code: 'DATABASE_ERROR' })

      return;
    }

    res.answer(200, { ok: true, uuid })
  }
}]
