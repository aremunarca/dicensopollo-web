import 'server-only';
import { prisma } from './prisma';
import { HttpError, str } from './api';
import { CONFIG, esDelivery, fmt, linkWa, nombreLinea, type DatosCliente } from './config';
import {
  COMENTARIO_MAX, ESTADO_TEXTO, ESTADOS, TRANSICIONES, numeroPedido,
  type EstadoPedido, type ListaPedidos, type PedidoDetalle, type PedidoResumen, type UsuarioSesion,
} from './admin-tipos';
import type { Prisma } from '@/generated/prisma/client';

// Pedidos: registro desde la carta (con precios de la BD) y gestión en el panel.

const MAX_LISTA = 300;
const MAX_LINEAS = 60;
const MAX_CANTIDAD = 99;

/* ---------- Mensaje de WhatsApp ---------- */

export function mensajePedido(o: {
  lineas: { qty: number; nombre: string; precio: number }[];
  total: number;
  cliente: DatosCliente;
  numero?: string;
  enlace?: string;
}) {
  const d = o.cliente;
  const delivery = esDelivery(d.entrega);
  return [
    `¡Hola ${CONFIG.nombre}! 🍗 Quiero hacer este pedido:`,
    ...(o.numero ? [`Pedido N° ${o.numero}`] : []),
    '',
    ...o.lineas.map((l) => `• ${l.qty} x ${l.nombre} — ${fmt(l.precio * l.qty)}`),
    '',
    `*TOTAL: ${fmt(o.total)}*`,
    delivery ? '(el costo del delivery lo confirman ustedes)' : null,
    '',
    '*Mis datos*',
    `Nombre: ${d.nombre}`,
    `Teléfono: ${d.telefono}`,
    `Entrega: ${d.entrega}`,
    delivery && d.direccion ? `Dirección: ${d.direccion}${d.comuna ? `, ${d.comuna}` : ''}` : null,
    `Pago: ${d.pago}`,
    d.notas ? `Notas: ${d.notas}` : null,
    o.enlace ? `\nPanel: ${o.enlace}` : null,
  ].filter((x) => x !== null).join('\n');
}

/* ---------- Registro desde la carta ---------- */

/**
 * Cuerpo: { items: [{ id (de la opción), qty }], nombre, telefono, entrega, comuna?, direccion?, pago, notas? }.
 * Los precios salen de la BD; se omiten opciones ocultas o productos agotados.
 */
export async function registrarPedido(body: Record<string, unknown>) {
  const cliente: DatosCliente = {
    nombre: str(body.nombre, 120),
    telefono: str(body.telefono, 40),
    entrega: str(body.entrega, 40),
    comuna: str(body.comuna, 80),
    direccion: str(body.direccion, 255),
    pago: str(body.pago, 60),
    notas: str(body.notas, 1000),
  };
  if (!cliente.nombre || !cliente.telefono) throw new HttpError(400, 'Escribe tu nombre y tu teléfono.');
  if (!(CONFIG.entregas as readonly string[]).includes(cliente.entrega)) throw new HttpError(400, 'Elige delivery o retiro en el local.');
  if (!(CONFIG.pagos as readonly string[]).includes(cliente.pago)) throw new HttpError(400, 'Elige la forma de pago.');
  const delivery = esDelivery(cliente.entrega);
  if (delivery && !cliente.direccion) throw new HttpError(400, 'Escribe la dirección de entrega.');
  if (!delivery) { cliente.direccion = ''; cliente.comuna = ''; }

  const qtys = new Map<number, number>();
  for (const it of Array.isArray(body.items) ? body.items.slice(0, MAX_LINEAS) : []) {
    const id = Number((it as { id?: unknown })?.id);
    const qty = Number((it as { qty?: unknown })?.qty);
    if (Number.isInteger(id) && id > 0 && Number.isInteger(qty) && qty > 0) qtys.set(id, Math.min(MAX_CANTIDAD, (qtys.get(id) ?? 0) + qty));
  }
  if (!qtys.size) throw new HttpError(400, 'Tu pedido está vacío.');

  const rows = await prisma.variante.findMany({
    where: { id: { in: [...qtys.keys()] }, activo: true, producto: { activo: true, agotado: false } },
    include: { producto: { select: { nombre: true } } },
  });
  const lineas = rows.map((v) => ({ v, qty: qtys.get(v.id)!, nombre: nombreLinea(v.producto.nombre, v.nombre) }));
  if (!lineas.length) throw new HttpError(409, 'Los productos de tu pedido ya no están disponibles.');
  const unidades = lineas.reduce((s, l) => s + l.qty, 0);
  const total = lineas.reduce((s, l) => s + l.v.precio * l.qty, 0);

  const pedido = await prisma.pedido.create({
    data: {
      nombre: cliente.nombre, telefono: cliente.telefono, entrega: cliente.entrega,
      comuna: cliente.comuna || null, direccion: cliente.direccion || null,
      pago: cliente.pago, notas: cliente.notas || null, unidades, total,
      items: { create: lineas.map((l) => ({ varianteId: l.v.id, codigo: l.v.codigo, nombre: l.nombre.slice(0, 255), cantidad: l.qty, precio: l.v.precio })) },
    },
  });
  const numero = numeroPedido(pedido.id);
  const msg = mensajePedido({
    lineas: lineas.map((l) => ({ qty: l.qty, nombre: l.nombre, precio: l.v.precio })),
    total, cliente, numero,
    // Con SITE_URL en .env, el mensaje lleva el enlace a la pantalla del pedido en el panel.
    enlace: process.env.SITE_URL ? `${process.env.SITE_URL.replace(/\/+$/, '')}/admin/pedidos/${pedido.id}` : undefined,
  });
  return {
    id: pedido.id, numero, unidades, total,
    omitidos: [...qtys.keys()].filter((id) => !rows.some((r) => r.id === id)),
    whatsapp: linkWa(msg),
  };
}

