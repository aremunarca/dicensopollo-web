import { autorizar, error, json, manejar, parseId, readJson } from '@/lib/api';
import { actualizarProducto, obtenerProductoAdmin } from '@/lib/catalogo';

/** GET /api/admin/productos/3 — el producto con todas sus opciones. */
export async function GET(req: Request, ctx: RouteContext<'/api/admin/productos/[id]'>) {
  const auth = await autorizar(req);
  if (auth.denegado) return auth.denegado;
  const id = parseId((await ctx.params).id);
  return manejar(async () => {
    const p = id === null ? null : await obtenerProductoAdmin(id);
    return p ? json(p) : error('Producto no encontrado.', 404);
  });
}

/**
 * PATCH /api/admin/productos/3 — cambia solo lo que llega (editor completo y edición rápida).
 * { nombre?, categoria?, descripcion?, opcion?, img?, destacado?, agotado?, activo?,
 *   variantes?: [{ id?, codigo?, nombre?, detalle?, precio?, activo? }] }  — sin id = opción nueva.
 */
export async function PATCH(req: Request, ctx: RouteContext<'/api/admin/productos/[id]'>) {
  const auth = await autorizar(req);
  if (auth.denegado) return auth.denegado;
  const id = parseId((await ctx.params).id);
  if (id === null) return error('Producto no encontrado.', 404);
  const body = await readJson(req);
  if (!body) return error('Cuerpo JSON inválido.');
  return manejar(async () => json(await actualizarProducto(id, body)));
}
