'use client';

import { useCallback, useState, type DragEvent } from 'react';
import type { AccionFila, ModoCarga, ProductoAdmin, ResultadoCarga, VistaPreviaCarga } from '@/lib/admin-tipos';
import { procesarAuto } from '@/lib/foto';
import { slugify } from '@/lib/texto';
import { ApiError, api, descargar, jsonInit, Kpi, subirFoto, type Toast } from './comun';
import EditorFoto from './EditorFoto';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FOTOS = 60;
const MODOS: { id: ModoCarga; label: string; ayuda: string }[] = [
  { id: 'upsert', label: 'Crear y actualizar', ayuda: 'Opciones nuevas se crean; las existentes se actualizan.' },
  { id: 'crear', label: 'Solo crear nuevas', ayuda: 'Los códigos que ya existen se rechazan.' },
  { id: 'actualizar', label: 'Solo actualizar', ayuda: 'Ideal para cambiar precios: lo que no existe se rechaza.' },
];
type Filtro = 'todas' | AccionFila;
const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todas', label: 'Todas' }, { id: 'crear', label: 'Nuevas' }, { id: 'actualizar', label: 'A actualizar' },
  { id: 'sin cambios', label: 'Sin cambios' }, { id: 'error', label: 'Con errores' },
];
const CHIP: Record<AccionFila, string> = { crear: 'entregado', actualizar: 'confirmado', 'sin cambios': 'comentario', error: 'cancelado' };
const TEXTO: Record<AccionFila, string> = { crear: 'Nueva', actualizar: 'Actualizar', 'sin cambios': 'Sin cambios', error: 'Error' };
const LIMITE_VISTA = 300;

type FotoLote = { key: string; archivo: File; vista: string; productoId: number | null; editada: { blob: Blob; url: string } | null; estado: 'lista' | 'subiendo' | 'ok' | 'error'; error?: string };

/** Empareja el nombre del archivo con un producto: slug, nombre o código (pollo-asado.jpg, AREPAS-QUESO.png…). */
function emparejar(nombreArchivo: string, productos: ProductoAdmin[]): number | null {
  const k = slugify(nombreArchivo.replace(/\.[^.]+$/, '')).replace(/-\d+$/, '');
  if (!k) return null;
  const exacto = productos.find((p) => p.slug === k || slugify(p.nombre) === k || p.variantes.some((v) => slugify(v.codigo) === k));
  if (exacto) return exacto.id;
  const parecido = productos.filter((p) => k.startsWith(p.slug) || p.slug.startsWith(k)).sort((a, b) => b.slug.length - a.slug.length)[0];
  return parecido?.id ?? null;
}

