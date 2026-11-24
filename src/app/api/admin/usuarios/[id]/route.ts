import { autorizar, error, json, manejar, readJson } from '@/lib/api';
import { SOLO_GERENTE } from '@/lib/auth';
import { actualizarUsuario } from '@/lib/usuarios';

/** PATCH /api/admin/usuarios/3 — { nombre?, rol?, activo?, password? } (solo gerente). */
export async function PATCH(req: Request, ctx: RouteContext<'/api/admin/usuarios/[id]'>) {
  const auth = await autorizar(req, SOLO_GERENTE);
  if (auth.denegado) return auth.denegado;
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return error('El usuario no existe.', 404);
  const body = await readJson(req);
  if (!body) return error('Cuerpo JSON inválido.');
  return manejar(async () => json(await actualizarUsuario(id, body, auth.usuario)));
}
