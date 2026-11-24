import { autorizar, HttpError, json, manejar } from '@/lib/api';
import { aplicarCarga, MAX_BYTES_CARGA, vistaPreviaCarga } from '@/lib/carga-masiva';
import type { ModoCarga } from '@/lib/admin-tipos';

const MODOS: readonly ModoCarga[] = ['upsert', 'crear', 'actualizar'];

/**
 * POST /api/admin/productos/importar?accion=preview|aplicar&modo=upsert|crear|actualizar
 * Cuerpo multipart: "archivo" (.xlsx o .csv) y, al aplicar, el "token" de la vista previa.
 */
export async function POST(req: Request) {
  const auth = await autorizar(req);
  if (auth.denegado) return auth.denegado;
  return manejar(async () => {
    const sp = new URL(req.url).searchParams;
    const modo = MODOS.find((m) => m === sp.get('modo')) ?? 'upsert';
    const grande = new HttpError(413, `El archivo supera ${MAX_BYTES_CARGA / 1024 / 1024} MB.`);
    if (Number(req.headers.get('content-length')) > MAX_BYTES_CARGA + 64 * 1024) throw grande;
    const form = await req.formData().catch(() => null);
    const archivo = form?.get('archivo');
    if (!(archivo instanceof File) || !archivo.size) throw new HttpError(400, 'Selecciona un archivo Excel (.xlsx) o CSV.');
    if (archivo.size > MAX_BYTES_CARGA) throw grande;
    const datos = new Uint8Array(await archivo.arrayBuffer());
    const nombre = archivo.name || 'archivo';
    if (sp.get('accion') !== 'aplicar') return json(await vistaPreviaCarga(nombre, datos, modo));
    const token = form?.get('token');
    return json(await aplicarCarga(nombre, datos, modo, typeof token === 'string' ? token : ''));
  });
}
