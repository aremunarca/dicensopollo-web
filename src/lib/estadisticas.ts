import 'server-only';
import { prisma } from './prisma';
import { leerFecha } from './pedidos';
import { ESTADOS, ESTADOS_VENTA, type EstadoPedido, type Estadisticas } from './admin-tipos';

// Estadísticas del panel (gerencia). Cuentan como venta los pedidos EN PREPARACIÓN (confirmados) y ENTREGADOS.

const DIAS_POR_DEFECTO = 30;
const MAX_DIAS = 400;
const diaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function calcularEstadisticas(desdeTxt: string | null, hastaTxt: string | null): Promise<Estadisticas> {
  let hasta = leerFecha(hastaTxt, true) ?? leerFecha(diaLocal(new Date()), true)!;
  let desde = leerFecha(desdeTxt) ?? new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() - (DIAS_POR_DEFECTO - 1));
  if (desde > hasta) [desde, hasta] = [leerFecha(diaLocal(hasta))!, leerFecha(diaLocal(desde), true)!];
  const minimo = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() - (MAX_DIAS - 1));
  if (desde < minimo) desde = minimo;
  const rango = { createdAt: { gte: desde, lte: hasta } };

  const [porEstadoRows, ventas, productos, productosActivos, agotados, opciones, sinFoto] = await Promise.all([
    prisma.pedido.groupBy({ by: ['estado'], where: rango, _count: { _all: true } }),
    prisma.pedido.findMany({
      where: { ...rango, estado: { in: [...ESTADOS_VENTA] } },
      select: {
        entrega: true, comuna: true, total: true, unidades: true, createdAt: true,
        items: { select: { codigo: true, nombre: true, cantidad: true, precio: true, variante: { select: { producto: { select: { categoria: { select: { nombre: true } } } } } } } },
      },
    }),
    prisma.producto.count(),
    prisma.producto.count({ where: { activo: true, variantes: { some: { activo: true } } } }),
    prisma.producto.count({ where: { activo: true, agotado: true } }),
    prisma.variante.count({ where: { activo: true, producto: { activo: true } } }),
    prisma.producto.count({ where: { activo: true, img: '' } }),
  ]);

  const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoPedido, number>;
  for (const r of porEstadoRows) porEstado[r.estado] = r._count._all;

  // Un registro por día del rango (también los días sin ventas).
  const dias = new Map<string, { ingresos: number; pedidos: number }>();
  for (const d = new Date(desde); d <= hasta; d.setDate(d.getDate() + 1)) dias.set(diaLocal(d), { ingresos: 0, pedidos: 0 });
  const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, pedidos: 0 }));

  const prods = new Map<string, { codigo: string; nombre: string; cantidad: number; ingresos: number }>();
  const categorias = new Map<string, { categoria: string; cantidad: number; ingresos: number }>();
  const comunas = new Map<string, { comuna: string; pedidos: number; ingresos: number }>();
  const entregas = new Map<string, { entrega: string; pedidos: number; ingresos: number }>();
  let ingresos = 0, unidades = 0;

  for (const v of ventas) {
    ingresos += v.total;
    unidades += v.unidades;
    const dia = dias.get(diaLocal(v.createdAt));
    if (dia) { dia.ingresos += v.total; dia.pedidos++; }
    horas[v.createdAt.getHours()].pedidos++;
    const e = entregas.get(v.entrega) ?? { entrega: v.entrega, pedidos: 0, ingresos: 0 };
    e.pedidos++; e.ingresos += v.total; entregas.set(v.entrega, e);
    const nombreComuna = v.comuna?.trim();
    if (nombreComuna) {
      const ck = nombreComuna.toLowerCase();
      const c = comunas.get(ck) ?? { comuna: nombreComuna, pedidos: 0, ingresos: 0 };
      c.pedidos++; c.ingresos += v.total; comunas.set(ck, c);
    }
    for (const it of v.items) {
      const sub = it.precio * it.cantidad;
      const prod = prods.get(it.codigo) ?? { codigo: it.codigo, nombre: it.nombre, cantidad: 0, ingresos: 0 };
      prod.cantidad += it.cantidad; prod.ingresos += sub; prods.set(it.codigo, prod);
      const cn = it.variante?.producto.categoria.nombre ?? 'Sin categoría';
      const cat = categorias.get(cn) ?? { categoria: cn, cantidad: 0, ingresos: 0 };
      cat.cantidad += it.cantidad; cat.ingresos += sub; categorias.set(cn, cat);
    }
  }

  const top = <T extends { ingresos: number }>(m: Map<string, T>, n: number) => [...m.values()].sort((a, b) => b.ingresos - a.ingresos).slice(0, n);

  return {
    desde: diaLocal(desde),
    hasta: diaLocal(hasta),
    ventas: ventas.length,
    ingresos,
    ticketPromedio: ventas.length ? Math.round(ingresos / ventas.length) : 0,
    unidades,
    porEstado,
    porEntrega: top(entregas, 5),
    porDia: [...dias.entries()].map(([fecha, d]) => ({ fecha, ...d })),
    porHora: horas,
    topProductos: top(prods, 10),
    porCategoria: top(categorias, 12),
    topComunas: top(comunas, 8),
    carta: { productos, productosActivos, agotados, opciones, sinFoto },
  };
}
