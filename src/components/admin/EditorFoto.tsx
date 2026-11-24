'use client';

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as PE } from 'react';
import { cargarImagen, dibujar, ESTADO_INICIAL, exportar, FILTROS, type EstadoFoto } from '@/lib/foto';

const VISTA = 440; // lado de la vista previa en px CSS
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 5;
const limitar = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/**
 * Editor de fotos del panel: encuadre cuadrado (arrastrar), zoom (rueda o deslizador), girar, espejo,
 * filtros para comida y ajustes de brillo, contraste, saturación y calidez. Devuelve un JPEG comprimido.
 */
export default function EditorFoto(props: {
  /** Archivo elegido o URL de la foto actual (/productos/…, /api/imagenes/…). */
  fuente: File | string;
  maxKB: number;
  titulo?: string;
  onListo: (r: { blob: Blob; url: string }) => void;
  onCerrar: () => void;
}) {
  const { onCerrar } = props;
  const [fuente, setFuente] = useState<File | string>(props.fuente);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [e, setE] = useState<EstadoFoto>(ESTADO_INICIAL);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const arrastre = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  // Abrir la foto
  useEffect(() => {
    let vivo = true;
    const url = typeof fuente === 'string' ? fuente : URL.createObjectURL(fuente);
    cargarImagen(url)
      .then((i) => { if (vivo) { setImg(i); setError(''); } })
      .catch((err: Error) => { if (vivo) setError(err.message); });
    return () => { vivo = false; if (typeof fuente !== 'string') URL.revokeObjectURL(url); };
  }, [fuente]);

  // Vista previa en vivo
  useEffect(() => {
    const c = lienzo.current;
    if (!c || !img) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(VISTA * dpr);
    const ctx = c.getContext('2d');
    if (ctx) dibujar(ctx, img, c.width, e);
  }, [img, e]);

  // Teclado: Esc cierra; flechas mueven; + / − zoom
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !ocupado) { onCerrar(); return; }
      const t = ev.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
      const paso = ev.shiftKey ? 0.05 : 0.01;
      const flechas: Record<string, [number, number]> = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] };
      const m = flechas[ev.key];
      if (m) {
        ev.preventDefault();
        setE((x) => ({ ...x, dx: limitar(x.dx + m[0], -1, 1), dy: limitar(x.dy + m[1], -1, 1) }));
      }
      if (ev.key === '+' || ev.key === '=') setE((x) => ({ ...x, zoom: limitar(x.zoom * 1.1, ZOOM_MIN, ZOOM_MAX) }));
      if (ev.key === '-') setE((x) => ({ ...x, zoom: limitar(x.zoom / 1.1, ZOOM_MIN, ZOOM_MAX) }));
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [ocupado, onCerrar]);

  // Zoom con la rueda (listener no pasivo para poder evitar el scroll de la página)
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const rueda = (ev: WheelEvent) => {
      ev.preventDefault();
      setE((x) => ({ ...x, zoom: limitar(x.zoom * (ev.deltaY < 0 ? 1.06 : 1 / 1.06), ZOOM_MIN, ZOOM_MAX) }));
    };
    c.addEventListener('wheel', rueda, { passive: false });
    return () => c.removeEventListener('wheel', rueda);
  }, [img]);

  const bajar = (ev: PE<HTMLCanvasElement>) => {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    arrastre.current = { x: ev.clientX, y: ev.clientY, dx: e.dx, dy: e.dy };
  };
  const mover = (ev: PE<HTMLCanvasElement>) => {
    const a = arrastre.current;
    if (!a) return;
    const lado = ev.currentTarget.getBoundingClientRect().width;
    setE((x) => ({ ...x, dx: limitar(a.dx + (ev.clientX - a.x) / lado, -1, 1), dy: limitar(a.dy + (ev.clientY - a.y) / lado, -1, 1) }));
  };
  const soltar = () => { arrastre.current = null; };

  const cambiarFoto = (ev: ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setError('La foto debe ser JPG, PNG o WebP.');
    setImg(null); setE(ESTADO_INICIAL); setFuente(f);
  };

  async function listo() {
    if (!img) return;
    setOcupado(true); setError('');
    try { props.onListo(await exportar(img, e, props.maxKB)); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo procesar la foto.'); setOcupado(false); }
  }

  const filtroActivo = FILTROS.find((f) => f.v.brillo === e.brillo && f.v.contraste === e.contraste && f.v.saturacion === e.saturacion && f.v.calidez === e.calidez)?.id;
  const deslizador = (k: 'brillo' | 'contraste' | 'saturacion' | 'calidez', label: string, min: number, max: number) => (
    <label className="ef-ajuste">
      <span>{label}<output>{k === 'calidez' ? e[k] : e[k] - 100 > 0 ? `+${e[k] - 100}` : e[k] - 100}</output></span>
      <input type="range" min={min} max={max} value={e[k]} onChange={(ev) => setE((x) => ({ ...x, [k]: Number(ev.target.value) }))} />
    </label>
  );

  return (
    <div className="adm-velo adm-velo--alto" onClick={(ev) => { if (ev.target === ev.currentTarget && !ocupado) onCerrar(); }}>
      <div className="adm-editor ef" role="dialog" aria-modal="true" aria-labelledby="t-ef">
        <div className="adm-editor__cab">
          <h2 id="t-ef">{props.titulo ?? 'Editar foto'}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onCerrar} disabled={ocupado}>✕</button>
        </div>

        <div className="ef__cuerpo">
          <div className="ef__vista">
            <div className="ef__marco" style={{ background: e.fondo }}>
              {img ? (
                <canvas ref={lienzo} className="ef__lienzo" style={{ width: VISTA, height: VISTA }} onPointerDown={bajar} onPointerMove={mover}
                  onPointerUp={soltar} onPointerCancel={soltar} aria-label="Vista previa: arrastra para encuadrar, rueda para acercar" />
              ) : <span className="ef__cargando">{error || 'Abriendo foto…'}</span>}
              <i className="ef__guia" aria-hidden="true" />
            </div>
            <p className="adm-ayuda">Arrastra para encuadrar · rueda o deslizador para acercar · flechas para mover fino. Así se verá en la carta.</p>
          </div>

          <div className="ef__controles">
            <div className="ef__grupo">
              <p className="ef__tit">Encuadre</p>
              <label className="ef-ajuste">
                <span>Zoom<output>{Math.round(e.zoom * 100)}%</output></span>
                <input type="range" min={ZOOM_MIN * 100} max={ZOOM_MAX * 100} value={Math.round(e.zoom * 100)} onChange={(ev) => setE((x) => ({ ...x, zoom: Number(ev.target.value) / 100 }))} />
              </label>
              <div className="ef__botones">
                <button type="button" className="adm-btn" onClick={() => setE((x) => ({ ...x, rot: (x.rot + 3) % 4 }))} title="Girar a la izquierda">⟲ Girar</button>
                <button type="button" className="adm-btn" onClick={() => setE((x) => ({ ...x, rot: (x.rot + 1) % 4 }))} title="Girar a la derecha">⟳ Girar</button>
                <button type="button" className="adm-btn" aria-pressed={e.espejo} onClick={() => setE((x) => ({ ...x, espejo: !x.espejo }))}>⇋ Espejo</button>
                <button type="button" className="adm-btn" onClick={() => setE((x) => ({ ...x, zoom: 1, dx: 0, dy: 0 }))}>Centrar</button>
              </div>
              <div className="adm-segmentos" role="group" aria-label="Ajuste">
                <button type="button" className={e.ajuste === 'llenar' ? 'is-active' : ''} aria-pressed={e.ajuste === 'llenar'} onClick={() => setE((x) => ({ ...x, ajuste: 'llenar', zoom: 1, dx: 0, dy: 0 }))}>Llenar cuadro</button>
                <button type="button" className={e.ajuste === 'completa' ? 'is-active' : ''} aria-pressed={e.ajuste === 'completa'} onClick={() => setE((x) => ({ ...x, ajuste: 'completa', zoom: 1, dx: 0, dy: 0 }))}>Foto completa</button>
              </div>
              {(e.ajuste === 'completa' || e.zoom < 1) && (
                <div className="ef__fondos" role="group" aria-label="Color de fondo">
                  <span className="adm-ayuda">Fondo:</span>
                  {['#ffffff', '#120c0a', '#fff4e2', '#e3261b'].map((c) => (
                    <button key={c} type="button" className={`ef__fondo${e.fondo === c ? ' is-on' : ''}`} style={{ background: c }} aria-label={`Fondo ${c}`} aria-pressed={e.fondo === c}
                      onClick={() => setE((x) => ({ ...x, fondo: c }))} />
                  ))}
                  <input type="color" value={e.fondo} onChange={(ev) => setE((x) => ({ ...x, fondo: ev.target.value }))} aria-label="Otro color de fondo" />
                </div>
              )}
            </div>

            <div className="ef__grupo">
              <p className="ef__tit">Filtros</p>
              <div className="ef__filtros">
                {FILTROS.map((f) => (
                  <button key={f.id} type="button" className={`ef__filtro${filtroActivo === f.id ? ' is-on' : ''}`} onClick={() => setE((x) => ({ ...x, ...f.v }))}>
                    <span style={{ filter: `brightness(${f.v.brillo}%) contrast(${f.v.contraste}%) saturate(${f.v.saturacion}%) sepia(${f.v.calidez}%)`, backgroundImage: img ? `url(${img.src})` : undefined }} />
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ef__grupo">
              <p className="ef__tit">Ajustes</p>
              {deslizador('brillo', 'Brillo', 60, 150)}
              {deslizador('contraste', 'Contraste', 60, 150)}
              {deslizador('saturacion', 'Saturación', 0, 200)}
              {deslizador('calidez', 'Calidez', 0, 60)}
            </div>

            <div className="ef__pie-ctrl">
              <label className="adm-link">Usar otra foto…<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={cambiarFoto} /></label>
              <button type="button" className="adm-link" onClick={() => setE(ESTADO_INICIAL)}>Restablecer todo</button>
            </div>
          </div>
        </div>

        {error && img && <p className="adm-error" role="alert">{error}</p>}
        <div className="adm-editor__pie">
          <button type="button" className="btn adm-btn-borde" onClick={onCerrar} disabled={ocupado}>Cancelar</button>
          <button type="button" className="btn btn-brasa" onClick={listo} disabled={!img || ocupado}>{ocupado ? 'Procesando…' : 'Usar esta foto'}</button>
        </div>
      </div>
    </div>
  );
}
