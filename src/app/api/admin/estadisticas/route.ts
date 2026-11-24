import { autorizar, json, manejar } from '@/lib/api';
import { SOLO_GERENTE } from '@/lib/auth';
import { calcularEstadisticas } from '@/lib/estadisticas';

/** GET /api/admin/estadisticas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD — ventas e indicadores (solo gerente). */
export async function GET(req: Request) {
  const auth = await autorizar(req, SOLO_GERENTE);
  if (auth.denegado) return auth.denegado;
  const sp = new URL(req.url).searchParams;
  return manejar(async () => json(await calcularEstadisticas(sp.get('desde'), sp.get('hasta'))));
}
