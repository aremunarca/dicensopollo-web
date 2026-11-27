// Datos iniciales de la carta en prisma/seed-data/carta.json.
//
// Es idempotente:
// - Lo que falta se crea (categorías, productos, opciones).
// - En las opciones que ya existen (mismo código) se actualiza el precio; el nombre solo cambia
//   si la opción lo solicita explícitamente. Fotos, descripciones, visibilidad y "agotado" se respetan.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/lib/prisma';

type SeedVariante = { codigo: string; nombre: string | null; detalle: string | null; precio: number; actualizarNombre?: boolean };
type SeedProducto = {
  slug: string; nombre: string; categoria: string; descripcion: string; opcion: string; destacado: boolean; img: string;
  variantes: SeedVariante[];
};
type SeedCarta = { origen: string; extraido: string; categorias: string[]; productos: SeedProducto[] };

async function main() {
  const file = path.join(import.meta.dirname, 'seed-data', 'carta.json');
  const carta = JSON.parse(fs.readFileSync(file, 'utf8')) as SeedCarta;

  const catIds = new Map<string, number>();
  for (const [i, nombre] of carta.categorias.entries()) {
    const c = await prisma.categoria.upsert({ where: { nombre }, create: { nombre, orden: i + 1 }, update: {} });
    catIds.set(nombre, c.id);
  }

  let productosNuevos = 0, opcionesNuevas = 0, preciosActualizados = 0, nombresActualizados = 0;
  for (const [i, p] of carta.productos.entries()) {
    const existentes = await prisma.variante.findMany({ where: { codigo: { in: p.variantes.map((v) => v.codigo) } } });
    let producto = existentes[0]
      ? await prisma.producto.findUnique({ where: { id: existentes[0].productoId } })
      : await prisma.producto.findUnique({ where: { slug: p.slug } });
    if (!producto) {
      producto = await prisma.producto.create({
        data: {
          slug: p.slug, nombre: p.nombre, descripcion: p.descripcion, categoriaId: catIds.get(p.categoria)!, img: p.img,
          opcion: p.opcion, destacado: p.destacado, orden: i + 1,
        },
      });
      productosNuevos++;
    }
    for (const [j, v] of p.variantes.entries()) {
      const e = existentes.find((x) => x.codigo === v.codigo);
      if (!e) {
        await prisma.variante.create({ data: { productoId: producto.id, codigo: v.codigo, nombre: v.nombre, detalle: v.detalle, precio: v.precio, orden: j } });
        opcionesNuevas++;
      } else {
        const actualizaNombre = v.actualizarNombre && e.nombre !== v.nombre;
        if (e.precio !== v.precio || actualizaNombre) {
          await prisma.variante.update({
            where: { id: e.id },
            data: { precio: v.precio, ...(actualizaNombre ? { nombre: v.nombre } : {}) },
          });
          if (e.precio !== v.precio) preciosActualizados++;
          if (actualizaNombre) nombresActualizados++;
        }
      }
    }
  }

  console.log(`Carta de ${carta.origen} (extraída el ${carta.extraido.slice(0, 10)})`);
  console.log(`Categorías: ${carta.categorias.length} · Productos nuevos: ${productosNuevos} (total ${await prisma.producto.count()})`);
  console.log(`Opciones nuevas: ${opcionesNuevas} · precios actualizados: ${preciosActualizados} · nombres actualizados: ${nombresActualizados} · total en BD: ${await prisma.variante.count()}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
