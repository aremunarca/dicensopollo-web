import 'server-only';
import { HttpError, str } from './api';
import { prisma } from './prisma';
import type { SucursalAdmin, SucursalPublica } from './admin-tipos';

type DatosSucursal = { nombre: string; telefono: string; direccion: string; comuna: string; activo?: boolean };
type CambiosSucursal = Partial<DatosSucursal>;

const telefonoValido = (valor: unknown) => {
  if (typeof valor !== 'string' || !/^\+?[\d\s().-]+$/.test(valor.trim())) return null;
  const digitos = valor.replace(/\D/g, '');
  return /^\d{8,15}$/.test(digitos) ? digitos : null;
};

function leerSucursal(body: Record<string, unknown>, parcial: false): DatosSucursal;
function leerSucursal(body: Record<string, unknown>, parcial: true): CambiosSucursal;
function leerSucursal(body: Record<string, unknown>, parcial = false): CambiosSucursal {
  const datos: CambiosSucursal = {};
  if (!parcial || body.nombre !== undefined) {
    const nombre = str(body.nombre, 80);
    if (nombre.length < 2) throw new HttpError(400, 'Escribe el nombre de la sucursal.');
    datos.nombre = nombre;
  }
  if (!parcial || body.telefono !== undefined) {
    const telefono = telefonoValido(body.telefono);
    if (!telefono) throw new HttpError(400, 'El WhatsApp debe incluir el código de país y tener entre 8 y 15 dígitos.');
    datos.telefono = telefono;
  }
  if (!parcial || body.direccion !== undefined) {
    const direccion = str(body.direccion, 255);
    if (direccion.length < 4) throw new HttpError(400, 'Escribe la dirección de la sucursal.');
    datos.direccion = direccion;
  }
  if (!parcial || body.comuna !== undefined) {
    const comuna = str(body.comuna, 80);
    if (comuna.length < 2) throw new HttpError(400, 'Escribe la comuna de la sucursal.');
    datos.comuna = comuna;
  }
  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') throw new HttpError(400, 'Estado de sucursal inválido.');
    datos.activo = body.activo;
  }
  return datos;
}

export async function listarSucursalesPublicas(): Promise<SucursalPublica[]> {
  return prisma.sucursal.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, direccion: true, comuna: true },
    orderBy: [{ orden: 'asc' }, { id: 'asc' }],
  });
}

export async function listarSucursalesAdmin(): Promise<SucursalAdmin[]> {
  return prisma.sucursal.findMany({
    select: { id: true, nombre: true, telefono: true, direccion: true, comuna: true, activo: true, orden: true },
    orderBy: [{ orden: 'asc' }, { id: 'asc' }],
  });
}

export async function crearSucursal(body: Record<string, unknown>): Promise<SucursalAdmin> {
  const datos = leerSucursal(body, false);
  const ultimo = await prisma.sucursal.aggregate({ _max: { orden: true } });
  return prisma.sucursal.create({
    data: { ...datos, orden: (ultimo._max.orden ?? 0) + 1 },
    select: { id: true, nombre: true, telefono: true, direccion: true, comuna: true, activo: true, orden: true },
  });
}

export async function actualizarSucursal(id: number, body: Record<string, unknown>): Promise<SucursalAdmin> {
  const actual = await prisma.sucursal.findUnique({ where: { id }, select: { id: true, activo: true } });
  if (!actual) throw new HttpError(404, 'La sucursal no existe.');
  const datos = leerSucursal(body, true);
  if (actual.activo && datos.activo === false) {
    const activas = await prisma.sucursal.count({ where: { activo: true } });
    if (activas <= 1) throw new HttpError(409, 'Debe quedar al menos una sucursal activa para recibir pedidos.');
  }
  return prisma.sucursal.update({
    where: { id },
    data: datos,
    select: { id: true, nombre: true, telefono: true, direccion: true, comuna: true, activo: true, orden: true },
  });
}
