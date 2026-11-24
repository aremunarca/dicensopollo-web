// Carga .env antes de arrancar Next.js para que PORT (y el resto) se respeten en `npm run dev` y `npm start`.
// Next lee PORT antes de cargar .env por su cuenta, por eso se hace aquí.
// Uso: node scripts/next.mjs dev | start  (un `-p 4000` en la línea de comandos tiene prioridad).
import 'dotenv/config';
import { createRequire } from 'node:module';

createRequire(import.meta.url)('next/dist/bin/next');
