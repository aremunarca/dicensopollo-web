'use client';

import { useEffect, useState } from 'react';
import { ESTADOS, type Estadisticas } from '@/lib/admin-tipos';
import { fmt } from '@/lib/config';
import { ApiError, api, ChipEstado, Kpi, Tarjeta, type Toast } from './comun';

const dia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const haceDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() - (n - 1)); return dia(d); };
const corto = (f: string) => { const [, m, d] = f.split('-'); return `${d}/${m}`; };

const RANGOS = [
  { id: '1', label: 'Hoy', desde: () => haceDias(1) },
  { id: '7', label: '7 días', desde: () => haceDias(7) },
  { id: '30', label: '30 días', desde: () => haceDias(30) },
  { id: 'mes', label: 'Este mes', desde: () => { const d = new Date(); return dia(new Date(d.getFullYear(), d.getMonth(), 1)); } },
] as const;

/** Gerencia: ventas (pedidos en preparación y entregados), horas de más pedidos, más vendidos y estado de la carta. */
export default function VistaEstadisticas({ toast, onSesionVencida }: { toast: Toast; onSesionVencida: () => void }) {
  const [rango, setRango] = useState<{ id: string; desde: string; hasta: string }>(() => ({ id: '30', desde: haceDias(30), hasta: dia(new Date()) }));
  const [datos, setDatos] = useState<Estadisticas | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    api<Estadisticas>(`/api/admin/estadisticas?desde=${rango.desde}&hasta=${rango.hasta}`)
      .then((d) => { if (activo) { setDatos(d); setCargando(false); } })
      .catch((e: unknown) => {
        if (!activo) return;
        setCargando(false);
        if (e instanceof ApiError && e.status === 401) onSesionVencida();
        toast(e instanceof Error ? e.message : 'No se pudieron cargar las estadísticas.', 'error');
      });
    return () => { activo = false; };
  }, [rango, toast, onSesionVencida]);

  const elegir = (r: { id: string; desde: string; hasta: string }) => { setCargando(true); setRango(r); };

  return (
    <section aria-label="Estadísticas" className={cargando && datos ? 'adm-cargando' : ''}>
      <div className="adm-barra adm-rango">
        <div className="adm-segmentos" role="group" aria-label="Período">
          {RANGOS.map((r) => (
            <button key={r.id} type="button" className={rango.id === r.id ? 'is-active' : ''} aria-pressed={rango.id === r.id}
              onClick={() => elegir({ id: r.id, desde: r.desde(), hasta: dia(new Date()) })}>{r.label}</button>
          ))}
        </div>
        <label className="adm-fecha">Desde<input className="adm-input" type="date" value={rango.desde} max={rango.hasta}
          onChange={(e) => e.target.value && elegir({ id: 'personal', desde: e.target.value, hasta: rango.hasta })} /></label>
        <label className="adm-fecha">Hasta<input className="adm-input" type="date" value={rango.hasta} min={rango.desde}
          onChange={(e) => e.target.value && elegir({ id: 'personal', desde: rango.desde, hasta: e.target.value })} /></label>
      </div>

      {!datos ? (
        <p className="adm-vacio">{cargando ? 'Cargando estadísticas…' : 'No hay datos.'}</p>
      ) : (
        <>
          <div className="adm-kpis">
            <Kpi acento titulo="Ventas" valor={fmt(datos.ingresos)} nota={`${datos.ventas} pedido${datos.ventas === 1 ? '' : 's'} en preparación o entregado${datos.ventas === 1 ? '' : 's'}`} />
            <Kpi titulo="Ticket promedio" valor={fmt(datos.ticketPromedio)} nota="Venta promedio por pedido (sin delivery)" />
            <Kpi titulo="Productos vendidos" valor={String(datos.unidades)} nota="Unidades en pedidos vendidos" />
            <Kpi titulo="Pendientes" valor={String(datos.porEstado.PENDIENTE)} nota="Pedidos del período sin confirmar" />
          </div>

          <div className="adm-dash">
            <Tarjeta ancha titulo="Ventas por día" sub="Pedidos en preparación y entregados">
              <GraficaDias dias={datos.porDia} />
            </Tarjeta>

            <Tarjeta titulo="Horas con más pedidos" sub="Pedidos vendidos según la hora">
              <GraficaHoras horas={datos.porHora} />
            </Tarjeta>

            <Tarjeta titulo="Pedidos del período" sub="Todos los recibidos, por estado">
              <ul className="adm-lista-estados">
                {ESTADOS.map((e) => <li key={e}><ChipEstado estado={e} /><strong>{datos.porEstado[e]}</strong></li>)}
              </ul>
            </Tarjeta>

            <Tarjeta titulo="Delivery y retiro" sub="Ventas por forma de entrega">
              <Barras filas={datos.porEntrega.map((e) => ({ k: e.entrega, label: e.entrega, valor: e.ingresos, nota: `${e.pedidos} pedidos` }))} />
            </Tarjeta>

            <Tarjeta titulo="Más vendidos" sub="Por ventas">
              <Barras filas={datos.topProductos.map((p) => ({ k: p.codigo, label: p.nombre, valor: p.ingresos, nota: `${p.cantidad} und.` }))} />
            </Tarjeta>

            <Tarjeta titulo="Ventas por categoría" sub="Secciones de la carta">
              <Barras filas={datos.porCategoria.map((c) => ({ k: c.categoria, label: c.categoria, valor: c.ingresos, nota: `${c.cantidad} und.` }))} />
            </Tarjeta>

            <Tarjeta titulo="Comunas con más delivery" sub="Por ventas">
              <Barras filas={datos.topComunas.map((c) => ({ k: c.comuna, label: c.comuna, valor: c.ingresos, nota: `${c.pedidos} pedidos` }))} />
            </Tarjeta>

            <Tarjeta titulo="La carta hoy" sub="Estado actual">
              <dl className="adm-stats">
                <div><dt>Productos</dt><dd>{datos.carta.productos}</dd></div>
                <div><dt>Visibles en la carta</dt><dd>{datos.carta.productosActivos}</dd></div>
                <div><dt>Agotados hoy</dt><dd>{datos.carta.agotados}</dd></div>
                <div><dt>Opciones con precio</dt><dd>{datos.carta.opciones}</dd></div>
                <div><dt>Sin foto</dt><dd>{datos.carta.sinFoto}</dd></div>
              </dl>
            </Tarjeta>
          </div>
        </>
      )}
    </section>
  );
}

