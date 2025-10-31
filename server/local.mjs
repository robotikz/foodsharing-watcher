import app from './proxy.mjs'

const PORT = process.env.PORT || 8787
app.listen(PORT, () => {
  console.log(`[proxy] listening on http://localhost:${PORT}`)
})
