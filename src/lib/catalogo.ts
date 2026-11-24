import 'server-only';
import { prisma } from './prisma';
import { HttpError, leerPesos, str } from './api';
import { borrarSiHuerfana, fotoValida } from './fotos';
import { codigoDe, slugify } from './texto';
import type { ProductoCarta } from './config';
import type { ProductoAdmin } from './admin-tipos';
import type { Prisma } from '@/generated/prisma/client';

// Carta pública y administración de productos con sus opciones (variantes).

const ordenVariantes = [{ precio: 'asc' }, { orden: 'asc' }, { id: 'asc' }] satisfies Prisma.VarianteOrderByWithRelationInput[];
const ordenProductos = [{ categoria: { orden: 'asc' } }, { orden: 'asc' }, { id: 'asc' }] satisfies Prisma.ProductoOrderByWithRelationInput[];

/* ---------- Carta pública ---------- */

/** Productos visibles (activos y con al menos una opción activa), en el orden de la carta. */
export async function listarCarta(): Promise<ProductoCarta[]> {
  const rows = await prisma.producto.findMany({
    where: { activo: true, variantes: { some: { activo: true } } },
    include: { categoria: { select: { nombre: true } }, variantes: { where: { activo: true }, orderBy: ordenVariantes } },
    orderBy: ordenProductos,
  });
  return rows.map((p) => ({
    id: p.id, slug: p.slug, nombre: p.nombre, descripcion: p.descripcion, categoria: p.categoria.nombre, img: p.img,
    opcion: p.opcion, destacado: p.destacado, agotado: p.agotado,
    opciones: p.variantes.map((v) => ({ id: v.id, codigo: v.codigo, nombre: v.nombre, detalle: v.detalle, precio: v.precio })),
  }));
}

export async function listarCategorias(): Promise<string[]> {
  return (await prisma.categoria.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }], select: { nombre: true } })).map((c) => c.nombre);
}

/* ---------- Panel: todos los productos con todas sus opciones ---------- */

const includeAdmin = { categoria: { select: { nombre: true } }, variantes: { orderBy: ordenVariantes } } satisfies Prisma.ProductoInclude;
type RowAdmin = Prisma.ProductoGetPayload<{ include: typeof includeAdmin }>;

const toAdmin = (p: RowAdmin): ProductoAdmin => ({
  id: p.id, slug: p.slug, nombre: p.nombre, descripcion: p.descripcion, categoria: p.categoria.nombre, img: p.img, opcion: p.opcion,
  destacado: p.destacado, agotado: p.agotado, activo: p.activo, orden: p.orden,
  variantes: p.variantes.map((v) => ({ id: v.id, codigo: v.codigo, nombre: v.nombre, detalle: v.detalle, precio: v.precio, activo: v.activo })),
});

export async function listarProductosAdmin(): Promise<ProductoAdmin[]> {
  return (await prisma.producto.findMany({ include: includeAdmin, orderBy: ordenProductos })).map(toAdmin);
}

export async function obtenerProductoAdmin(id: number): Promise<ProductoAdmin | null> {
  const p = await prisma.producto.findUnique({ where: { id }, include: includeAdmin });
  return p ? toAdmin(p) : null;
}

/* ---------- Ayudas para crear ---------- */

/** Busca la categoría por nombre; si no existe la crea al final de la carta. */
export async function categoriaPorNombre(nombre: string) {
  const c = await prisma.categoria.findUnique({ where: { nombre } });
  if (c) return c;
  const max = await prisma.categoria.aggregate({ _max: { orden: true } });
  return prisma.categoria.create({ data: { nombre, orden: (max._max.orden ?? 0) + 1 } });
}

/** Devuelve `base` o `base-2`, `base-3`… según lo que ya esté usado. */
export function libre(base: string, usados: Set<string>, max: number, sep = '-') {
  const limpio = base.slice(0, max);
  if (!usados.has(limpio.toLowerCase())) return limpio;
  for (let n = 2; ; n++) {
    const s = `${sep}${n}`;
    const c = limpio.slice(0, max - s.length) + s;
    if (!usados.has(c.toLowerCase())) return c;
  }
}

async function slugLibre(nombre: string, excepto?: number) {
  const usados = new Set((await prisma.producto.findMany({ where: excepto ? { id: { not: excepto } } : {}, select: { slug: true } })).map((p) => p.slug.toLowerCase()));
  return libre(slugify(nombre) || 'producto', usados, 160);
}

