'use client';

import { useCallback, useMemo, useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent } from 'react';
import { fmt } from '@/lib/config';
import { norm } from '@/lib/texto';
import { enCarta, type ProductoAdmin, type VarianteAdmin } from '@/lib/admin-tipos';
import { ApiError, api, jsonInit, subirFoto, useModal, type Toast } from './comun';
import EditorFoto from './EditorFoto';

type Filtro = 'todos' | 'carta' | 'agotados' | 'ocultos' | 'sinfoto';
type Editando = { modo: 'nuevo' } | { modo: 'editar'; p: ProductoAdmin } | null;
type FotoDe = { p: ProductoAdmin; fuente: File | string } | null;

const POR_PAGINA = 40;
/** "14.000", "$14000" o "14000" → 14000; vacío o inválido → null */
export const leerPesos = (s: string) => {
  const t = s.replace(/[$\s.]/g, '').trim();
  return /^\d{1,9}$/.test(t) ? Number(t) : null;
};
const rango = (vs: VarianteAdmin[]) => {
  const base = vs.some((v) => v.activo) ? vs.filter((v) => v.activo) : vs;
  if (!base.length) return '—';
  const min = Math.min(...base.map((v) => v.precio));
  const max = Math.max(...base.map((v) => v.precio));
  return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
};
const seleccionar = (e: FocusEvent<HTMLInputElement>) => e.target.select();

