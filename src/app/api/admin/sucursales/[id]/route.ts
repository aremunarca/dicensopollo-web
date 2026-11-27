import { autorizar, error, json, manejar, parseId, readJson } from '@/lib/api';
import { SOLO_GERENTE } from '@/lib/auth';
import { actualizarSucursal } from '@/lib/sucursales';

/** PATCH /api/admin/sucursales/3 — { nombre?, telefono?, direccion?, comuna?, activo? }. */
export async function PATCH(req: Request, ctx: RouteContext<'/api/admin/sucursales/[id]'>) {
  const auth = await autorizar(req, SOLO_GERENTE);
  if (auth.denegado) return auth.denegado;
  const id = parseId((await ctx.params).id);
  if (id === null) return error('La sucursal no existe.', 404);
  const body = await readJson(req);
  if (!body) return error('Cuerpo JSON inválido.');
  return manejar(async () => json(await actualizarSucursal(id, body)));
}
