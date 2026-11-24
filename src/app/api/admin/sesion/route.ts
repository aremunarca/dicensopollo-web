import { cerrarSesion, claveCliente, esperaLogin, iniciarSesion, limpiarFallos, registrarFallo, usuarioActual } from '@/lib/auth';
import { error, json, manejar, readJson, str } from '@/lib/api';

/** GET /api/admin/sesion — usuario de la sesión actual (o { autenticado: false }). */
export async function GET() {
  const usuario = await usuarioActual();
  return json(usuario ? { autenticado: true, usuario } : { autenticado: false });
}

/** POST /api/admin/sesion — { usuario, password } inicia sesión en el panel. */
export async function POST(req: Request) {
  return manejar(async () => {
    const clave = claveCliente(req);
    const espera = esperaLogin(clave);
    if (espera) return error(`Demasiados intentos fallidos. Espera ${espera} min e intenta de nuevo.`, 429);
    const body = await readJson(req);
    const usuario = await iniciarSesion(str(body?.usuario, 40), typeof body?.password === 'string' ? body.password.slice(0, 200) : '');
    if (!usuario) {
      registrarFallo(clave);
      await new Promise((r) => setTimeout(r, 400)); // frena los intentos masivos
      return error('Usuario o contraseña incorrectos.', 401);
    }
    limpiarFallos(clave);
    return json({ autenticado: true, usuario });
  });
}

/** DELETE /api/admin/sesion — cierra la sesión. */
export async function DELETE() {
  await cerrarSesion();
  return json({ ok: true });
}
