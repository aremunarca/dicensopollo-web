import { prisma } from '@/lib/prisma';

/** GET /api/imagenes/5 — foto subida desde el panel. Cada foto nueva tiene un ID nuevo, así que se cachea para siempre. */
export async function GET(_req: Request, ctx: RouteContext<'/api/imagenes/[id]'>) {
  const { id } = await ctx.params;
  const n = /^\d{1,10}$/.test(id) ? Number(id) : null;
  const img = n === null ? null : await prisma.imagen.findUnique({ where: { id: n }, select: { mime: true, datos: true } });
  if (!img) return new Response('No encontrada', { status: 404 });
  return new Response(img.datos, {
    headers: {
      'Content-Type': img.mime,
      'Content-Length': String(img.datos.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