/** Carga masiva de la carta desde Excel o CSV (con vista previa) y subida de fotos en lote. */
export default function VistaCarga({ productos, maxKB, toast, onSesionVencida, onAplicado }: {
  productos: ProductoAdmin[]; maxKB: number; toast: Toast; onSesionVencida: () => void; onAplicado: () => Promise<void>;
}) {
  const [modo, setModo] = useState<ModoCarga>('upsert');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<VistaPreviaCarga | null>(null);
  const [resultado, setResultado] = useState<ResultadoCarga | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [ocupado, setOcupado] = useState<'' | 'revisar' | 'aplicar' | 'xlsx' | 'csv' | 'carta' | 'fotos'>('');
  const [arrastrando, setArrastrando] = useState<'' | 'excel' | 'fotos'>('');
  const [fotos, setFotos] = useState<FotoLote[]>([]);
  const [editando, setEditando] = useState<FotoLote | null>(null);
  const [realzar, setRealzar] = useState(true);

  const fallar = useCallback((e: unknown, msg: string) => {
    if (e instanceof ApiError && e.status === 401) onSesionVencida();
    toast(e instanceof Error && e.message ? e.message : msg, 'error');
  }, [onSesionVencida, toast]);

  /* ----- Excel / CSV ----- */

  const bajar = async (tipo: 'xlsx' | 'csv' | 'carta') => {
    setOcupado(tipo);
    try {
      const nombre = await descargar(`/api/admin/productos/plantilla?formato=${tipo === 'csv' ? 'csv' : 'xlsx'}${tipo === 'carta' ? '&carta=1' : ''}`);
      toast(`Se descargó ${nombre}.`);
    } catch (e) { fallar(e, 'No se pudo descargar la plantilla.'); }
    finally { setOcupado(''); }
  };

  const enviar = (f: File, m: ModoCarga, accion: 'preview' | 'aplicar', token?: string) => {
    const fd = new FormData();
    fd.append('archivo', f);
    if (token) fd.append('token', token);
    return { url: `/api/admin/productos/importar?accion=${accion}&modo=${m}`, init: { method: 'POST', body: fd } };
  };

  const revisar = async (f: File, m: ModoCarga) => {
    if (!/\.(xlsx|csv)$/i.test(f.name)) return toast('Sube un archivo Excel (.xlsx) o CSV.', 'error');
    if (f.size > MAX_BYTES) return toast('El archivo supera 5 MB.', 'error');
    setArchivo(f); setResultado(null); setOcupado('revisar');
    try {
      const { url, init } = enviar(f, m, 'preview');
      const v = await api<VistaPreviaCarga>(url, init);
      setVista(v);
      setFiltro(v.resumen.errores && !v.resumen.nuevos && !v.resumen.actualizar ? 'error' : 'todas');
    } catch (e) { setVista(null); fallar(e, 'No se pudo leer el archivo.'); }
    finally { setOcupado(''); }
  };

  const aplicar = async () => {
    if (!archivo || !vista) return;
    if (!window.confirm(`¿Aplicar ${vista.resumen.nuevos} opciones nuevas y ${vista.resumen.actualizar} actualizaciones? Las filas con error se omiten.`)) return;
    setOcupado('aplicar');
    try {
      const { url, init } = enviar(archivo, modo, 'aplicar', vista.token);
      const r = await api<ResultadoCarga>(url, init);
      setResultado(r); setVista(null);
      await onAplicado();
      toast(`Carga aplicada: ${r.creados} nuevas y ${r.actualizados} actualizadas.`);
    } catch (e) { fallar(e, 'No se pudo aplicar la carga.'); }
    finally { setOcupado(''); }
  };

  const reiniciar = () => { setArchivo(null); setVista(null); setResultado(null); };
  const soltarExcel = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); setArrastrando('');
    const f = e.dataTransfer.files?.[0];
    if (f) void revisar(f, modo);
  };

  const filas = vista ? vista.filas.filter((f) => filtro === 'todas' || f.accion === filtro) : [];
  const n: Record<Filtro, number> = vista
    ? { todas: vista.resumen.filas, crear: vista.resumen.nuevos, actualizar: vista.resumen.actualizar, 'sin cambios': vista.resumen.sinCambios, error: vista.resumen.errores }
    : { todas: 0, crear: 0, actualizar: 0, 'sin cambios': 0, error: 0 };
  const puedeAplicar = !!vista && vista.resumen.nuevos + vista.resumen.actualizar > 0;

  /* ----- Fotos en lote ----- */

  const agregarFotos = (lista: FileList | File[]) => {
    const nuevas = [...lista].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    const descartadas = [...lista].length - nuevas.length;
    if (descartadas) toast(`${descartadas} archivo(s) no son JPG, PNG o WebP y se omitieron.`, 'error');
    setFotos((l) => {
      const libres = MAX_FOTOS - l.length;
      if (nuevas.length > libres) toast(`Máximo ${MAX_FOTOS} fotos por tanda.`, 'error');
      return [...l, ...nuevas.slice(0, Math.max(0, libres)).map((archivo, i) => ({
        key: `${Date.now()}-${i}-${archivo.name}`, archivo, vista: URL.createObjectURL(archivo),
        productoId: emparejar(archivo.name, productos), editada: null, estado: 'lista' as const,
      }))];
    });
  };
  const quitarFoto = (k: string) => setFotos((l) => l.filter((f) => {
    if (f.key !== k) return true;
    URL.revokeObjectURL(f.vista); if (f.editada) URL.revokeObjectURL(f.editada.url);
    return false;
  }));
  const actualizarFoto = (k: string, c: Partial<FotoLote>) => setFotos((l) => l.map((f) => (f.key === k ? { ...f, ...c } : f)));
  const soltarFotos = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault(); setArrastrando('');
    if (e.dataTransfer.files?.length) agregarFotos(e.dataTransfer.files);
  };

  const pendientes = fotos.filter((f) => f.estado !== 'ok' && f.productoId !== null);
  const repetidos = new Set(fotos.filter((f, i) => f.productoId !== null && f.estado !== 'ok' && fotos.findIndex((x) => x.productoId === f.productoId && x.estado !== 'ok') !== i).map((f) => f.productoId));

  const subirFotos = async () => {
    if (!pendientes.length) return;
    if (repetidos.size && !window.confirm('Hay productos con más de una foto asignada: se quedará la última. ¿Continuar?')) return;
    setOcupado('fotos');
    let ok = 0;
    for (const f of pendientes) {
      actualizarFoto(f.key, { estado: 'subiendo', error: undefined });
      try {
        const lista = f.editada ?? await procesarAuto(f.archivo, maxKB, realzar);
        const url = await subirFoto(lista.blob);
        await api(`/api/admin/productos/${f.productoId}`, jsonInit('PATCH', { img: url }));
        if (!f.editada) URL.revokeObjectURL(lista.url);
        actualizarFoto(f.key, { estado: 'ok' });
        ok++;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { onSesionVencida(); break; }
        actualizarFoto(f.key, { estado: 'error', error: e instanceof Error ? e.message : 'No se pudo subir.' });
      }
    }
    setOcupado('');
    if (ok) { await onAplicado().catch(() => undefined); toast(`${ok} foto${ok === 1 ? '' : 's'} actualizada${ok === 1 ? '' : 's'} en la carta.`); }
  };

  const nombreDe = (id: number | null) => productos.find((p) => p.id === id)?.nombre ?? '';
  const cerrarEditor = useCallback(() => setEditando(null), []);

  return (
    <section aria-label="Carga masiva">
      <div className="adm-pasos">
        <article className="adm-card">
          <span className="adm-paso">1</span>
          <h3>Descarga el formato</h3>
          <p className="adm-meta">Plantilla con columnas, instrucciones y categorías. Para cambiar precios de muchos productos, descarga la carta actual, edítala y súbela.</p>
          <div className="adm-descargas">
            <button className="btn btn-brasa" type="button" disabled={!!ocupado} onClick={() => bajar('carta')}>{ocupado === 'carta' ? 'Generando…' : 'Carta actual (Excel)'}</button>
            <button className="adm-btn" type="button" disabled={!!ocupado} onClick={() => bajar('xlsx')}>{ocupado === 'xlsx' ? 'Generando…' : 'Plantilla Excel'}</button>
            <button className="adm-btn" type="button" disabled={!!ocupado} onClick={() => bajar('csv')}>{ocupado === 'csv' ? 'Generando…' : 'Plantilla CSV'}</button>
          </div>
        </article>

        <article className="adm-card">
          <span className="adm-paso">2</span>
          <h3>Sube el archivo</h3>
          <div className="adm-modos" role="radiogroup" aria-label="Qué hacer con las filas">
            {MODOS.map((m) => (
              <label key={m.id} className={`adm-modo${modo === m.id ? ' is-active' : ''}`}>
                <input type="radio" name="modoCarga" checked={modo === m.id} disabled={!!ocupado}
                  onChange={() => { setModo(m.id); if (archivo) void revisar(archivo, m.id); }} />
                <span><b>{m.label}</b><small>{m.ayuda}</small></span>
              </label>
            ))}
          </div>
          <label className={`adm-soltar${arrastrando === 'excel' ? ' is-arrastrando' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setArrastrando('excel'); }} onDragLeave={() => setArrastrando('')} onDrop={soltarExcel}>
            <input type="file" hidden disabled={!!ocupado} accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void revisar(f, modo); }} />
            <b>{ocupado === 'revisar' ? 'Revisando archivo…' : archivo ? archivo.name : 'Arrastra aquí tu Excel o CSV, o haz clic para elegirlo'}</b>
            <small>Excel (.xlsx) o CSV · máximo 5 MB · nada se guarda hasta que apliques</small>
          </label>
        </article>
      </div>

      {resultado && (
        <div className="adm-card">
          <header><h3>Carga aplicada</h3><span>Los cambios ya están en la carta</span></header>
          <div className="adm-kpis">
            <Kpi acento titulo="Opciones nuevas" valor={String(resultado.creados)} />
            <Kpi titulo="Actualizadas" valor={String(resultado.actualizados)} />
            <Kpi titulo="Sin cambios" valor={String(resultado.sinCambios)} />
            <Kpi titulo="Omitidas por error" valor={String(resultado.errores)} />
          </div>
          {resultado.categoriasNuevas.length > 0 && <p className="adm-meta">Categorías creadas: {resultado.categoriasNuevas.join(', ')}.</p>}
          <button className="adm-btn" type="button" onClick={reiniciar}>Cargar otro archivo</button>
        </div>
      )}

      {vista && (
        <div className="adm-card">
          <header><h3>3. Revisa y aplica</h3><span>{vista.archivo} · {vista.resumen.filas} filas · nada se guarda hasta aplicar</span></header>
          {vista.ejemploIgnorado && <p className="adm-aviso">Se ignoró la <b>fila de ejemplo</b> de la plantilla (código EJEMPLO-001).</p>}
          {vista.categoriasNuevas.length > 0 && <p className="adm-aviso"><b>Categorías nuevas que se crearán:</b> {vista.categoriasNuevas.join(', ')}.</p>}
          {vista.columnasIgnoradas.length > 0 && <p className="adm-aviso"><b>Columnas no reconocidas (se ignoran):</b> {vista.columnasIgnoradas.join(', ')}.</p>}

          <div className="adm-tabs" role="tablist" aria-label="Filtrar filas">
            {FILTROS.map((f) => (
              <button key={f.id} role="tab" type="button" aria-selected={filtro === f.id}
                className={`adm-tab${filtro === f.id ? ' is-active' : ''}${f.id === 'error' && n.error > 0 ? ' adm-tab--alerta' : ''}`}
                onClick={() => setFiltro(f.id)}>{f.label}<span>{n[f.id]}</span></button>
            ))}
          </div>

          {filas.length ? (
            <div className="adm-tabla-wrap">
              <table className="adm-t">
                <thead><tr><th className="num">Fila</th><th>Código</th><th>Producto · opción</th><th>Acción</th><th>Detalle</th></tr></thead>
                <tbody>
                  {filas.slice(0, LIMITE_VISTA).map((f) => (
                    <tr key={f.fila} className={f.accion === 'error' ? 'is-error' : ''}>
                      <td className="num">{f.fila}</td>
                      <td className="adm-num-pedido">{f.codigo || '—'}</td>
                      <td>{f.nombre || '—'}</td>
                      <td><span className={`adm-chip adm-chip--${CHIP[f.accion]}`}>{TEXTO[f.accion]}</span></td>
                      <td>
                        {f.error ? <span className="adm-error-txt">{f.error}</span>
                          : f.cambios.length ? (
                            <ul className="adm-cambios">
                              {f.cambios.map((c) => <li key={c.campo}><b>{c.campo}:</b> <del>{c.antes || '(vacío)'}</del> → <ins>{c.despues || '(vacío)'}</ins></li>)}
                            </ul>
                          ) : <small>{f.accion === 'crear' ? 'Opción nueva' : 'Igual a la carta'}</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filas.length > LIMITE_VISTA && <p className="adm-meta adm-pad">Se muestran las primeras {LIMITE_VISTA} de {filas.length} filas.</p>}
            </div>
          ) : <p className="adm-vacio-s">No hay filas en esta vista.</p>}

          <div className="adm-editor__pie adm-pie-carga">
            <button className="btn adm-btn-borde" type="button" disabled={!!ocupado} onClick={reiniciar}>Cancelar</button>
            <button className="btn btn-brasa" type="button" disabled={!puedeAplicar || !!ocupado} onClick={aplicar}>
              {ocupado === 'aplicar' ? 'Aplicando…' : `Aplicar cambios (${vista.resumen.nuevos + vista.resumen.actualizar})`}
            </button>
          </div>
        </div>
      )}

      {/* ---------- Fotos en lote ---------- */}
      <div className="adm-card adm-lote">
        <header><h3>Fotos en lote</h3><span>Sube muchas fotos de una vez: se asignan solas si el archivo se llama como el producto</span></header>
        <label className={`adm-soltar${arrastrando === 'fotos' ? ' is-arrastrando' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando('fotos'); }} onDragLeave={() => setArrastrando('')} onDrop={soltarFotos}>
          <input type="file" hidden multiple accept="image/jpeg,image/png,image/webp" disabled={ocupado === 'fotos'}
            onChange={(e) => { if (e.target.files?.length) agregarFotos(e.target.files); e.target.value = ''; }} />
          <b>Arrastra aquí las fotos o haz clic para elegirlas</b>
          <small>JPG, PNG o WebP · ej.: <code>pollo-asado.jpg</code>, <code>empanadas.png</code> o el código <code>AREPAS-QUESO.jpg</code> · hasta {MAX_FOTOS} por tanda</small>
        </label>

        {fotos.length > 0 && (
          <>
            <ul className="adm-lote__lista">
              {fotos.map((f) => (
                <li key={f.key} className={`adm-lote__item is-${f.estado}`}>
                  <span className="adm-mini"><img src={f.editada?.url ?? f.vista} alt="" /></span>
                  <span className="adm-lote__info">
                    <b title={f.archivo.name}>{f.archivo.name}</b>
                    <small>
                      {f.estado === 'ok' ? `✓ Guardada en ${nombreDe(f.productoId)}` : f.estado === 'subiendo' ? 'Subiendo…'
                        : f.estado === 'error' ? <span className="adm-error-txt">{f.error}</span>
                          : f.editada ? 'Editada a mano' : f.productoId ? 'Asignada automáticamente' : 'Elige el producto'}
                      {f.productoId !== null && repetidos.has(f.productoId) && f.estado !== 'ok' && <span className="adm-error-txt"> · producto repetido</span>}
                    </small>
                  </span>
                  <select className="adm-input" value={f.productoId ?? ''} disabled={f.estado === 'ok' || f.estado === 'subiendo'} aria-label={`Producto para ${f.archivo.name}`}
                    onChange={(e) => actualizarFoto(f.key, { productoId: e.target.value ? Number(e.target.value) : null, estado: 'lista' })}>
                    <option value="">— Elegir producto —</option>
                    {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.img ? '' : ' (sin foto)'}</option>)}
                  </select>
                  <span className="adm-lote__acc">
                    <button type="button" className="adm-btn" disabled={f.estado === 'ok' || f.estado === 'subiendo'} onClick={() => setEditando(f)}>Editar</button>
                    <button type="button" className="adm-link" disabled={f.estado === 'subiendo'} onClick={() => quitarFoto(f.key)}>Quitar</button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="adm-lote__pie">
              <label className="adm-check-mini"><input type="checkbox" checked={realzar} onChange={(e) => setRealzar(e.target.checked)} /> Realzar colores automáticamente (las no editadas)</label>
              <button type="button" className="adm-link" disabled={!!ocupado} onClick={() => { fotos.forEach((f) => quitarFoto(f.key)); }}>Vaciar lista</button>
              <button type="button" className="btn btn-brasa" disabled={!pendientes.length || !!ocupado} onClick={subirFotos}>
                {ocupado === 'fotos' ? 'Subiendo fotos…' : `Subir ${pendientes.length} foto${pendientes.length === 1 ? '' : 's'}`}
              </button>
            </div>
            <p className="adm-ayuda">Las fotos sin editar se recortan cuadradas al centro. Usa “Editar” para encuadrar o mejorar la luz de cada una.</p>
          </>
        )}
      </div>

      {editando && (
        <EditorFoto fuente={editando.archivo} maxKB={maxKB} titulo={nombreDe(editando.productoId) ? `Foto de ${nombreDe(editando.productoId)}` : editando.archivo.name}
          onCerrar={cerrarEditor}
          onListo={(r) => { if (editando.editada) URL.revokeObjectURL(editando.editada.url); actualizarFoto(editando.key, { editada: r, estado: 'lista' }); setEditando(null); }} />
      )}
    </section>
  );
}
