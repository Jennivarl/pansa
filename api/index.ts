// Vercel function: every /api/* request lands here (see vercel.json).
import { handle } from '@hono/node-server/vercel';
import { app } from '../apps/demo/dist/app.js';

export default handle(app);
