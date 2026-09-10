import fs from 'node:fs'
import http from 'node:http'

import utils from './utils.js'
import db from './database.js'

(async () => {
  console.log('Loading routes...')
  
  const routes = []
  fs.readdirSync('./src/routes').forEach(async (file) => {
    if (!file.endsWith('.js')) {
      console.error('Error: Invalid route file:', file)

      return;
    }

    const routeModule = await import(`./routes/${file}`)
    if (!routeModule.default) {
      console.error('Error: Route file does not export a default object:', file)

      return;
    }

    if (Array.isArray(routeModule.default)) {
      routeModule.default.forEach((route) => {
        if (!route.route || !route.method || !route.handler) {
          console.error('Error: Route object is missing required properties (route, method, handler):', file)

          return;
        }

        routes.push(route)

        console.log(`Loaded route: ${route.method.toUpperCase()} ${route.route}`)
      })
    } else if (typeof routeModule.default === 'object') {
      if (!routeModule.default.route || !routeModule.default.method || !routeModule.default.handler) {
        console.error('Error: Route object is missing required properties (route, method, handler):', file)

        return;
      }

      routes.push(routeModule.default)

      console.log(`Loaded route: ${routeModule.default.method.toUpperCase()} ${routeModule.default.route}`)
    }
  })

  http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const pathname = reqUrl.pathname
    const method = req.method.toUpperCase()

    utils.setupFunctions(req, res)

    const handlerRoute = routes.find(route => route.route === pathname && route.method.toUpperCase() === method)
    if (handlerRoute) {
      await handlerRoute.handler(req, res)

      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not Found' }))
  }).listen(3000, () => {
    console.log('Server is running on http://localhost:3000')
  })
})()