/** Carta en el panel: productos con sus opciones, precios, foto, agotado y visibilidad. */
export default function VistaProductos(props: {
  lista: ProductoAdmin[];
  setLista: (fn: (l: ProductoAdmin[]) => ProductoAdmin[]) => void;
  categorias: string[];
  maxKB: number;
  toast: Toast;
  onSesionVencida: () => void;
}) {
  const { lista, setLista, toast, onSesionVencida } = props;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<Editando>(null);
  const [rapida, setRapida] = useState<ProductoAdmin | null>(null);
  const [fotoDe, setFotoDe] = useState<FotoDe>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const archivoPara = useRef<ProductoAdmin | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  const fallar = useCallback((e: unknown, msg: string) => {
    if (e instanceof ApiError && e.status === 401) onSesionVencida();
    toast(e instanceof Error && e.message ? e.message : msg, 'error');
  }, [onSesionVencida, toast]);

  const pasa: Record<Filtro, (p: ProductoAdmin) => boolean> = {
    todos: () => true,
    carta: (p) => enCarta(p) && !p.agotado,
    agotados: (p) => p.activo && p.agotado,
    ocultos: (p) => !enCarta(p),
    sinfoto: (p) => !p.img,
  };
  const filtrados = useMemo(() => {
    const palabras = norm(q.trim()).split(/\s+/).filter(Boolean);
    return lista.filter((p) =>
      (!cat || p.categoria === cat) && pasa[filtro](p) &&
      palabras.every((w) => norm(`${p.nombre} ${p.categoria} ${p.descripcion} ${p.variantes.map((v) => `${v.codigo} ${v.nombre ?? ''}`).join(' ')}`).includes(w)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pasa` depende solo de `filtro`
  }, [lista, q, cat, filtro]);
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const visibles = filtrados.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);
  const n = (f: Filtro) => lista.filter(pasa[f]).length;
  const categorias = useMemo(() => [...new Set([...props.categorias, ...lista.map((p) => p.categoria)])], [props.categorias, lista]);

  const reemplazar = (p: ProductoAdmin) => setLista((l) => (l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? p : x)) : [...l, p]));

  const cambiar = async (p: ProductoAdmin, cambios: Record<string, unknown>, msg: string) => {
    setOcupado(p.id);
    try {
      reemplazar(await api<ProductoAdmin>(`/api/admin/productos/${p.id}`, jsonInit('PATCH', cambios)));
      toast(msg);
    } catch (e) { fallar(e, 'No se pudo guardar.'); }
    finally { setOcupado(null); }
  };

  // Foto con un clic en la miniatura: sin foto → elegir archivo; con foto → editarla (o cambiarla) en el editor.
  const abrirFoto = (p: ProductoAdmin) => {
    if (p.img) return setFotoDe({ p, fuente: p.img });
    archivoPara.current = p;
    inputFoto.current?.click();
  };
  const archivoElegido = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f && archivoPara.current) setFotoDe({ p: archivoPara.current, fuente: f });
  };
  const fotoLista = async (r: { blob: Blob; url: string }) => {
    const p = fotoDe!.p;
    setFotoDe(null);
    setOcupado(p.id);
    try {
      const url = await subirFoto(r.blob);
      reemplazar(await api<ProductoAdmin>(`/api/admin/productos/${p.id}`, jsonInit('PATCH', { img: url })));
      toast(`Foto de "${p.nombre}" actualizada`);
    } catch (e) { fallar(e, 'No se pudo subir la foto.'); }
    finally { setOcupado(null); URL.revokeObjectURL(r.url); }
  };
  const cerrarFoto = useCallback(() => setFotoDe(null), []);

  const elegirFiltro = (f: Filtro) => { setFiltro(f); setPagina(0); };
  const cifras: { f: Filtro; label: string }[] = [
    { f: 'todos', label: 'productos' }, { f: 'carta', label: 'en la carta' }, { f: 'agotados', label: 'agotados hoy' },
    { f: 'ocultos', label: 'ocultos' }, { f: 'sinfoto', label: 'sin foto' },
  ];

  return (
    <section aria-label="Carta">
      <div className="adm-cifras adm-cifras--5">
        {cifras.map((c) => (
          <button key={c.f} type="button" className={`adm-cifra${filtro === c.f ? ' is-active' : ''}${c.f === 'agotados' && n(c.f) ? ' adm-cifra--alerta' : ''}`} onClick={() => elegirFiltro(c.f)}>
            <b>{n(c.f)}</b><span>{c.label}</span>
          </button>
        ))}
      </div>

      <div className="adm-barra">
        <input className="adm-input adm-buscar" type="search" placeholder="Buscar por producto, opción, código o categoría" value={q}
          onChange={(e) => { setQ(e.target.value); setPagina(0); }} aria-label="Buscar productos" />
        <select className="adm-input" value={cat} onChange={(e) => { setCat(e.target.value); setPagina(0); }} aria-label="Filtrar por categoría">
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-brasa adm-nuevo" type="button" onClick={() => setEditando({ modo: 'nuevo' })}>+ Nuevo producto</button>
      </div>

      <p className="adm-conteo">{filtrados.length} producto{filtrados.length === 1 ? '' : 's'}{filtrados.length !== lista.length ? ` de ${lista.length}` : ''} · toca la foto para editarla</p>

      <div className="adm-tabla" role="table" aria-label="Productos">
        <div className="adm-fila adm-fila--cab" role="row">
          <span role="columnheader">Foto</span><span role="columnheader">Producto</span><span role="columnheader">Precio</span>
          <span role="columnheader">Agotado hoy</span><span role="columnheader">En la carta</span><span role="columnheader" className="sr-only">Acciones</span>
        </div>
        {visibles.map((p) => {
          const visible = enCarta(p);
          const ocultas = p.variantes.filter((v) => !v.activo).length;
          return (
            <div key={p.id} className={`adm-fila${visible ? '' : ' adm-fila--oculto'}${ocupado === p.id ? ' is-ocupado' : ''}`} role="row">
              <span role="cell">
                <button type="button" className="adm-mini adm-mini--btn" onClick={() => abrirFoto(p)} aria-label={p.img ? `Editar la foto de ${p.nombre}` : `Subir foto de ${p.nombre}`}>
                  {p.img ? <img src={p.img} alt="" loading="lazy" /> : <small>+ Foto</small>}
                  <i aria-hidden="true">✎</i>
                </button>
              </span>
              <span className="adm-prod" role="cell">
                <b>{p.nombre}{p.destacado && <em className="adm-tag" title="Aparece en Los favoritos">★ Favorito</em>}</b>
                <small>{p.categoria} · {p.variantes.length === 1 && !p.variantes[0].nombre ? 'opción única' : `${p.variantes.length} opciones${p.opcion ? ` (${p.opcion.toLowerCase()})` : ''}`}{ocultas > 0 && ` · ${ocultas} oculta${ocultas === 1 ? '' : 's'}`}</small>
                <small className="adm-ref">{p.variantes.map((v) => v.nombre ?? v.codigo).join(' · ')}</small>
              </span>
              <span className="adm-precio" role="cell"><b>{rango(p.variantes)}</b></span>
              <span role="cell">
                <label className="adm-switch" title={p.agotado ? 'Se ve en la carta como agotado' : 'Disponible para pedir'}>
                  <input type="checkbox" checked={p.agotado} disabled={ocupado === p.id}
                    onChange={() => void cambiar(p, { agotado: !p.agotado }, p.agotado ? `"${p.nombre}" disponible de nuevo` : `"${p.nombre}" marcado como agotado`)} />
                  <span aria-hidden="true" /><em>{p.agotado ? 'Agotado' : 'Disponible'}</em>
                </label>
              </span>
              <span role="cell">
                <button type="button" className={`adm-estado${visible ? ' adm-estado--on' : ''}`} disabled={ocupado === p.id}
                  onClick={() => void cambiar(p, { activo: !p.activo }, p.activo ? `"${p.nombre}" oculto de la carta` : `"${p.nombre}" visible en la carta`)}
                  title={p.activo ? 'Toca para ocultarlo de la carta' : 'Toca para mostrarlo en la carta'}>
                  {visible ? 'Visible' : p.activo ? 'Sin opciones' : 'Oculto'}
                </button>
              </span>
              <span className="adm-acc" role="cell">
                <button type="button" className="adm-btn adm-btn--rapida" onClick={() => setRapida(p)} title="Edición rápida: precios, agotado y visibilidad">$ Rápida</button>
                <button type="button" className="adm-btn" onClick={() => setEditando({ modo: 'editar', p })}>Editar</button>
              </span>
            </div>
          );
        })}
        {!visibles.length && <p className="adm-vacio">No hay productos con ese filtro.</p>}
      </div>

      {paginas > 1 && (
        <div className="adm-paginas">
          <button className="adm-btn" disabled={pag === 0} onClick={() => setPagina(pag - 1)}>← Anterior</button>
          <span>Página {pag + 1} de {paginas}</span>
          <button className="adm-btn" disabled={pag >= paginas - 1} onClick={() => setPagina(pag + 1)}>Siguiente →</button>
        </div>
      )}

      <input ref={inputFoto} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={archivoElegido} />
      {fotoDe && <EditorFoto fuente={fotoDe.fuente} maxKB={props.maxKB} titulo={`Foto de ${fotoDe.p.nombre}`} onListo={fotoLista} onCerrar={cerrarFoto} />}

      {rapida && (
        <EdicionRapida key={rapida.id} p={rapida} onCerrar={() => setRapida(null)} onError={fallar}
          onGuardado={(p) => { reemplazar(p); setRapida(null); toast(`"${p.nombre}" actualizado`); }} />
      )}

      {editando && (
        <Editor
          key={editando.modo === 'editar' ? editando.p.id : 'nuevo'}
          inicial={editando.modo === 'editar' ? editando.p : null}
          categorias={categorias} maxKB={props.maxKB}
          onCerrar={() => setEditando(null)}
          onError={fallar}
          onGuardado={(p, nuevo) => { reemplazar(p); setEditando(null); toast(nuevo ? `"${p.nombre}" creado` : `"${p.nombre}" guardado`); }}
        />
      )}
    </section>
  );
}

/* ---------- Edición rápida: precios, opciones visibles, agotado, favorito y visibilidad ---------- */

function EdicionRapida({ p, onCerrar, onGuardado, onError }: {
  p: ProductoAdmin; onCerrar: () => void; onGuardado: (p: ProductoAdmin) => void; onError: (e: unknown, msg: string) => void;
}) {
  const [precios, setPrecios] = useState(() => Object.fromEntries(p.variantes.map((v) => [v.id, String(v.precio)])));
  const [activas, setActivas] = useState(() => Object.fromEntries(p.variantes.map((v) => [v.id, v.activo])));
  const [f, setF] = useState({ agotado: p.agotado, destacado: p.destacado, activo: p.activo });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  useModal(onCerrar, !guardando);

  const variantes = p.variantes
    .map((v) => ({ id: v.id, precio: leerPesos(precios[v.id] ?? ''), activo: activas[v.id], antes: v }))
    .filter((v) => v.precio !== v.antes.precio || v.activo !== v.antes.activo);
  const invalida = p.variantes.find((v) => leerPesos(precios[v.id] ?? '') === null);
  const cambiosProducto = Object.fromEntries(Object.entries(f).filter(([k, val]) => p[k as keyof typeof f] !== val));
  const hayCambios = variantes.length > 0 || Object.keys(cambiosProducto).length > 0;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (invalida) return setError(`Revisa el precio de ${invalida.nombre ?? p.nombre}: solo números, sin decimales (ej.: 4500).`);
    if (!hayCambios) return onCerrar();
    setGuardando(true); setError('');
    try {
      onGuardado(await api<ProductoAdmin>(`/api/admin/productos/${p.id}`, jsonInit('PATCH', {
        ...cambiosProducto,
        ...(variantes.length ? { variantes: variantes.map((v) => ({ id: v.id, precio: v.precio, activo: v.activo })) } : {}),
      })));
    } catch (err) {
      onError(err, 'No se pudo guardar.');
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      setGuardando(false);
    }
  }

  return (
    <div className="adm-velo" onClick={(e) => { if (e.target === e.currentTarget && !guardando) onCerrar(); }}>
      <form className="adm-editor adm-rapida" onSubmit={guardar} role="dialog" aria-modal="true" aria-labelledby="t-rapida" noValidate>
        <div className="adm-editor__cab">
          <div className="adm-rapida__prod">
            <span className="adm-mini adm-mini--s">{p.img ? <img src={p.img} alt="" /> : null}</span>
            <div><p className="adm-eyebrow">Edición rápida</p><h2 id="t-rapida">{p.nombre}</h2></div>
          </div>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onCerrar} disabled={guardando}>✕</button>
        </div>
        <div className="adm-rapida__cuerpo">
          <div className="adm-rapida__lista">
            {p.variantes.map((v, i) => (
              <div key={v.id} className={`adm-rapida__fila${activas[v.id] ? '' : ' is-oculta'}`}>
                <span className="adm-rapida__nom"><b>{v.nombre ?? 'Precio'}</b><small>Actual: {fmt(v.precio)}</small></span>
                <label className="adm-pesos">
                  <span aria-hidden="true">$</span>
                  <input className="adm-input" inputMode="numeric" autoFocus={i === 0} onFocus={seleccionar} value={precios[v.id]}
                    aria-label={`Precio de ${v.nombre ?? p.nombre}`} onChange={(e) => setPrecios((x) => ({ ...x, [v.id]: e.target.value }))} />
                </label>
                <label className="adm-check-mini" title="Visible en la carta">
                  <input type="checkbox" checked={activas[v.id]} onChange={(e) => setActivas((x) => ({ ...x, [v.id]: e.target.checked }))} />
                  Visible
                </label>
              </div>
            ))}
          </div>
          <div className="adm-rapida__toggles">
            <label className="adm-check adm-check--alerta">
              <input type="checkbox" checked={f.agotado} onChange={(e) => setF({ ...f, agotado: e.target.checked })} />
              <span><b>Agotado hoy</b><small>Se ve en la carta, pero no se puede pedir.</small></span>
            </label>
            <label className="adm-check">
              <input type="checkbox" checked={f.destacado} onChange={(e) => setF({ ...f, destacado: e.target.checked })} />
              <span><b>Favorito</b><small>Aparece en “Los favoritos de la casa”.</small></span>
            </label>
            <label className="adm-check">
              <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
              <span><b>Visible en la carta</b><small>Si lo desmarcas, se oculta (no se borra).</small></span>
            </label>
          </div>
        </div>
        {error && <p className="adm-error" role="alert">{error}</p>}
        <div className="adm-editor__pie">
          <span className="adm-ayuda adm-rapida__tip">Enter guarda · Esc cierra</span>
          <button type="button" className="btn adm-btn-borde" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="btn btn-brasa" disabled={guardando || !hayCambios}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Editor completo (crear / editar) ---------- */

type FilaOpcion = { key: string; id: number | null; codigo: string; nombre: string; detalle: string; precio: string; activo: boolean };
const filaDe = (v: VarianteAdmin): FilaOpcion => ({
  key: `v${v.id}`, id: v.id, codigo: v.codigo, nombre: v.nombre ?? '', detalle: v.detalle ?? '', precio: String(v.precio), activo: v.activo,
});
let nuevas = 0;
const filaVacia = (): FilaOpcion => ({ key: `n${++nuevas}`, id: null, codigo: '', nombre: '', detalle: '', precio: '', activo: true });

function Editor(props: {
  inicial: ProductoAdmin | null; categorias: string[]; maxKB: number;
  onCerrar: () => void; onError: (e: unknown, msg: string) => void; onGuardado: (p: ProductoAdmin, nuevo: boolean) => void;
}) {
  const p = props.inicial;
  const nuevo = !p;
  const [f, setF] = useState({
    nombre: p?.nombre ?? '', categoria: p?.categoria ?? props.categorias[0] ?? '', descripcion: p?.descripcion ?? '', opcion: p?.opcion ?? '',
    activo: p?.activo ?? true, destacado: p?.destacado ?? false, agotado: p?.agotado ?? false,
  });
  const [filas, setFilas] = useState<FilaOpcion[]>(() => (p?.variantes.length ? p.variantes.map(filaDe) : [filaVacia()]));
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [sinFoto, setSinFoto] = useState(false);
  const [editorFoto, setEditorFoto] = useState<File | string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const { onCerrar } = props;
  useModal(onCerrar, !guardando && !editorFoto);

  const img = sinFoto ? '' : foto?.url ?? p?.img ?? '';
  const setFila = (key: string, k: keyof FilaOpcion, v: string | boolean) => setFilas((l) => l.map((m) => (m.key === key ? { ...m, [k]: v } : m)));
  const elegirArchivo = (e: ChangeEvent<HTMLInputElement>) => {
    const a = e.target.files?.[0];
    e.target.value = '';
    if (a) setEditorFoto(a);
  };

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const nombre = f.nombre.trim();
    const categoria = f.categoria.trim();
    if (!nombre) return setError('Escribe el nombre del producto.');
    if (!categoria) return setError('Elige o escribe la categoría.');
    const usadas = filas.filter((m) => m.id !== null || m.nombre.trim() || m.precio.trim());
    if (!usadas.length) return setError('Agrega al menos una opción con precio.');
    for (const m of usadas) {
      if (leerPesos(m.precio) === null) return setError(`Revisa el precio${m.nombre ? ` de ${m.nombre}` : ''}: solo números, sin decimales (ej.: 4500).`);
    }
    if (usadas.length > 1 && usadas.some((m) => !m.nombre.trim())) return setError('Con varias opciones, cada una necesita su nombre (ej.: Entero, Medio, Cuarto).');

    setGuardando(true); setError('');
    try {
      const urlFoto = foto ? await subirFoto(foto.blob) : sinFoto ? '' : p?.img ?? '';
      const opcion = (m: FilaOpcion) => ({
        nombre: m.nombre.trim() || null, detalle: m.detalle.trim() || null, precio: leerPesos(m.precio), activo: m.activo,
        ...(m.codigo.trim() ? { codigo: m.codigo.trim() } : {}),
      });
      let guardado: ProductoAdmin;
      if (!p) {
        guardado = await api<ProductoAdmin>('/api/admin/productos', jsonInit('POST', { ...f, nombre, categoria, img: urlFoto, variantes: usadas.map(opcion) }));
      } else {
        const cambios: Record<string, unknown> = {};
        if (nombre !== p.nombre) cambios.nombre = nombre;
        if (categoria !== p.categoria) cambios.categoria = categoria;
        if (urlFoto !== p.img) cambios.img = urlFoto;
        for (const k of ['descripcion', 'opcion', 'activo', 'destacado', 'agotado'] as const) if (f[k] !== p[k]) cambios[k] = f[k];
        const variantes = usadas.flatMap((m): Record<string, unknown>[] => {
          if (m.id === null) return [opcion(m)];
          const a = p.variantes.find((v) => v.id === m.id)!;
          const c: Record<string, unknown> = {};
          if (m.codigo.trim() && m.codigo.trim() !== a.codigo) c.codigo = m.codigo.trim();
          if ((m.nombre.trim() || null) !== a.nombre) c.nombre = m.nombre.trim() || null;
          if ((m.detalle.trim() || null) !== a.detalle) c.detalle = m.detalle.trim() || null;
          if (leerPesos(m.precio) !== a.precio) c.precio = leerPesos(m.precio);
          if (m.activo !== a.activo) c.activo = m.activo;
          return Object.keys(c).length ? [{ id: m.id, ...c }] : [];
        });
        if (variantes.length) cambios.variantes = variantes;
        guardado = Object.keys(cambios).length ? await api<ProductoAdmin>(`/api/admin/productos/${p.id}`, jsonInit('PATCH', cambios)) : p;
      }
      if (foto) URL.revokeObjectURL(foto.url);
      props.onGuardado(guardado, nuevo);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) props.onError(err, 'Sesión vencida');
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      setGuardando(false);
    }
  }

  return (
    <div className="adm-velo" onClick={(e) => { if (e.target === e.currentTarget && !guardando) props.onCerrar(); }}>
      <form className="adm-editor adm-editor--ancho" onSubmit={guardar} role="dialog" aria-modal="true" aria-labelledby="t-editor" noValidate>
        <div className="adm-editor__cab">
          <h2 id="t-editor">{p ? `Editar ${p.nombre}` : 'Nuevo producto'}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={props.onCerrar} disabled={guardando}>✕</button>
        </div>

        <div className="adm-editor__cuerpo">
          <div className="adm-foto">
            <button type="button" className="adm-foto__img" onClick={() => (img ? setEditorFoto(img) : undefined)} disabled={!img} aria-label="Editar la foto">
              {img ? <img src={img} alt="Foto del producto" /> : <span>Sin foto</span>}
            </button>
            <div className="adm-foto__acc">
              <label className="adm-btn">{img ? 'Cambiar' : 'Subir foto'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={elegirArchivo} disabled={guardando} hidden /></label>
              {img && <button type="button" className="adm-btn" onClick={() => setEditorFoto(img)} disabled={guardando}>Editar</button>}
            </div>
            {img && <button type="button" className="adm-link" onClick={() => { setSinFoto(true); setFoto(null); }} disabled={guardando}>Quitar foto</button>}
            {(foto || sinFoto) && p?.img && <button type="button" className="adm-link" onClick={() => { setFoto(null); setSinFoto(false); }} disabled={guardando}>Deshacer cambio de foto</button>}
            <small className="adm-ayuda">Recorta, gira y mejora la luz antes de subirla. Se guarda cuadrada y liviana.</small>
          </div>

          <div className="adm-campos">
            <label className="adm-campo adm-campo--full">
              Nombre del producto
              <input className="adm-input" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} maxLength={150} placeholder="Ej.: Pollo Asado" />
            </label>
            <label className="adm-campo">
              Categoría
              <input className="adm-input" list="adm-categorias" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} maxLength={80} placeholder="Ej.: Pollos y promos" />
              <datalist id="adm-categorias">{props.categorias.map((c) => <option key={c} value={c} />)}</datalist>
              <small className="adm-ayuda">Elige una o escribe una nueva.</small>
            </label>
            <label className="adm-campo">
              Título de las opciones
              <input className="adm-input" value={f.opcion} onChange={(e) => setF({ ...f, opcion: e.target.value })} maxLength={40} placeholder="Ej.: Tamaño, Relleno" />
              <small className="adm-ayuda">Se muestra sobre los botones de opción.</small>
            </label>
            <label className="adm-campo adm-campo--full">
              Descripción (ingredientes)
              <textarea className="adm-input" rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} maxLength={600} placeholder="Ej.: Pan, lechuga, tomate, jamón, queso…" />
            </label>
            <div className="adm-campo--full adm-checks">
              <label className="adm-check"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /><span><b>Visible en la carta</b><small>Desmarca para ocultarlo sin borrarlo.</small></span></label>
              <label className="adm-check"><input type="checkbox" checked={f.destacado} onChange={(e) => setF({ ...f, destacado: e.target.checked })} /><span><b>Favorito</b><small>Sale en “Los favoritos de la casa”.</small></span></label>
              <label className="adm-check adm-check--alerta"><input type="checkbox" checked={f.agotado} onChange={(e) => setF({ ...f, agotado: e.target.checked })} /><span><b>Agotado hoy</b><small>Se ve, pero no se puede pedir.</small></span></label>
            </div>

            <fieldset className="adm-medidas adm-campo--full">
              <legend>Opciones y precios (CLP)</legend>
              <div className="adm-medidas__tabla">
                <div className="adm-medida adm-medida--cab">
                  <span>Opción</span><span>Incluye (opcional)</span><span>Precio $</span><span>Código</span><span>Visible</span>
                </div>
                {filas.map((m) => (
                  <div key={m.key} className={`adm-medida${m.activo ? '' : ' is-oculta'}`}>
                    <input className="adm-input" aria-label="Nombre de la opción" value={m.nombre} maxLength={80} placeholder={filas.length > 1 ? 'Ej.: Entero' : 'Vacío = única'} onChange={(e) => setFila(m.key, 'nombre', e.target.value)} />
                    <input className="adm-input" aria-label="Qué incluye" value={m.detalle} maxLength={255} placeholder="Ej.: 1/4 de pollo + papas" onChange={(e) => setFila(m.key, 'detalle', e.target.value)} />
                    <input className="adm-input" aria-label="Precio" inputMode="numeric" value={m.precio} placeholder="4500" onFocus={seleccionar} onChange={(e) => setFila(m.key, 'precio', e.target.value)} />
                    <input className="adm-input adm-input--cod" aria-label="Código" value={m.codigo} maxLength={40} placeholder="automático" onChange={(e) => setFila(m.key, 'codigo', e.target.value.toUpperCase())} />
                    <span className="adm-medida__acc">
                      <input type="checkbox" aria-label="Visible" checked={m.activo} onChange={(e) => setFila(m.key, 'activo', e.target.checked)} />
                      {m.id === null && filas.length > 1 && (
                        <button type="button" className="adm-link" onClick={() => setFilas((l) => l.filter((x) => x.key !== m.key))}>Quitar</button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div className="adm-medidas__pie">
                <button type="button" className="adm-btn" onClick={() => setFilas((l) => [...l, filaVacia()])}>+ Agregar opción</button>
              </div>
              <small className="adm-ayuda">
                Producto sin opciones: deja una sola fila con el nombre vacío. Las opciones no se borran: desmarca “Visible” para ocultarlas
                (los pedidos conservan su historial). El código se genera solo si lo dejas vacío.
              </small>
            </fieldset>
          </div>
        </div>

        {error && <p className="adm-error" role="alert">{error}</p>}
        <div className="adm-editor__pie">
          <button type="button" className="btn adm-btn-borde" onClick={props.onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="btn btn-brasa" disabled={guardando}>{guardando ? 'Guardando…' : nuevo ? 'Crear producto' : 'Guardar cambios'}</button>
        </div>
      </form>

      {editorFoto && (
        <EditorFoto fuente={editorFoto} maxKB={props.maxKB} titulo={f.nombre ? `Foto de ${f.nombre}` : 'Foto del producto'}
          onCerrar={() => setEditorFoto(null)}
          onListo={(r) => { if (foto) URL.revokeObjectURL(foto.url); setFoto(r); setSinFoto(false); setEditorFoto(null); }} />
      )}
    </div>
  );
}
