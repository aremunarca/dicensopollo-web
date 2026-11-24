import { connection } from 'next/server';
import { json, manejar } from '@/lib/api';
import { listarCarta } from '@/lib/catalogo';

/** GET /api/carta — la carta pública (productos visibles con sus opciones y precios en CLP). */
export async function GET() {
  await connection();
  return manejar(async () => json(await listarCarta()));
}
