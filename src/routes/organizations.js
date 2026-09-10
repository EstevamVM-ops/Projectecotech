import db from '../database.js'
import utils from '../utils.js'

export default [
  {
    route: '/organizations',
    method: 'GET',
    handler: async (req, res) => {
      const organizations = await db.getOrganizations()

      res.answer(200, { organizations })
    }
  },
  {
    route: '/organizations',
    method: 'POST',
    handler: async (req, res) => {
      const user = await utils.getUserFromReq(req)
      if (!user) {
        res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

        return;
      }

      if (!utils.hasPermission(user, 'organizations.manage')) {
        res.answer(403, { error: 'Sem permissão para gerenciar organizações.', code: 'INSUFFICIENT_PERMISSIONS' })

        return;
      }

      const body = await req.getJsonBody()
      if (!body) {
        res.answer(400, { error: 'Formato JSON inválido.', code: 'INVALID_PAYLOAD' })

        return;
      }

      const name = body.name
      const city = body.city
      if ((!name || typeof name !== 'string') ||
          (!city || typeof city !== 'string')
      ) {
        res.answer(400, { error: 'Parâmetros inválidos', code: 'INVALID_PARAMETERS' })

        return;
      }

      const existing = await db.getOrganization(name)
      if (existing) {
        res.answer(409, { error: 'Esta organização já está cadastrada.', code: 'ORGANIZATION_ALREADY_EXISTS' })

        return;
      }

      const createdAt = new Date().toISOString()
      const created = await db.createOrganization(name, city, createdAt)
      if (!created) {
        res.answer(500, { error: 'Erro ao cadastrar organização.', code: 'DATABASE_ERROR' })

        return;
      }

      res.answer(201, {
        id: created.id,
        name,
        city,
        createdAt
      })
    }
  },
  {
    route: '/organizations',
    method: 'DELETE',
    handler: async (req, res) => {
      const user = await utils.getUserFromReq(req)
      if (!user) {
        res.answer(401, { error: 'Não autorizado.', code: 'UNAUTHORIZED' })

        return;
      }

      if (!utils.hasPermission(user, 'organizations.manage')) {
        res.answer(403, { error: 'Sem permissão para gerenciar organizações.', code: 'INSUFFICIENT_PERMISSIONS' })

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

      const organization = await db.getOrganizationById(id)
      if (!organization) {
        res.answer(404, { error: 'Organização não encontrada.', code: 'NOT_FOUND' })

        return;
      }

      const linkedCount = await db.countItemsByOrganization(organization.name)
      /* INFO: Switch all messages to code errors */
      if (linkedCount > 0) {
        res.answer(409, {
          error: `Não é possível excluir a organização "${organization.name}" pois existem ${linkedCount} dispositivo(s) vinculado(s) a ela.`,
          code: 'ORGANIZATION_LINKED_DEVICES'
        })

        return;
      }

      if (!await db.deleteOrganization(organization.id)) {
        res.answer(500, { error: 'Erro ao excluir organização.', code: 'DATABASE_ERROR' })

        return;
      }

      res.answer(200, { ok: true })
    }
  }
]