/* ---------- Validación ---------- */

type DatosVariante = { codigo?: string; nombre?: string | null; detalle?: string | null; precio?: number; activo?: boolean };

function leerVariante(v: Record<string, unknown>, nueva: boolean, etiqueta: string): DatosVariante {
  const d: DatosVariante = {};
  if (v.codigo !== undefined && v.codigo !== null && v.codigo !== '') {
    const codigo = str(v.codigo, 40).toUpperCase().replace(/\s+/g, '-');
    if (!/^[A-Z0-9][A-Z0-9._\-]*$/.test(codigo)) throw new HttpError(400, `Código inválido (${etiqueta}): usa letras, números y guiones.`);
    d.codigo = codigo;
  }
  if (v.nombre !== undefined) d.nombre = str(v.nombre, 80) || null;
  if (v.detalle !== undefined) d.detalle = str(v.detalle, 255) || null;
  if (v.precio !== undefined || nueva) {
    const precio = leerPesos(v.precio);
    if (precio === null) throw new HttpError(400, `Revisa el precio de ${etiqueta} (en pesos, sin decimales; ej.: 4500).`);
    d.precio = precio;
  }
  if (v.activo !== undefined) d.activo = v.activo === true;
  return d;
}

type DatosProducto = { nombre?: string; descripcion?: string; categoria?: string; img?: string; opcion?: string; destacado?: boolean; agotado?: boolean; activo?: boolean };

function leerProducto(b: Record<string, unknown>, nuevo: boolean): DatosProducto {
  const d: DatosProducto = {};
  if (b.nombre !== undefined || nuevo) {
    d.nombre = str(b.nombre, 150);
    if (!d.nombre) throw new HttpError(400, 'Escribe el nombre del producto.');
  }
  if (b.categoria !== undefined || nuevo) {
    d.categoria = str(b.categoria, 80);
    if (!d.categoria) throw new HttpError(400, 'Elige o escribe la categoría.');
  }
  if (b.descripcion !== undefined) d.descripcion = str(b.descripcion, 600);
  if (b.opcion !== undefined) d.opcion = str(b.opcion, 40);
  if (b.img !== undefined) {
    d.img = str(b.img, 255);
    if (!fotoValida(d.img)) throw new HttpError(400, 'La foto debe ser una ruta del sitio (/productos/…) o una URL http(s).');
  }
  for (const k of ['destacado', 'agotado', 'activo'] as const) if (b[k] !== undefined) d[k] = b[k] === true;
  return d;
}

const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : null);

/** Códigos ocupados (en mayúsculas), para generar uno libre. */
const codigosUsados = async () => new Set((await prisma.variante.findMany({ select: { codigo: true } })).map((v) => v.codigo.toLowerCase()));

/* ---------- Crear y editar ---------- */

/** Crea un producto con sus opciones. Cuerpo: ProductoEntrada (nombre, categoria y al menos una opción con precio). */
export async function crearProducto(body: Record<string, unknown>): Promise<ProductoAdmin> {
  const d = leerProducto(body, true);
  const filas = lista(body.variantes) ?? [];
  if (!filas.length) throw new HttpError(400, 'Agrega al menos una opción con precio.');
  if (filas.length > 60) throw new HttpError(400, 'Un producto admite hasta 60 opciones.');
  const variantes = filas.map((v, i) => leerVariante(v, true, `la opción ${i + 1}`));
  if (variantes.length > 1 && variantes.some((v) => !v.nombre)) throw new HttpError(400, 'Con varias opciones, cada una necesita su nombre (ej.: Entero, Medio).');

  const usados = await codigosUsados();
  for (const v of variantes) {
    if (v.codigo && usados.has(v.codigo.toLowerCase())) throw new HttpError(409, `El código ${v.codigo} ya existe.`);
    v.codigo = libre(v.codigo || codigoDe(d.nombre!, v.nombre), usados, 40);
    usados.add(v.codigo.toLowerCase());
  }
  const cat = await categoriaPorNombre(d.categoria!);
  const orden = ((await prisma.producto.aggregate({ _max: { orden: true }, where: { categoriaId: cat.id } }))._max.orden ?? 0) + 1;
  const creado = await prisma.producto.create({
    data: {
      slug: await slugLibre(d.nombre!), nombre: d.nombre!, descripcion: d.descripcion ?? '', categoriaId: cat.id, img: d.img ?? '',
      opcion: variantes.length > 1 ? d.opcion || 'Opción' : d.opcion ?? '',
      destacado: d.destacado ?? false, agotado: d.agotado ?? false, activo: d.activo ?? true, orden,
      variantes: { create: variantes.map((v, i) => ({ codigo: v.codigo!, nombre: v.nombre ?? null, detalle: v.detalle ?? null, precio: v.precio!, activo: v.activo ?? true, orden: i })) },
    },
  });
  return (await obtenerProductoAdmin(creado.id))!;
}

