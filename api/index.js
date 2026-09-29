// Vercel entry point: every /api/* request is rewritten here (vercel.json)
// and handled by the same Express app that runs locally.
import app from '../server/app.js'

export default app
