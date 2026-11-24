import { autorizar, manejar } from '@/lib/api';
import { generarPlantilla } from '@/lib/carga-masiva';

/** GET /api/admin/productos/plantilla?formato=xlsx|csv&carta=1 — plantilla vacía o con la carta actual. */
export async function GET(req: Request) {
  const auth = await autorizar(req);
  if (auth.denegado) return auth.denegado;
  const sp = new URL(req.url).searchParams;
  return manejar(async () => {
    const f = await generarPlantilla(sp.get('formato') === 'csv' ? 'csv' : 'xlsx', sp.get('carta') === '1');
    return new Response(new Uint8Array(f.datos), {
      headers: { 'Content-Type': f.tipo, 'Content-Disposition': `attachment; filename="${f.nombre}"`, 'Cache-Control': 'no-store' },
    });
  });
}
