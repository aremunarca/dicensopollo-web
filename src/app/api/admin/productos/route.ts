import { autorizar, error, json, manejar, readJson } from '@/lib/api';
import { crearProducto, listarCategorias, listarProductosAdmin } from '@/lib/catalogo';

/** GET /api/admin/productos — todos los productos (también ocultos) con todas sus opciones, y las categorías. */
export async function GET(req: Request) {
  const auth = await autorizar(req);
  if (auth.denegado) return auth.denegado;
  return manejar(async () => {
    const [productos, categorias] = await Promise.all([listarProductosAdmin(), listarCategorias()]);
    return json({ productos, categorias });
  });
}

/**
 * POST /api/admin/productos — crea un producto.
 * { nombre, categoria, descripcion?, opcion?, img?, destacado?, agotado?, activo?, variantes: [{ nombre?, detalle?, precio, codigo?, activo? }] }
 */
export async function POST(req: Request) {
  const auth = await autorizar(req);
  if (auth.denegado) return auth.denegado;
  const body = await readJson(req);
  if (!body) return error('Cuerpo JSON inválido.');
  return manejar(async () => json(await crearProducto(body), 201));
}
