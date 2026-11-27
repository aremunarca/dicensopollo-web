'use client';

import { useEffect, useState } from 'react';
import { COMENTARIO_MAX, ESTADO_TEXTO, TRANSICIONES, type EstadoPedido, type PedidoDetalle as Detalle } from '@/lib/admin-tipos';
import { CONFIG, esDelivery, fmt } from '@/lib/config';
import { ApiError, api, ChipEstado, fechaHora, jsonInit, type Toast } from './comun';

const ACCION: Record<EstadoPedido, string> = {
  PENDIENTE: 'Volver a pendiente',
  CONFIRMADO: 'Confirmar y preparar',
  ENTREGADO: 'Marcar entregado',
  CANCELADO: 'Cancelar pedido',
};

/** Teléfono chileno a formato internacional para wa.me (9 1234 5678 → 56912345678). */
function telefonoWa(tel: string) {
  const d = tel.replace(/\D/g, '');
  if (d.startsWith('56')) return d;
  if (d.length === 9 && d.startsWith('9')) return '56' + d;
  if (d.startsWith('0')) return '56' + d.replace(/^0+/, '');
  return d;
}

/**
 * Detalle de un pedido: cliente, productos, total, historial y acciones
 * (confirmar, entregar, cancelar, comentar). Se usa en el modal de Pedidos y en /admin/pedidos/[id].
 */