/** Barras horizontales de una sola serie (el título de la tarjeta la nombra). */
function Barras({ filas }: { filas: { k: string; label: string; valor: number; nota: string }[] }) {
  if (!filas.length) return <p className="adm-vacio-s">Sin ventas en este período.</p>;
  const max = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ol className="adm-barras">
      {filas.map((f) => (
        <li key={f.k}>
          <div><span title={f.label}>{f.label}</span><strong>{fmt(f.valor)}</strong></div>
          <i aria-hidden="true"><b style={{ width: `${Math.max(2, (f.valor / max) * 100)}%` }} /></i>
          <small>{f.nota}</small>
        </li>
      ))}
    </ol>
  );
}

/** Columnas de ventas por día: una serie, extremos redondeados sobre la base, cuadrícula tenue y tooltip. */
function GraficaDias({ dias }: { dias: Estadisticas['porDia'] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!dias.length || dias.every((d) => d.ingresos === 0)) return <p className="adm-vacio-s">Sin ventas en este período.</p>;

  const W = 720, H = 220, pad = { t: 12, r: 8, b: 26, l: 70 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const max = Math.max(...dias.map((d) => d.ingresos));
  const mag = 10 ** Math.floor(Math.log10(max));
  const tope = Math.ceil(max / mag) * mag;
  const paso = pw / dias.length;
  const bw = Math.max(2, Math.min(26, paso - 2));
  const cadaN = Math.ceil(dias.length / 10);
  const act = hover !== null ? dias[hover] : null;

  return (
    <div className="adm-grafica">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ventas por día" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => {
          const y = pad.t + ph - f * ph;
          return (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} className="adm-grafica__grid" />
              <text x={pad.l - 8} y={y + 4} textAnchor="end" className="adm-grafica__eje">{fmt(f * tope)}</text>
            </g>
          );
        })}
        {dias.map((d, i) => {
          const x = pad.l + i * paso + (paso - bw) / 2;
          const h = (d.ingresos / tope) * ph;
          const y = pad.t + ph - h;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={d.fecha} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * paso} y={pad.t} width={paso} height={ph} fill="transparent" />
              {h > 0 && (
                <path className={`adm-grafica__barra${hover === i ? ' is-hover' : ''}`}
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z`} />
              )}
              {i % cadaN === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="adm-grafica__eje">{corto(d.fecha)}</text>}
            </g>
          );
        })}
      </svg>
      {act && hover !== null && (
        <div className="adm-grafica__tip" style={{ left: `${((pad.l + hover * paso + paso / 2) / W) * 100}%` }}>
          <strong>{corto(act.fecha)}</strong><span>{fmt(act.ingresos)}</span><small>{act.pedidos} {act.pedidos === 1 ? 'venta' : 'ventas'}</small>
        </div>
      )}
      <table className="sr-only">
        <caption>Ventas por día</caption>
        <tbody>{dias.map((d) => <tr key={d.fecha}><th scope="row">{d.fecha}</th><td>{fmt(d.ingresos)}</td><td>{d.pedidos} ventas</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Pedidos por hora: solo las horas entre el primer y el último pedido del período. */
function GraficaHoras({ horas }: { horas: Estadisticas['porHora'] }) {
  const con = horas.filter((h) => h.pedidos > 0);
  if (!con.length) return <p className="adm-vacio-s">Sin ventas en este período.</p>;
  const desde = con[0].hora, hasta = con[con.length - 1].hora;
  const rango = horas.slice(desde, hasta + 1);
  const max = Math.max(...rango.map((h) => h.pedidos));
  const pico = rango.find((h) => h.pedidos === max)!;
  return (
    <div className="adm-horas">
      <ol aria-label="Pedidos por hora">
        {rango.map((h) => (
          <li key={h.hora} title={`${h.hora}:00 – ${h.pedidos} pedido${h.pedidos === 1 ? '' : 's'}`} className={h === pico ? 'is-pico' : ''}>
            <i style={{ height: `${Math.max(3, (h.pedidos / max) * 100)}%` }} />
            <small>{h.hora}</small>
          </li>
        ))}
      </ol>
      <p className="adm-meta">Hora pico: <b>{pico.hora}:00 – {pico.hora + 1}:00</b> ({pico.pedidos} pedido{pico.pedidos === 1 ? '' : 's'})</p>
    </div>
  );
}
