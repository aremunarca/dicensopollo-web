import { autorizar, error, json, manejar, readJson } from '@/lib/api';
import { SOLO_GERENTE } from '@/lib/auth';
import { crearUsuario, listarUsuarios } from '@/lib/usuarios';

/** GET /api/admin/usuarios — usuarios del panel (solo gerente). */
export async function GET(req: Request) {
  const auth = await autorizar(req, SOLO_GERENTE);
  if (auth.denegado) return auth.denegado;
  return manejar(async () => json(await listarUsuarios()));
}

/** POST /api/admin/usuarios — { nombre, usuario, password, rol } (solo gerente). */
export async function POST(req: Request) {
  const auth = await autorizar(req, SOLO_GERENTE);
  if (auth.denegado) return auth.denegado;
  const body = await readJson(req);
  if (!body) return error('Cuerpo JSON inválido.');
  return manejar(async () => json(await crearUsuario(body), 201));
}