/**
 * Edita un producto. Solo cambia lo que llega. En `variantes`: con id = editar esa opción;
 * sin id = opción nueva. Las opciones no se borran (los pedidos guardan su historial): se ocultan con activo=false.
 * Lo usan el editor completo y la edición rápida (precios, visible, agotado).
 */
export async function actualizarProducto(id: number, body: Record<string, unknown>): Promise<ProductoAdmin> {
  const actual = await prisma.producto.findUnique({ where: { id }, include: { variantes: true } });
  if (!actual) throw new HttpError(404, 'El producto no existe.');
  const d = leerProducto(body, false);
  const filas = lista(body.variantes) ?? [];
  const nombre = d.nombre ?? actual.nombre;

  // Con varias opciones, cada una necesita nombre (se revisa cómo quedaría antes de guardar).
  const nombresFinales = new Map<number | string, string | null>(actual.variantes.map((v) => [v.id, v.nombre]));
  filas.forEach((f, i) => {
    const vid = f.id === undefined || f.id === null ? `n${i}` : Number(f.id);
    if (f.nombre !== undefined) nombresFinales.set(vid, str(f.nombre, 80) || null);
    else if (!nombresFinales.has(vid)) nombresFinales.set(vid, null);
  });
  if (nombresFinales.size > 1 && [...nombresFinales.values()].some((n) => !n)) {
    throw new HttpError(400, 'Con varias opciones, cada una necesita su nombre (ej.: Entero, Medio). Completa la opción sin nombre.');
  }
  if (nombresFinales.size > 1 && !(d.opcion ?? actual.opcion)) d.opcion = 'Opción';

  const usados = await codigosUsados();
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  let ordenNueva = Math.max(-1, ...actual.variantes.map((v) => v.orden)) + 1;
  for (const [i, f] of filas.entries()) {
    const vid = f.id === undefined || f.id === null ? null : Number(f.id);
    if (vid !== null) {
      const antes = actual.variantes.find((v) => v.id === vid);
      if (!antes) throw new HttpError(400, `La opción ${vid} no pertenece a este producto.`);
      const v = leerVariante(f, false, antes.nombre ?? antes.codigo);
      if (v.codigo && v.codigo !== antes.codigo) {
        if (usados.has(v.codigo.toLowerCase())) throw new HttpError(409, `El código ${v.codigo} ya existe.`);
        usados.delete(antes.codigo.toLowerCase()); usados.add(v.codigo.toLowerCase());
      } else delete v.codigo;
      if (Object.keys(v).length) ops.push(prisma.variante.update({ where: { id: vid }, data: v }));
    } else {
      const v = leerVariante(f, true, `la opción nueva ${i + 1}`);
      if (v.codigo && usados.has(v.codigo.toLowerCase())) throw new HttpError(409, `El código ${v.codigo} ya existe.`);
      const codigo = libre(v.codigo || codigoDe(nombre, v.nombre), usados, 40);
      usados.add(codigo.toLowerCase());
      ops.push(prisma.variante.create({
        data: { productoId: id, codigo, nombre: v.nombre ?? null, detalle: v.detalle ?? null, precio: v.precio!, activo: v.activo ?? true, orden: ordenNueva++ },
      }));
    }
  }

  const data: Prisma.ProductoUncheckedUpdateInput = {};
  if (d.nombre !== undefined && d.nombre !== actual.nombre) { data.nombre = d.nombre; data.slug = await slugLibre(d.nombre, id); }
  if (d.categoria !== undefined) data.categoriaId = (await categoriaPorNombre(d.categoria)).id;
  for (const k of ['descripcion', 'img', 'opcion', 'destacado', 'agotado', 'activo'] as const) if (d[k] !== undefined) data[k] = d[k];
  if (Object.keys(data).length) ops.unshift(prisma.producto.update({ where: { id }, data }));

  if (ops.length) await prisma.$transaction(ops);
  if (d.img !== undefined && d.img !== actual.img) await borrarSiHuerfana(actual.img);

  return (await obtenerProductoAdmin(id))!;
}
