'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { SucursalAdmin } from '@/lib/admin-tipos';
import { ApiError, api, jsonInit, Tarjeta, type Toast } from './comun';

type DatosSucursal = { nombre: string; telefono: string; direccion: string; comuna: string };
const VACIO: DatosSucursal = { nombre: '', telefono: '', direccion: '', comuna: '' };
const datosDe = (s: SucursalAdmin): DatosSucursal => ({ nombre: s.nombre, telefono: s.telefono, direccion: s.direccion, comuna: s.comuna });

export default function VistaSucursales({ toast, onSesionVencida }: { toast: Toast; onSesionVencida: () => void }) {
  const [sucursales, setSucursales] = useState<SucursalAdmin[] | null>(null);
  const [form, setForm] = useState(VACIO);
  const [editando, setEditando] = useState<number | null>(null);
  const [edicion, setEdicion] = useState<DatosSucursal>(VACIO);
  const [ocupado, setOcupado] = useState<number | 'nueva' | null>(null);

  const fallar = useCallback((e: unknown, mensaje: string) => {
    if (e instanceof ApiError && e.status === 401) onSesionVencida();
    toast(e instanceof Error && e.message ? e.message : mensaje, 'error');
  }, [onSesionVencida, toast]);

  useEffect(() => {
    api<SucursalAdmin[]>('/api/admin/sucursales').then(setSucursales).catch((e) => fallar(e, 'No se pudieron cargar las sucursales.'));
  }, [fallar]);

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setOcupado('nueva');
    try {
      const nueva = await api<SucursalAdmin>('/api/admin/sucursales', jsonInit('POST', form));
      setSucursales((l) => [...(l ?? []), nueva]);
      setForm(VACIO);
      toast(`Sucursal "${nueva.nombre}" creada.`);
    } catch (err) { fallar(err, 'No se pudo crear la sucursal.'); }
    finally { setOcupado(null); }
  }

  async function guardar(id: number) {
    setOcupado(id);
    try {
      const actualizada = await api<SucursalAdmin>(`/api/admin/sucursales/${id}`, jsonInit('PATCH', edicion));
      setSucursales((l) => l?.map((s) => s.id === id ? actualizada : s) ?? l);
      setEditando(null);
      toast(`Sucursal "${actualizada.nombre}" actualizada.`);
    } catch (err) { fallar(err, 'No se pudo actualizar la sucursal.'); }
    finally { setOcupado(null); }
  }

  async function cambiarEstado(s: SucursalAdmin) {
    setOcupado(s.id);
    try {
      const actualizada = await api<SucursalAdmin>(`/api/admin/sucursales/${s.id}`, jsonInit('PATCH', { activo: !s.activo }));
      setSucursales((l) => l?.map((x) => x.id === s.id ? actualizada : x) ?? l);
      toast(`Sucursal "${s.nombre}" ${s.activo ? 'desactivada' : 'activada'}.`);
    } catch (err) { fallar(err, 'No se pudo cambiar el estado de la sucursal.'); }
    finally { setOcupado(null); }
  }

  return (
    <section className="adm-sucursales" aria-label="Sucursales">
      <Tarjeta titulo="Sucursales registradas" sub="Cada sucursal recibe los pedidos en su propio WhatsApp">
        {!sucursales ? <p className="adm-vacio-s">Cargando sucursales…</p> : !sucursales.length ? (
          <p className="adm-vacio-s">Aún no hay sucursales registradas.</p>
        ) : (
          <ul className="adm-lista-sucursales">
            {sucursales.map((s) => (
              <li key={s.id} className={!s.activo ? 'is-inactivo' : ''}>
                {editando === s.id ? (
                  <div className="adm-sucursal-edicion">
                    <label className="adm-campo">Nombre
                      <input className="adm-input" maxLength={80} value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} />
                    </label>
                    <label className="adm-campo">WhatsApp con código de país
                      <input className="adm-input" type="tel" inputMode="tel" placeholder="56912345678" maxLength={24} value={edicion.telefono} onChange={(e) => setEdicion({ ...edicion, telefono: e.target.value })} />
                    </label>
                    <label className="adm-campo">Dirección
                      <input className="adm-input" maxLength={255} value={edicion.direccion} onChange={(e) => setEdicion({ ...edicion, direccion: e.target.value })} />
                    </label>
                    <label className="adm-campo">Comuna
                      <input className="adm-input" maxLength={80} value={edicion.comuna} onChange={(e) => setEdicion({ ...edicion, comuna: e.target.value })} />
                    </label>
                    <div className="adm-sucursal-acciones">
                      <button className="btn btn-brasa" type="button" disabled={ocupado === s.id} onClick={() => void guardar(s.id)}>Guardar</button>
                      <button className="adm-btn" type="button" onClick={() => setEditando(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="adm-sucursal-info">
                      <b>{s.nombre} {!s.activo && <em>· desactivada</em>}</b>
                      <small>{s.direccion}, {s.comuna}</small>
                      <small>WhatsApp: +{s.telefono}</small>
                    </span>
                    <div className="adm-sucursal-acciones">
                      <button className="adm-btn" type="button" onClick={() => { setEditando(s.id); setEdicion(datosDe(s)); }}>Editar</button>
                      <button className="adm-btn" type="button" disabled={ocupado === s.id} onClick={() => void cambiarEstado(s)}>{s.activo ? 'Desactivar' : 'Activar'}</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <form className="adm-card adm-form" onSubmit={crear}>
        <header><h3>Nueva sucursal</h3><span>WhatsApp en formato internacional, incluyendo el código de país</span></header>
        <label className="adm-campo">Nombre
          <input className="adm-input" required minLength={2} maxLength={80} placeholder="Ej.: Sucursal Centro" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </label>
        <label className="adm-campo">WhatsApp con código de país
          <input className="adm-input" required type="tel" inputMode="tel" placeholder="56912345678" maxLength={24} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
        </label>
        <label className="adm-campo">Dirección
          <input className="adm-input" required minLength={4} maxLength={255} placeholder="Calle y número" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
        </label>
        <label className="adm-campo">Comuna
          <input className="adm-input" required minLength={2} maxLength={80} placeholder="Comuna" value={form.comuna} onChange={(e) => setForm({ ...form, comuna: e.target.value })} />
        </label>
        <button className="btn btn-brasa" type="submit" disabled={ocupado !== null}>{ocupado === 'nueva' ? 'Creando…' : 'Crear sucursal'}</button>
      </form>
    </section>
  );
}
