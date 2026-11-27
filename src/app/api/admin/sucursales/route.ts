import { autorizar, error, json, manejar, readJson } from '@/lib/api';
import { SOLO_GERENTE } from '@/lib/auth';
import { crearSucursal, listarSucursalesAdmin } from '@/lib/sucursales';

/** GET /api/admin/sucursales — listado de sucursales (solo gerente). */
export async function GET(req: Request) {
  const auth = await autorizar(req, SOLO_GERENTE);
  if (auth.denegado) return auth.denegado;
  return manejar(async () => json(await listarSucursalesAdmin()));
}

/** POST /api/admin/sucursales — { nombre, telefono, direccion, comuna }. */
export async function POST(req: Request) {
  const auth = await autorizar(req, SOLO_GERENTE);
  if (auth.denegado) return auth.denegado;
  const body = await readJson(req);
  if (!body) return error('Cuerpo JSON inválido.');
  return manejar(async () => json(await crearSucursal(body), 201));
}
