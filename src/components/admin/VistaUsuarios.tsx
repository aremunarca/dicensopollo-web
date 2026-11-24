'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ROL_TEXTO, type Rol, type UsuarioPanel, type UsuarioSesion } from '@/lib/admin-tipos';
import { ApiError, api, fechaHora, jsonInit, Tarjeta, type Toast } from './comun';

const VACIO = { nombre: '', usuario: '', password: '', rol: 'LOGISTICA' as Rol };

/** Gerencia: usuarios del panel (crear, cambiar rol, activar/desactivar y cambiar contraseña). */
export default function VistaUsuarios({ yo, toast, onSesionVencida }: { yo: UsuarioSesion; toast: Toast; onSesionVencida: () => void }) {
  const [usuarios, setUsuarios] = useState<UsuarioPanel[] | null>(null);
  const [form, setForm] = useState(VACIO);
  const [ocupado, setOcupado] = useState(false);

  const fallar = useCallback((e: unknown, msg: string) => {
    if (e instanceof ApiError && e.status === 401) onSesionVencida();
    toast(e instanceof Error && e.message ? e.message : msg, 'error');
  }, [onSesionVencida, toast]);

  useEffect(() => {
    api<UsuarioPanel[]>('/api/admin/usuarios').then(setUsuarios).catch((e) => fallar(e, 'No se pudieron cargar los usuarios.'));
  }, [fallar]);

  const actualizar = async (u: UsuarioPanel, cambios: Record<string, unknown>, msg: string) => {
    try {
      const nuevo = await api<UsuarioPanel>(`/api/admin/usuarios/${u.id}`, jsonInit('PATCH', cambios));
      setUsuarios((l) => l?.map((x) => (x.id === nuevo.id ? nuevo : x)) ?? l);
      toast(msg);
    } catch (e) {
      fallar(e, 'No se pudo actualizar el usuario.');
    }
  };

  const cambiarPassword = (u: UsuarioPanel) => {
    const pw = window.prompt(`Nueva contraseña para ${u.nombre} (mínimo 8 caracteres):`);
    if (pw) void actualizar(u, { password: pw }, `Contraseña de ${u.nombre} actualizada.`);
  };

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    try {
      const u = await api<UsuarioPanel>('/api/admin/usuarios', jsonInit('POST', form));
      setUsuarios((l) => [...(l ?? []), u]);
      setForm(VACIO);
      toast(`Usuario "${u.usuario}" creado como ${ROL_TEXTO[u.rol].toLowerCase()}.`);
    } catch (err) {
      fallar(err, 'No se pudo crear el usuario.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section aria-label="Usuarios" className="adm-usuarios">
      <Tarjeta titulo="Usuarios del panel" sub="Gerente: todo · Despacho: pedidos, carta y carga masiva">
        {!usuarios ? <p className="adm-vacio-s">Cargando usuarios…</p> : (
          <ul className="adm-lista-usuarios">
            {usuarios.map((u) => {
              const soyYo = u.id === yo.id;
              return (
                <li key={u.id} className={u.activo ? '' : 'is-inactivo'}>
                  <span className="adm-avatar" aria-hidden="true">{u.nombre.slice(0, 1).toUpperCase()}</span>
                  <span className="adm-usuario">
                    <b>{u.nombre} {soyYo && <em>(tú)</em>}{!u.activo && <em> · desactivado</em>}</b>
                    <small>@{u.usuario} · último acceso: {fechaHora(u.ultimoAcceso)}</small>
                  </span>
                  <select className="adm-input" aria-label={`Rol de ${u.nombre}`} value={u.rol} disabled={soyYo}
                    onChange={(e) => void actualizar(u, { rol: e.target.value }, `${u.nombre} ahora es ${ROL_TEXTO[e.target.value as Rol].toLowerCase()}.`)}>
                    <option value="GERENTE">Gerente</option>
                    <option value="LOGISTICA">Despacho</option>
                  </select>
                  <button className="adm-btn" type="button" onClick={() => cambiarPassword(u)}>Contraseña</button>
                  <button className="adm-btn" type="button" disabled={soyYo}
                    onClick={() => void actualizar(u, { activo: !u.activo }, `${u.nombre} ${u.activo ? 'desactivado' : 'activado'}.`)}>
                    {u.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      <form className="adm-card adm-form" onSubmit={crear}>
        <header><h3>Nuevo usuario</h3><span>Entrará en /admin con su usuario y contraseña</span></header>
        <label className="adm-campo">Nombre
          <input className="adm-input" required maxLength={80} placeholder="Ej.: María Pérez" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </label>
        <label className="adm-campo">Usuario
          <input className="adm-input" required minLength={3} maxLength={40} pattern="[A-Za-z0-9._\-]{3,40}" autoCapitalize="none" spellCheck={false}
            placeholder="Ej.: maria.caja" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
        </label>
        <label className="adm-campo">Contraseña
          <input className="adm-input" required minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <label className="adm-campo">Rol
          <select className="adm-input" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}>
            <option value="LOGISTICA">Despacho — pedidos, carta y carga masiva</option>
            <option value="GERENTE">Gerente — acceso completo</option>
          </select>
        </label>
        <button className="btn btn-brasa" type="submit" disabled={ocupado}>{ocupado ? 'Creando…' : 'Crear usuario'}</button>
      </form>
    </section>
  );
}
