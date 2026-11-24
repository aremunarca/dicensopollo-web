'use client';

import { useId, useState } from 'react';
import { fmt, type ProductoCarta } from '@/lib/config';

/**
 * Tarjeta de la carta: foto, descripción, opciones (chips) y cantidad. Se agrega a la comanda
 * sin abrir ventanas. Los agotados se ven con sello y no se pueden pedir.
 */
export default function Tarjeta({ p, onAgregar, grande = false }: {
  p: ProductoCarta;
  onAgregar: (varianteId: number, qty: number) => void;
  grande?: boolean;
}) {
  const [sel, setSel] = useState(p.opciones[0]?.id ?? 0);
  const [qty, setQty] = useState(1);
  const [hecho, setHecho] = useState(false);
  const grupo = useId();
  const op = p.opciones.find((o) => o.id === sel) ?? p.opciones[0];
  if (!op) return null;
  const varias = p.opciones.length > 1;
  const desde = Math.min(...p.opciones.map((o) => o.precio));

  const agregar = () => {
    if (p.agotado) return;
    onAgregar(op.id, qty);
    setHecho(true); setQty(1);
    setTimeout(() => setHecho(false), 1300);
  };

  return (
    <article className={`plato${grande ? ' plato--grande' : ''}${p.agotado ? ' is-agotado' : ''}`} id={grande ? undefined : `p-${p.slug}`}>
      <div className="plato__foto">
        {p.img ? <img src={p.img} alt={p.nombre} loading="lazy" width={800} height={800} /> : <span className="plato__sinfoto" aria-hidden="true" />}
        {p.agotado && <span className="plato__sello">Agotado hoy</span>}
        {varias && <span className="plato__desde">desde <b>{fmt(desde)}</b></span>}
      </div>
      <div className="plato__cuerpo">
        <h3 className="plato__nombre">{p.nombre}</h3>
        {p.descripcion && <p className="plato__desc">{p.descripcion}</p>}

        {varias && (
          <fieldset className="chips" aria-label={`${p.opcion || 'Opción'} de ${p.nombre}`}>
            <legend>{p.opcion || 'Opción'}</legend>
            {p.opciones.map((o) => (
              <label key={o.id} className={`chip${o.id === op.id ? ' is-on' : ''}`}>
                <input type="radio" name={grupo} checked={o.id === op.id} onChange={() => setSel(o.id)} disabled={p.agotado} />
                <span>{o.nombre}</span>
                <small>{fmt(o.precio)}</small>
              </label>
            ))}
          </fieldset>
        )}
        {op.detalle && <p className="plato__detalle"><b>Incluye:</b> {op.detalle}</p>}

        <div className="plato__pie">
          <div className="cant" role="group" aria-label="Cantidad">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={p.agotado || qty <= 1} aria-label="Menos">−</button>
            <output aria-live="polite">{qty}</output>
            <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} disabled={p.agotado} aria-label="Más">+</button>
          </div>
          <button type="button" className={`btn-agregar${hecho ? ' is-hecho' : ''}`} onClick={agregar} disabled={p.agotado}
            aria-label={p.agotado ? `${p.nombre}: agotado` : `Agregar ${qty} ${p.nombre}${varias ? ` (${op.nombre})` : ''} a la comanda`}>
            {p.agotado ? 'Agotado' : hecho ? '¡A la comanda!' : <>Agregar <b>{fmt(op.precio * qty)}</b></>}
          </button>
        </div>
      </div>
    </article>
  );
}
