import 'server-only';
import { prisma } from './prisma';
import { HttpError } from './api';
import { cifrarPassword, MIN_PASSWORD } from './auth';
import { ROLES, type Rol, type UsuarioPanel, type UsuarioSesion } from './admin-tipos';

// Usuarios del panel (solo el gerente los administra). Siempre debe quedar al menos un gerente activo.

const PATRON = /^[a-z0-9._-]{3,40}$/;
const select = { id: true, nombre: true, usuario: true, rol: true, activo: true, ultimoAcceso: true, createdAt: true } as const;
type Row = { id: number; nombre: string; usuario: string; rol: Rol; activo: boolean; ultimoAcceso: Date | null; createdAt: Date };

const toDTO = (r: Row): UsuarioPanel => ({ ...r, ultimoAcceso: r.ultimoAcceso?.toISOString() ?? null, createdAt: r.createdAt.toISOString() });

function leerRol(v: unknown): Rol {
  if (ROLES.includes(v as Rol)) return v as Rol;
  throw new HttpError(400, 'Rol no válido.');
}
function leerNombre(v: unknown) {
  const nombre = typeof v === 'string' ? v.trim() : '';
  if (!nombre) throw new HttpError(400, 'Escribe el nombre de la persona.');
  if (nombre.length > 80) throw new HttpError(400, 'El nombre admite hasta 80 caracteres.');
  return nombre;
}
function leerPassword(v: unknown) {
  const pw = typeof v === 'string' ? v : '';
  if (pw.length < MIN_PASSWORD) throw new HttpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  if (pw.length > 128) throw new HttpError(400, 'La contraseña es demasiado larga.');
  return pw;
}

export async function listarUsuarios(): Promise<UsuarioPanel[]> {
  const rows = await prisma.usuario.findMany({ orderBy: [{ activo: 'desc' }, { rol: 'asc' }, { nombre: 'asc' }], select });
  return rows.map(toDTO);
}

export async function crearUsuario(body: Record<string, unknown>): Promise<UsuarioPanel> {
  const usuario = (typeof body.usuario === 'string' ? body.usuario : '').trim().toLowerCase();
  if (!PATRON.test(usuario)) throw new HttpError(400, 'El usuario debe tener de 3 a 40 caracteres: letras, números, punto, guion o guion bajo.');
  const data = { nombre: leerNombre(body.nombre), usuario, rol: leerRol(body.rol), passwordHash: await cifrarPassword(leerPassword(body.password)) };
  if (await prisma.usuario.findUnique({ where: { usuario }, select: { id: true } })) throw new HttpError(409, `El usuario "${usuario}" ya existe.`);
  return toDTO(await prisma.usuario.create({ data, select }));
}

/** Cambia nombre, rol, estado o contraseña. */
export async function actualizarUsuario(id: number, body: Record<string, unknown>, actor: UsuarioSesion): Promise<UsuarioPanel> {
  const actual = await prisma.usuario.findUnique({ where: { id }, select });
  if (!actual) throw new HttpError(404, 'El usuario no existe.');
  const data: { nombre?: string; rol?: Rol; activo?: boolean; passwordHash?: string } = {};
  if (body.nombre !== undefined) data.nombre = leerNombre(body.nombre);
  if (body.rol !== undefined) data.rol = leerRol(body.rol);
  if (body.activo !== undefined) data.activo = body.activo === true;
  if (body.password !== undefined && body.password !== '') data.passwordHash = await cifrarPassword(leerPassword(body.password));

  if (id === actor.id && (data.activo === false || (data.rol && data.rol !== 'GERENTE'))) {
    throw new HttpError(400, 'No puedes desactivarte ni quitarte el rol de gerente a ti mismo.');
  }
  const pierdeGerente = actual.rol === 'GERENTE' && actual.activo && (data.activo === false || (data.rol !== undefined && data.rol !== 'GERENTE'));
  if (pierdeGerente && (await prisma.usuario.count({ where: { rol: 'GERENTE', activo: true } })) <= 1) {
    throw new HttpError(400, 'Debe quedar al menos un gerente activo.');
  }
  return toDTO(await prisma.usuario.update({ where: { id }, data, select }));
}
