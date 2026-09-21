/** `npm run serve` — any static server works; this one is just convenient. */
import { serve } from './server.mjs';
const port = Number(process.argv[2] || 8080);
const { port: actual } = await serve(port);
console.log(`CYBERPUNK MEGAPOLIS — http://127.0.0.1:${actual}/`);
