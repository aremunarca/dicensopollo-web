import 'server-only';
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import type { Rol, UsuarioSesion } from './admin-tipos';

// Acceso al panel /admin con usuario y contraseña, y dos roles:
//   GERENTE   → todo: estadísticas, usuarios y lo de logística.
//   LOGISTICA → despacho: pedidos (confirmar, entregar, comentar), carta y carga masiva.
// La sesión es una cookie httpOnly firmada con ADMIN_SESSION_SECRET + la contraseña cifrada del
// usuario: si cambia su contraseña o lo desactivan, sus sesiones abiertas dejan de valer.

const COOKIE = 'dc_admin';
const DURACION_S = 12 * 60 * 60;
export const MIN_PASSWORD = 8;
export const TODOS: readonly Rol[] = ['GERENTE', 'LOGISTICA'];
export const SOLO_GERENTE: readonly Rol[] = ['GERENTE'];

/* ---------- Contraseñas (scrypt) ---------- */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function cifrarPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

async function verificarPassword(password: string, guardado: string) {
  const [esquema, sal, hash] = guardado.split('$');
  if (esquema !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64url');
  const real = await scrypt(password, Buffer.from(sal, 'base64url'), esperado.length);
  return real.length === esperado.length && timingSafeEqual(real, esperado);
}
const HASH_FALSO = `scrypt$${'A'.repeat(22)}$${'A'.repeat(86)}`;

/* ---------- Firma de la sesión ---------- */

function secreto() {
  const s = process.env.ADMIN_SESSION_SECRET ?? '';
  if (s.length < 32) throw new Error('ADMIN_SESSION_SECRET debe tener al menos 32 caracteres (revisa .env).');
  return s;
}
const firmar = (payload: string, passwordHash: string) => createHmac('sha256', `${secreto()}:${passwordHash}`).update(payload).digest('base64url');
const iguales = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

const select = { id: true, nombre: true, usuario: true, rol: true, activo: true, passwordHash: true } as const;

/**
 * Primer acceso: si todavía no hay usuarios, crea el gerente inicial
 * (usuario ADMIN_USER, por defecto "admin", con la contraseña ADMIN_PASSWORD).
 */
async function crearGerenteInicial() {
  if ((await prisma.usuario.count()) > 0) return;
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (password.length < MIN_PASSWORD) throw new Error(`ADMIN_PASSWORD debe tener al menos ${MIN_PASSWORD} caracteres (revisa .env).`);
  const usuario = (process.env.ADMIN_USER || 'admin').trim().toLowerCase();
  await prisma.usuario.create({ data: { nombre: 'Gerente', usuario, passwordHash: await cifrarPassword(password), rol: 'GERENTE' } });
  console.warn(`[auth] Se creó el usuario inicial "${usuario}" (gerente). Cambia su contraseña desde el panel → Usuarios.`);
}

/** Valida usuario y contraseña y abre la sesión. Devuelve el usuario o null. */
export async function iniciarSesion(usuarioTxt: string, password: string): Promise<UsuarioSesion | null> {
  await crearGerenteInicial();
  const usuario = usuarioTxt.trim().toLowerCase();
  const row = usuario ? await prisma.usuario.findUnique({ where: { usuario }, select }) : null;
  // Se calcula un hash aunque el usuario no exista, para no revelar cuáles existen por el tiempo de respuesta.
  const ok = await verificarPassword(password, row?.passwordHash ?? HASH_FALSO);
  if (!row || !row.activo || !ok) return null;

  const exp = Math.floor(Date.now() / 1000) + DURACION_S;
  const payload = `${row.id}.${exp}.${randomBytes(9).toString('base64url')}`;
  (await cookies()).set(COOKIE, `${payload}.${firmar(payload, row.passwordHash)}`, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: DURACION_S,
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_INSECURE !== 'true',
  });
  await prisma.usuario.update({ where: { id: row.id }, data: { ultimoAcceso: new Date() } });
  return { id: row.id, nombre: row.nombre, usuario: row.usuario, rol: row.rol };
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE);
}

/** Usuario de la sesión actual, o null (sin sesión, vencida, alterada o usuario inactivo). */
export async function usuarioActual(): Promise<UsuarioSesion | null> {
  const partes = ((await cookies()).get(COOKIE)?.value ?? '').split('.');
  if (partes.length !== 4) return null;
  const [idTxt, expTxt, nonce, firma] = partes;
  const id = Number(idTxt);
  if (!Number.isSafeInteger(id) || !(Number(expTxt) > Date.now() / 1000)) return null;
  try {
    const row = await prisma.usuario.findUnique({ where: { id }, select });
    if (!row?.activo || !iguales(firma, firmar(`${idTxt}.${expTxt}.${nonce}`, row.passwordHash))) return null;
    return { id: row.id, nombre: row.nombre, usuario: row.usuario, rol: row.rol };
  } catch {
    return null;
  }
}

/* ---------- Límite de intentos fallidos (en memoria) ---------- */

const VENTANA_MS = 15 * 60 * 1000;
const fallos = new Map<string, { n: number; hasta: number }>();
const MAX_POR_IP = 8;
const MAX_GLOBAL = 40;

export const claveCliente = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';

/** Minutos que hay que esperar antes de volver a intentar (0 = puede intentar). */
export function esperaLogin(clave: string) {
  const ahora = Date.now();
  const bloqueo = (k: string, max: number) => {
    const f = fallos.get(k);
    if (!f || f.hasta <= ahora) return 0;
    return f.n >= max ? f.hasta - ahora : 0;
  };
  return Math.ceil(Math.max(bloqueo(clave, MAX_POR_IP), bloqueo('*', MAX_GLOBAL)) / 60000);
}
export function registrarFallo(clave: string) {
  const ahora = Date.now();
  for (const k of [clave, '*']) {
    const f = fallos.get(k);
    if (!f || f.hasta <= ahora) fallos.set(k, { n: 1, hasta: ahora + VENTANA_MS });
    else f.n++;
  }
}
export const limpiarFallos = (clave: string) => fallos.delete(clave);
