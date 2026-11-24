import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { TODOS, usuarioActual } from './auth';
import { error } from './respuestas';
import { ROL_TEXTO, type Rol, type UsuarioSesion } from './admin-tipos';

export { error, json } from './respuestas';

type Autorizacion = { usuario: UsuarioSesion; denegado?: undefined } | { usuario?: undefined; denegado: Response };

/**
 * Verifica el acceso a una ruta de administración. Se acepta:
 * - la sesión del panel /admin (cookie) con alguno de los roles indicados, o
 * - la cabecera X-API-Key = ADMIN_API_KEY (integraciones; actúa como gerente).
 * Uso: `const auth = await autorizar(req); if (auth.denegado) return auth.denegado;`
 */
export async function autorizar(req: Request, roles: readonly Rol[] = TODOS): Promise<Autorizacion> {
  if (req.headers.has('x-api-key')) {
    const key = process.env.ADMIN_API_KEY ?? '';
    if (key.length < 24) return { denegado: error('La API de administración está desactivada (configura ADMIN_API_KEY en .env).', 503) };
    const sent = Buffer.from(req.headers.get('x-api-key') ?? '');
    const expected = Buffer.from(key);
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) return { denegado: error('No autorizado.', 401) };
    return { usuario: { id: 0, nombre: 'API', usuario: 'api', rol: 'GERENTE' } };
  }
  const usuario = await usuarioActual();
  if (!usuario) return { denegado: error('Tu sesión expiró. Vuelve a entrar al panel.', 401) };
  if (!roles.includes(usuario.rol)) return { denegado: error(`El rol ${ROL_TEXTO[usuario.rol]} no tiene permiso para esta acción.`, 403) };
  return { usuario };
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Precio en pesos chilenos (entero). Acepta 14000, "14000", "14.000" o "$14.000". Inválido → null. */
export function leerPesos(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v) : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[$\s]/g, '').replace(/clp/i, '');
  if (!/^\d{1,3}(\.\d{3})+$|^\d+$|^\d+,\d{1,2}$/.test(s)) return null;
  const n = Math.round(Number(s.replace(/\./g, '').replace(',', '.')));
  return Number.isFinite(n) && n < 1e9 ? n : null;
}

/** Error con código HTTP que las rutas convierten en respuesta JSON. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Ejecuta la lógica de una ruta y convierte los HttpError (y fallos inesperados) en respuestas JSON. */
export async function manejar(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return error(e.message, e.status);
    console.error('[api]', e);
    return error('Ocurrió un error en el servidor. Intenta de nuevo.', 500);
  }
}

export const parseId = (s: string) => (/^\d{1,10}$/.test(s) ? Number(s) : null);
