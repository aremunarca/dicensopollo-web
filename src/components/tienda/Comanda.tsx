'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CONFIG, esDelivery, fmt } from '@/lib/config';
import type { SucursalPublica } from '@/lib/admin-tipos';

export type Linea = { id: number; nombre: string; opcion: string | null; precio: number; qty: number; img: string };

type Paso = 'comanda' | 'datos' | 'listo';
type Cliente = { nombre: string; telefono: string; entrega: string; comuna: string; direccion: string; pago: string; notas: string; sucursalId: string };
const CLAVE_CLIENTE = 'dc_cliente_v1';
const VACIO: Omit<Cliente, 'sucursalId'> = { nombre: '', telefono: '', entrega: CONFIG.entregas[0], comuna: '', direccion: '', pago: CONFIG.pagos[0], notas: '' };

/**
 * La comanda: el pedido impreso como ticket de cocina. Paso 1 revisa los productos,
 * paso 2 pide los datos y el pedido se registra y se abre WhatsApp con el mensaje listo.
 */
export default function Comanda(props: {
  abierta: boolean;
  lineas: Linea[];
  sucursales: SucursalPublica[];
  onCantidad: (id: number, qty: number) => void;
  onVaciar: () => void;
  onCerrar: () => void;
}) {
  const { abierta, lineas, onCerrar } = props;
  const [paso, setPaso] = useState<Paso>('comanda');
  const [c, setC] = useState<Cliente>(() => ({ ...VACIO, sucursalId: String(props.sucursales[0]?.id ?? '') }));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState<{ numero: string; whatsapp: string; total: number } | null>(null);
  const [hora, setHora] = useState('');
  const panel = useRef<HTMLDivElement>(null);

  const total = lineas.reduce((s, l) => s + l.precio * l.qty, 0);
  const unidades = lineas.reduce((s, l) => s + l.qty, 0);
  const delivery = esDelivery(c.entrega);
  const sucursal = props.sucursales.find((s) => s.id === Number(c.sucursalId));

  // Datos del cliente guardados en este equipo (para el próximo pedido)
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_CLIENTE) ?? 'null');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- se leen una vez al montar (localStorage no existe en el servidor)
      if (g && typeof g === 'object') setC((x) => ({
        ...x, ...g, notas: '',
        sucursalId: props.sucursales.some((s) => s.id === Number(g.sucursalId)) ? String(g.sucursalId) : String(props.sucursales[0]?.id ?? ''),
      }));
    } catch { /* datos dañados: se ignoran */ }
  }, [props.sucursales]);

  useEffect(() => {
    if (!abierta) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la hora del ticket se toma al abrir (no en el servidor)
    setHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [abierta, onCerrar]);

  const cerrar = () => {
    onCerrar();
    if (paso === 'listo') { setPaso('comanda'); setListo(null); }
  };

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!c.nombre.trim() || !c.telefono.trim()) return setError('Escribe tu nombre y tu teléfono.');
    if (!sucursal) return setError('Selecciona una sucursal activa.');
    if (delivery && !c.direccion.trim()) return setError('Escribe la dirección de entrega.');
    setEnviando(true);
    const res = await fetch('/api/pedidos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, items: lineas.map((l) => ({ id: l.id, qty: l.qty })) }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setEnviando(false);
    if (!res?.ok || !data?.whatsapp) return setError(data?.error ?? 'Sin conexión. Revisa tu internet e intenta de nuevo.');

    localStorage.setItem(CLAVE_CLIENTE, JSON.stringify({ ...c, notas: '' }));
    setListo({ numero: data.numero, whatsapp: data.whatsapp, total: data.total });
    setPaso('listo');
    props.onVaciar();
    setC((x) => ({ ...x, notas: '' }));
    const w = window.open(data.whatsapp, '_blank', 'noopener');
    if (!w) window.location.href = data.whatsapp;
  }

  const set = (k: keyof Cliente) => (e: { target: { value: string } }) => setC((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className={`comanda${abierta ? ' is-open' : ''}`} aria-hidden={!abierta} inert={!abierta}>
      <div className="comanda__velo" onClick={cerrar} />
      <div className="comanda__panel" role="dialog" aria-modal="true" aria-labelledby="t-comanda" tabIndex={-1} ref={panel}>
        <div className="comanda__barra">
          <span id="t-comanda">Tu comanda</span>
          <button type="button" className="comanda__x" onClick={cerrar} aria-label="Cerrar la comanda">✕</button>
        </div>

        <div className="ticket">
          <div className="ticket__cab">
            <img src="/marca/logo.webp" alt="" width={56} height={56} />
            <div>
              <b>{CONFIG.nombre.toUpperCase()}</b>
              <span>{sucursal ? `${sucursal.direccion} · ${sucursal.comuna}` : `${CONFIG.direccion} · ${CONFIG.comuna}`}</span>
              <span>{paso === 'listo' && listo ? `PEDIDO ${listo.numero}` : `COMANDA · ${hora}`}</span>
            </div>
          </div>

          {paso === 'listo' && listo ? (
            <div className="ticket__listo">
              <p className="ticket__grande">¡Comanda enviada!</p>
              <p>Tu pedido <b>{listo.numero}</b> por <b>{fmt(listo.total)}</b> quedó registrado. Termina de enviarlo en WhatsApp y te confirmamos por ahí.</p>
              <a className="btn btn-wa ancho" href={listo.whatsapp} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
              <button type="button" className="ticket__link" onClick={cerrar}>Volver a la carta</button>
            </div>
          ) : !lineas.length ? (
            <div className="ticket__vacio">
              <p className="ticket__grande">Comanda vacía</p>
              <p>Elige tus platos en la carta y aparecerán aquí.</p>
              <button type="button" className="btn btn-fuego ancho" onClick={cerrar}>Ver la carta</button>
            </div>
          ) : paso === 'comanda' ? (
            <>
              <ul className="ticket__lineas">
                {lineas.map((l) => (
                  <li key={l.id}>
                    <div className="ticket__linea">
                      <span className="ticket__qty">{l.qty}×</span>
                      <span className="ticket__nom">{l.nombre}{l.opcion && <small>{l.opcion}</small>}</span>
                      <span className="ticket__punt" aria-hidden="true" />
                      <span className="ticket__monto">{fmt(l.precio * l.qty)}</span>
                    </div>
                    <div className="ticket__ctrl">
                      <button type="button" onClick={() => props.onCantidad(l.id, l.qty - 1)} aria-label={`Quitar uno de ${l.nombre}`}>−</button>
                      <button type="button" onClick={() => props.onCantidad(l.id, l.qty + 1)} aria-label={`Agregar uno de ${l.nombre}`}>+</button>
                      <button type="button" className="ticket__quitar" onClick={() => props.onCantidad(l.id, 0)}>quitar</button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="ticket__total">
                <span>{unidades} {unidades === 1 ? 'producto' : 'productos'}</span>
                <span>TOTAL <b>{fmt(total)}</b></span>
              </div>
              <p className="ticket__nota">El costo del delivery se confirma por WhatsApp.</p>
              <button type="button" className="btn btn-fuego ancho" onClick={() => setPaso('datos')}>Continuar con mis datos</button>
              <button type="button" className="ticket__link" onClick={() => { if (window.confirm('¿Vaciar la comanda?')) props.onVaciar(); }}>Vaciar comanda</button>
            </>
          ) : (
            <form className="ticket__form" onSubmit={enviar} noValidate>
              <label className="campo">Sucursal
                <select value={c.sucursalId} onChange={set('sucursalId')} required disabled={!props.sucursales.length}>
                  <option value="">Selecciona una sucursal</option>
                  {props.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre} — {s.comuna}</option>)}
                </select>
                {sucursal && <small>{sucursal.direccion}, {sucursal.comuna}</small>}
                {!props.sucursales.length && <small>No hay sucursales activas disponibles para tomar pedidos.</small>}
              </label>
              <div className="seg" role="radiogroup" aria-label="Entrega">
                {CONFIG.entregas.map((x) => (
                  <label key={x} className={c.entrega === x ? 'is-on' : ''}>
                    <input type="radio" name="entrega" checked={c.entrega === x} onChange={() => setC((v) => ({ ...v, entrega: x }))} />
                    {x}
                  </label>
                ))}
              </div>
              <label className="campo">Nombre
                <input value={c.nombre} onChange={set('nombre')} autoComplete="name" maxLength={120} required />
              </label>
              <label className="campo">Teléfono (WhatsApp)
                <input value={c.telefono} onChange={set('telefono')} type="tel" inputMode="tel" autoComplete="tel" placeholder="+56 9 1234 5678" maxLength={40} required />
              </label>
              {delivery && (
                <>
                  <label className="campo">Dirección de entrega
                    <input value={c.direccion} onChange={set('direccion')} autoComplete="street-address" placeholder="Calle, número, depto." maxLength={255} required />
                  </label>
                  <label className="campo">Comuna
                    <input value={c.comuna} onChange={set('comuna')} placeholder={CONFIG.comuna} maxLength={80} />
                  </label>
                </>
              )}
              <fieldset className="campo">
                <legend>Forma de pago</legend>
                <div className="seg seg--wrap">
                  {CONFIG.pagos.map((x) => (
                    <label key={x} className={c.pago === x ? 'is-on' : ''}>
                      <input type="radio" name="pago" checked={c.pago === x} onChange={() => setC((v) => ({ ...v, pago: x }))} />
                      {x}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="campo">Notas para la cocina <small>(opcional)</small>
                <textarea value={c.notas} onChange={set('notas')} rows={2} maxLength={1000} placeholder="Ej.: sin cebolla, salsa aparte…" />
              </label>
              <div className="ticket__total"><span>{unidades} {unidades === 1 ? 'producto' : 'productos'}</span><span>TOTAL <b>{fmt(total)}</b></span></div>
              {error && <p className="ticket__error" role="alert">{error}</p>}
              <button className="btn btn-wa ancho" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar comanda por WhatsApp'}</button>
              <button type="button" className="ticket__link" onClick={() => setPaso('comanda')}>← Volver a la comanda</button>
            </form>
          )}
          <p className="ticket__pie">*** {CONFIG.lema.toUpperCase()} ***</p>
        </div>
      </div>
    </div>
  );
}
