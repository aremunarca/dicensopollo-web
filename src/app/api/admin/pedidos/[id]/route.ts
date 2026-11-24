import { autorizar, error, json, manejar, readJson } from '@/lib/api';
import { leerIdPedido } from '@/lib/admin-tipos';
import { actualizarPedido, obtenerPedido } from '@/lib/pedidos';

/** GET /api/admin/pedidos/12 (o DC-000012) — detalle con productos e historial. */
export async function GET(req: Request, ctx: RouteContext<'/api/admin/pedidos/[id]'>) {
  const auth = await autorizar(req);
  if (auth.denegado) return auth.denegado;
  const id = leerIdPedido((await ctx.params).id);
  const pedido = id ? await obtenerPedido(id) : null;
  return pedido ? json(pedido) : error('El pedido no existe.', 404);
}

/** PATCH /api/admin/pedidos/12 — { estado?, comentario? } cambia el estado y/o deja un comentario en el historial. */
export async function PATCH(req: Request, ctx: RouteContext<'/api/admin/pedidos/[id]'>) {
  const auth = await autorizar(req);
  if (auth.denegado) return auth.denegado;
  const id = leerIdPedido((await ctx.params).id);
  if (!id) return error('El pedido no existe.', 404);
  const body = await readJson(req);
  if (!body) return error('Cuerpo JSON inválido.');
  return manejar(async () => json(await actualizarPedido(id, body, auth.usuario)));
}
