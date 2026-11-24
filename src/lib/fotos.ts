import 'server-only';
import { prisma } from './prisma';

/** URL pública de una foto guardada en la BD. */
export const urlImagen = (id: number) => `/api/imagenes/${id}`;

/** ID de la foto si la URL es de una foto subida desde el panel (/api/imagenes/12), si no null. */
export function idDeUrl(url: string | null | undefined): number | null {
  const m = url?.match(/^\/api\/imagenes\/(\d{1,10})$/);
  return m ? Number(m[1]) : null;
}

/**
 * Borra una foto subida desde el panel si ya ningún producto la usa
 * (al cambiar la foto de un producto). Las fotos de /productos no se tocan.
 */
export async function borrarSiHuerfana(url: string | null | undefined) {
  const id = idDeUrl(url);
  if (id === null) return;
  const enUso = await prisma.producto.count({ where: { img: urlImagen(id) } });
  if (!enUso) await prisma.imagen.deleteMany({ where: { id } });
}

/** Una foto es válida si es una ruta del sitio (/productos/…, /api/imagenes/…) o una URL http(s). */
export const fotoValida = (s: string) => !s || /^(\/[\w\-./%]+|https?:\/\/\S+)$/i.test(s);
