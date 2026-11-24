import { prisma } from '@/lib/prisma';
import { autorizar, error, json } from '@/lib/api';
import { validarImagen } from '@/lib/imagenes';
import { urlImagen } from '@/lib/fotos';

/**
 * POST /api/admin/imagenes — sube una foto ya editada/comprimida en el navegador (multipart, campo "imagen").
 * Devuelve { url } para guardarla en el producto con PATCH /api/admin/productos/:id { img: url }.
 */
export async function POST(req: Request) {
  const auth = await autorizar(req);
  if (auth.denegado) return auth.denegado;
  const form = await req.formData().catch(() => null);
  const archivo = form?.get('imagen');
  if (!(archivo instanceof File) || !archivo.size) return error('Sube una foto.');

  const img = validarImagen(new Uint8Array(await archivo.arrayBuffer()));
  if (typeof img === 'string') return error(img);
  const nueva = await prisma.imagen.create({ data: { mime: img.mime, datos: img.datos, bytes: img.bytes, ancho: img.ancho, alto: img.alto } });
  return json({ id: nueva.id, url: urlImagen(nueva.id) }, 201);
}