export default function PedidoDetalle(props: {
  id: number;
  toast: Toast;
  onSesionVencida: () => void;
  /** No se pudo cargar (no existe, sin conexión). */
  onErrorCarga: (e: ApiError) => void;
  onCambio?: (p: Detalle) => void;
  Titulo?: 'h1' | 'h2';
}) {
  const { id, onErrorCarga, Titulo = 'h2' } = props;
  const [pedido, setPedido] = useState<Detalle | null>(null);
  const [comentario, setComentario] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let activo = true;
    api<Detalle>(`/api/admin/pedidos/${id}`)
      .then((p) => { if (activo) setPedido(p); })
      .catch((e: ApiError) => { if (activo) onErrorCarga(e); });
    return () => { activo = false; };
  }, [id, onErrorCarga]);

  async function enviar(estado?: EstadoPedido) {
    if (!pedido || ocupado) return;
    const texto = comentario.trim();
    if (estado === 'CANCELADO' && !texto) return props.toast('Escribe el motivo de la cancelación en el comentario.', 'error');
    if (!estado && !texto) return props.toast('Escribe un comentario.', 'error');
    if (estado === 'CANCELADO' && !window.confirm(`¿Cancelar el pedido ${pedido.numero}?`)) return;
    setOcupado(true);
    try {
      const p = await api<Detalle>(`/api/admin/pedidos/${pedido.id}`, jsonInit('PATCH', { estado, comentario: texto }));
      setPedido(p); setComentario('');
      props.onCambio?.(p);
      props.toast(estado ? `${p.numero}: ${ESTADO_TEXTO[estado].toLowerCase()}.` : 'Comentario agregado.');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) props.onSesionVencida();
      props.toast(e instanceof Error ? e.message : 'No se pudo actualizar el pedido.', 'error');
    } finally {
      setOcupado(false);
    }
  }

  if (!pedido) return <p className="adm-vacio">Cargando pedido…</p>;

  const transiciones = TRANSICIONES[pedido.estado];
  const wa = telefonoWa(pedido.telefono);
  const msgWa = `Hola ${pedido.nombre}, te escribimos de ${CONFIG.nombre} 🍗 por tu pedido ${pedido.numero}.`;
  const delivery = esDelivery(pedido.entrega);
  const mapa = delivery && pedido.direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pedido.direccion}, ${pedido.comuna || CONFIG.comuna}, Chile`)}`
    : null;

  return (
    <div className="adm-pedido">
      <div className="adm-pedido__cab">
        <div>
          <p className="adm-eyebrow">{pedido.entrega} · {fechaHora(pedido.createdAt)}</p>
          <Titulo id="t-pedido">{pedido.numero}</Titulo>
          <p className="adm-meta">Sucursal: <b>{pedido.sucursal}</b>{pedido.direccionSucursal && ` · ${pedido.direccionSucursal}, ${pedido.comunaSucursal}`}</p>
        </div>
        <ChipEstado estado={pedido.estado} />
      </div>

      <div className="adm-pedido__grid">
        <section className="adm-bloque">
          <h3>Cliente</h3>
          <p><b>{pedido.nombre}</b></p>
          <p>
            {pedido.telefono}{' '}
            {wa.length >= 11 && (
              <a className="adm-link" href={`https://wa.me/${wa}?text=${encodeURIComponent(msgWa)}`} target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>
            )}
          </p>
          {delivery ? (
            <p className="adm-meta">
              Delivery a <b>{pedido.direccion || '(sin dirección)'}</b>{pedido.comuna && `, ${pedido.comuna}`}{' '}
              {mapa && <a className="adm-link" href={mapa} target="_blank" rel="noopener noreferrer">Ver en el mapa</a>}
            </p>
          ) : <p className="adm-meta">Retira en el local</p>}
          <p className="adm-meta">Pago: <b>{pedido.pago}</b></p>
          {pedido.notas && <p className="adm-notas">“{pedido.notas}”</p>}
        </section>
        <section className="adm-bloque adm-bloque--totales">
          <h3>Total</h3>
          <p>Total <strong>{fmt(pedido.total)}</strong></p>
          <p className="adm-meta">{pedido.unidades} producto{pedido.unidades === 1 ? '' : 's'}{delivery ? ' · más el delivery' : ''}</p>
        </section>
      </div>

      <div className="adm-tabla-wrap">
        <table className="adm-t">
          <thead>
            <tr><th>Producto</th><th className="num">Cant.</th><th className="num">Precio</th><th className="num">Subtotal</th></tr>
          </thead>
          <tbody>
            {pedido.items.map((it, i) => (
              <tr key={`${it.varianteId}-${i}`}>
                <td>
                  <div className="adm-item">
                    <span className="adm-mini adm-mini--s">{it.img ? <img src={it.img} alt="" loading="lazy" /> : null}</span>
                    <span><b>{it.nombre}</b><small>{it.codigo}{it.varianteId ? '' : ' · (opción eliminada)'}</small></span>
                  </div>
                </td>
                <td className="num">{it.cantidad}</td>
                <td className="num">{fmt(it.precio)}</td>
                <td className="num"><b>{fmt(it.precio * it.cantidad)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="adm-subtitulo">Historial y comentarios</h3>
      <ol className="adm-historial">
        {pedido.eventos.map((ev) => (
          <li key={ev.id}>
            <div>
              <ChipEstado estado={ev.estado ?? 'COMENTARIO'} />
              <small>{ev.autor || 'Sistema'} · {fechaHora(ev.createdAt)}</small>
            </div>
            {ev.comentario && <p>{ev.comentario}</p>}
          </li>
        ))}
      </ol>

      <div className="adm-acciones">
        <label className="adm-campo" htmlFor={`com-${pedido.id}`}>
          Comentario {transiciones.includes('CANCELADO') && <small className="adm-ayuda">(obligatorio para cancelar)</small>}
        </label>
        <textarea id={`com-${pedido.id}`} className="adm-input" rows={3} maxLength={COMENTARIO_MAX} value={comentario}
          placeholder="Ej.: Transferencia recibida, sale en 20 min." onChange={(e) => setComentario(e.target.value)} />
        <div className="adm-acciones__btns">
          <button className="adm-btn" type="button" disabled={ocupado || !comentario.trim()} onClick={() => enviar()}>Enviar comentario</button>
          {transiciones.map((e) => (
            <button key={e} type="button" disabled={ocupado} onClick={() => enviar(e)}
              className={`btn ${e === 'CANCELADO' ? 'adm-btn--peligro' : e === 'PENDIENTE' ? 'adm-btn-borde' : 'btn-brasa'}`}>
              {ACCION[e]}
            </button>
          ))}
        </div>
        {!transiciones.length && <p className="adm-meta">Este pedido está {ESTADO_TEXTO[pedido.estado].toLowerCase()}: solo admite comentarios.</p>}
      </div>
    </div>
  );
}