/* ---------- Panel ---------- */

/** "AAAA-MM-DD" → fecha local al inicio (o al final) del día; inválida → undefined */
export function leerFecha(s: string | null | undefined, finDelDia = false): Date | undefined {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return undefined;
  if (finDelDia) d.setHours(23, 59, 59, 999);
  return d;
}

const resumenSelect = {
  id: true, estado: true, nombre: true, telefono: true, entrega: true, comuna: true, pago: true, unidades: true, total: true, createdAt: true,
} as const;
type ResumenRow = Prisma.PedidoGetPayload<{ select: typeof resumenSelect }>;

const toResumen = (p: ResumenRow): PedidoResumen => ({
  id: p.id, numero: numeroPedido(p.id), estado: p.estado, nombre: p.nombre, telefono: p.telefono, entrega: p.entrega,
  comuna: p.comuna ?? '', pago: p.pago, unidades: p.unidades, total: p.total, createdAt: p.createdAt.toISOString(),
});

export async function listarPedidos(f: { estado?: string | null; q?: string | null; desde?: string | null; hasta?: string | null }): Promise<ListaPedidos> {
  const desde = leerFecha(f.desde);
  const hasta = leerFecha(f.hasta, true);
  const q = f.q?.trim().slice(0, 80) ?? '';
  const numero = q.match(/^(?:DC-?)?0*(\d{1,10})$/i);
  const base: Prisma.PedidoWhereInput = {
    ...(desde || hasta ? { createdAt: { ...(desde && { gte: desde }), ...(hasta && { lte: hasta }) } } : {}),
    ...(q ? {
      OR: [
        { nombre: { contains: q } }, { telefono: { contains: q } }, { comuna: { contains: q } }, { direccion: { contains: q } },
        ...(numero ? [{ id: Number(numero[1]) }] : []),
      ],
    } : {}),
  };
  const estado = ESTADOS.includes(f.estado as EstadoPedido) ? (f.estado as EstadoPedido) : undefined;

  const [rows, grupos] = await Promise.all([
    prisma.pedido.findMany({ where: { ...base, ...(estado && { estado }) }, select: resumenSelect, orderBy: { id: 'desc' }, take: MAX_LISTA }),
    prisma.pedido.groupBy({ by: ['estado'], where: base, _count: { _all: true } }),
  ]);
  const conteos = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoPedido, number>;
  for (const g of grupos) conteos[g.estado] = g._count._all;
  return { pedidos: rows.map(toResumen), conteos };
}

/** Pedidos pendientes (para el número del menú). */
export const contarPendientes = () => prisma.pedido.count({ where: { estado: 'PENDIENTE' } });

export async function obtenerPedido(id: number): Promise<PedidoDetalle | null> {
  const p = await prisma.pedido.findUnique({
    where: { id },
    select: {
      ...resumenSelect, direccion: true, notas: true,
      items: {
        select: { varianteId: true, codigo: true, nombre: true, cantidad: true, precio: true, variante: { select: { producto: { select: { img: true } } } } },
        orderBy: { id: 'asc' },
      },
      eventos: { select: { id: true, estado: true, comentario: true, autor: true, createdAt: true }, orderBy: { id: 'asc' } },
    },
  });
  if (!p) return null;
  return {
    ...toResumen(p),
    direccion: p.direccion ?? '',
    notas: p.notas ?? '',
    items: p.items.map((i) => ({
      varianteId: i.varianteId, codigo: i.codigo, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio,
      img: i.variante?.producto.img || null,
    })),
    eventos: [
      // El pedido recién llegado se muestra como primer paso del historial.
      { id: 0, estado: 'PENDIENTE' as const, comentario: 'Pedido recibido desde la carta online.', autor: 'Carta', createdAt: p.createdAt.toISOString() },
      ...p.eventos.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    ],
  };
}

/** Cambia el estado y/o agrega un comentario. Cancelar exige comentario (el motivo). */
export async function actualizarPedido(id: number, body: Record<string, unknown>, actor: UsuarioSesion): Promise<PedidoDetalle> {
  const actual = await prisma.pedido.findUnique({ where: { id }, select: { estado: true } });
  if (!actual) throw new HttpError(404, 'El pedido no existe.');
  const comentario = typeof body.comentario === 'string' ? body.comentario.trim().slice(0, COMENTARIO_MAX) : '';
  let estado: EstadoPedido | null = null;
  if (body.estado !== undefined && body.estado !== null && body.estado !== '') {
    if (!ESTADOS.includes(body.estado as EstadoPedido)) throw new HttpError(400, 'Estado no válido.');
    estado = body.estado as EstadoPedido;
    if (!TRANSICIONES[actual.estado].includes(estado)) {
      throw new HttpError(409, `Un pedido ${ESTADO_TEXTO[actual.estado].toLowerCase()} no puede pasar a ${ESTADO_TEXTO[estado].toLowerCase()}.`);
    }
    if (estado === 'CANCELADO' && !comentario) throw new HttpError(400, 'Escribe el motivo de la cancelación en el comentario.');
  }
  if (!estado && !comentario) throw new HttpError(400, 'Escribe un comentario.');

  await prisma.$transaction([
    ...(estado ? [prisma.pedido.update({ where: { id }, data: { estado } })] : []),
    prisma.pedidoEvento.create({ data: { pedidoId: id, estado, comentario, usuarioId: actor.id || null, autor: actor.nombre.slice(0, 80) } }),
  ]);
  return (await obtenerPedido(id))!;
}
