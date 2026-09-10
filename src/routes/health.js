export default {
  route: '/health',
  method: 'GET',
  handler: (req, res) => {
    res.answer(200, { status: 'ok', timestamp: new Date().toISOString() })
  }
}