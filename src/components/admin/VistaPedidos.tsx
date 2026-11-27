'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ESTADO_PLURAL, ESTADOS, type EstadoPedido, type ListaPedidos, type PedidoResumen } from '@/lib/admin-tipos';
import { fmt } from '@/lib/config';
import { ApiError, api, ChipEstado, fechaHora, useModal, type Toast } from './comun';
import PedidoDetalle from './PedidoDetalle';

type Pestana = EstadoPedido | 'TODOS';
const REFRESCO_MS = 30_000;

/** Pedidos de la carta: se confirman (en preparación), entregan o cancelan, y se comentan. Se actualiza sola. */
export default function VistaPedidos(props: {
  toast: Toast;
  onSesionVencida: () => void;
  onPendientes: (n: number) => void;
  pedidoInicial: number | null;
}) {
  const { toast, onSesionVencida, onPendientes } = props;
  const [pestana, setPestana] = useState<Pestana>('PENDIENTE');
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pedidos, setPedidos] = useState<PedidoResumen[] | null>(null);
  const [conteos, setConteos] = useState<Record<EstadoPedido, number> | null>(null);
  const [abierto, setAbierto] = useState<number | null>(props.pedidoInicial);

  const fallar = useCallback((e: unknown, msg: string) => {
    if (e instanceof ApiError && e.status === 401) onSesionVencida();
    toast(e instanceof Error && e.message ? e.message : msg, 'error');
  }, [onSesionVencida, toast]);

  const cargar = useCallback(async () => {
    const sp = new URLSearchParams();
    if (pestana !== 'TODOS') sp.set('estado', pestana);
    if (q.trim()) sp.set('q', q.trim());
    if (desde) sp.set('desde', desde);
    if (hasta) sp.set('hasta', hasta);
    try {
      const r = await api<ListaPedidos>(`/api/admin/pedidos?${sp}`);
      setPedidos(r.pedidos); setConteos(r.conteos);
      // El número del menú es de todos los pendientes: solo se sabe exacto sin filtros de búsqueda o fecha.
      if (!q.trim() && !desde && !hasta) onPendientes(r.conteos.PENDIENTE);
    } catch (e) {
      fallar(e, 'No se pudieron cargar los pedidos.');
    }
  }, [pestana, q, desde, hasta, onPendientes, fallar]);

  const cargarRef = useRef(cargar);
  useEffect(() => { cargarRef.current = cargar; }, [cargar]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 250); // pequeña pausa al escribir
    return () => clearTimeout(t);
  }, [cargar]);

  // Se actualiza sola cada 30 s y al volver a la pestaña del navegador.
  useEffect(() => {
    const iv = setInterval(() => void cargarRef.current(), REFRESCO_MS);
    const vis = () => { if (document.visibilityState === 'visible') void cargarRef.current(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
  }, []);

  const total = conteos ? ESTADOS.reduce((s, e) => s + conteos[e], 0) : 0;
  const pestanas: { id: Pestana; label: string; n: number }[] = [
    ...ESTADOS.map((e) => ({ id: e as Pestana, label: ESTADO_PLURAL[e], n: conteos?.[e] ?? 0 })),
    { id: 'TODOS', label: 'Todos', n: total },
  ];

  const cerrar = useCallback(() => setAbierto(null), []);
  const errorCarga = useCallback((e: ApiError) => { fallar(e, 'No se pudo abrir el pedido.'); setAbierto(null); }, [fallar]);

  return (
    <section aria-label="Pedidos">
      <div className="adm-tabs" role="tablist" aria-label="Estado de los pedidos">
        {pestanas.map((p) => (
          <button key={p.id} role="tab" type="button" aria-selected={pestana === p.id}
            className={`adm-tab${pestana === p.id ? ' is-active' : ''}${p.id === 'PENDIENTE' && p.n > 0 ? ' adm-tab--alerta' : ''}`}
            onClick={() => { setPestana(p.id); setPedidos(null); }}>
            {p.label}<span>{p.n}</span>
          </button>
        ))}
      </div>

      <div className="adm-barra">
        <input className="adm-input adm-buscar" type="search" placeholder="Buscar por N° de pedido, cliente, teléfono, dirección o comuna"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar pedidos" />
        <label className="adm-fecha">Desde<input className="adm-input" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="adm-fecha">Hasta<input className="adm-input" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} /></label>
        <button className="adm-btn" type="button" onClick={() => void cargar()}>↻ Actualizar</button>
      </div>

      {!pedidos ? (
        <p className="adm-vacio">Cargando pedidos…</p>
      ) : !pedidos.length ? (
        <p className="adm-vacio adm-card">{pestana === 'PENDIENTE' ? 'No hay pedidos pendientes por confirmar. 🍗' : 'No hay pedidos con estos filtros.'}</p>
      ) : (
        <div className="adm-tabla-wrap adm-card adm-card--tabla">
          <table className="adm-t adm-t--clic">
            <thead>
              <tr><th>N° pedido</th><th>Fecha</th><th>Cliente</th><th>Entrega</th><th className="num">Total</th><th>Estado</th><th aria-label="Acciones"></th></tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className={p.estado === 'PENDIENTE' ? 'is-pendiente' : ''} onClick={() => setAbierto(p.id)}>
                  <td className="adm-num-pedido">{p.numero}<small>{p.unidades} producto{p.unidades === 1 ? '' : 's'}</small></td>
                  <td>{fechaHora(p.createdAt)}</td>
                  <td><b>{p.nombre}</b><small>{p.telefono}</small></td>
                  <td><b>{p.entrega}</b><small>{p.sucursal}</small>{p.comuna && <small>{p.comuna}</small>}</td>
                  <td className="num"><b>{fmt(p.total)}</b><small>{p.pago}</small></td>
                  <td><ChipEstado estado={p.estado} /></td>
                  <td><button className="adm-btn" type="button" onClick={(e) => { e.stopPropagation(); setAbierto(p.id); }}>Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {pedidos.length >= 300 && <p className="adm-meta adm-pad">Se muestran los 300 más recientes. Usa la búsqueda o las fechas para ver otros.</p>}
        </div>
      )}

      {abierto !== null && (
        <Modal onCerrar={cerrar}>
          <PedidoDetalle id={abierto} toast={toast} onSesionVencida={onSesionVencida} onErrorCarga={errorCarga} onCambio={() => void cargar()} />
          <p className="adm-meta adm-pad"><a className="adm-link" href={`/admin/pedidos/${abierto}`} target="_blank" rel="noopener">Abrir en pantalla completa ↗</a></p>
        </Modal>
      )}
    </section>
  );
}

export function Modal({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  useModal(onCerrar);
  return (
    <div className="adm-velo" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="adm-editor adm-modal" role="dialog" aria-modal="true" aria-labelledby="t-pedido">
        <button type="button" className="icon-btn adm-modal__x" aria-label="Cerrar" onClick={onCerrar}>✕</button>
        <div className="adm-modal__cuerpo">{children}</div>
      </div>
    </div>
  );
}
