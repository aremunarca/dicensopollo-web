import { autorizar, json, manejar } from '@/lib/api';
import { listarPedidos } from '@/lib/pedidos';

/** GET /api/admin/pedidos?estado=PENDIENTE&q=maria&desde=2026-11-01&hasta=2026-11-30 — lista y conteos por estado. */
export async function GET(req: Request) {
  const auth = await autorizar(req);
  if (auth.denegado) return auth.denegado;
  const sp = new URL(req.url).searchParams;
  return manejar(async () => json(await listarPedidos({ estado: sp.get('estado'), q: sp.get('q'), desde: sp.get('desde'), hasta: sp.get('hasta') })));
}
