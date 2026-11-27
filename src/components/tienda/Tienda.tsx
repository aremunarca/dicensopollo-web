'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG, DIRECCION_COMPLETA, MAPA_EMBED, MAPA_LINK, WA_DEFAULT, fmt, linkWa, type ProductoCarta } from '@/lib/config';
import { norm } from '@/lib/texto';
import type { SucursalPublica } from '@/lib/admin-tipos';
import Tarjeta from './Tarjeta';
import Comanda, { type Linea } from './Comanda';

const CLAVE_COMANDA = 'dc_comanda_v1';
const TICKER = ['Pollos asados', 'Papas fritas', 'Empanadas', 'Arepas', 'Cachapas', 'Completos', 'Colaciones', 'Sopaipillas', 'Delivery'];
// Chispas de la portada (posiciones fijas para que el servidor y el navegador dibujen lo mismo)
const CHISPAS = [8, 15, 23, 31, 38, 46, 52, 61, 67, 74, 81, 88, 93, 97].map((x, i) => ({ x, d: (i * 0.73) % 6, t: 5 + ((i * 1.7) % 4), s: 3 + (i % 3) * 2 }));

const IconoWa = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.6 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z" />
  </svg>
);
const IconoBolsa = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 7h12l1 13H5L6 7Z" /><path d="M9 10V6a3 3 0 0 1 6 0v4" />
  </svg>
);

/** La carta online de Di Censo Pollo. */
export default function Tienda({ productos, sucursales }: { productos: ProductoCarta[]; sucursales: SucursalPublica[] }) {
  const [comanda, setComanda] = useState<Map<number, number>>(new Map());
  const [abierta, setAbierta] = useState(false);
  const [q, setQ] = useState('');
  const [activa, setActiva] = useState('');
  const [toast, setToast] = useState({ txt: '', on: false });
  const [pulso, setPulso] = useState(0);
  const timerToast = useRef<ReturnType<typeof setTimeout>>(undefined);

  const porVariante = useMemo(() => {
    const m = new Map<number, { p: ProductoCarta; o: ProductoCarta['opciones'][number] }>();
    for (const p of productos) for (const o of p.opciones) m.set(o.id, { p, o });
    return m;
  }, [productos]);
  const categorias = useMemo(() => [...new Set(productos.map((p) => p.categoria))], [productos]);
  const destacados = productos.filter((p) => p.destacado);
  const estrella = productos.find((p) => p.slug === 'pollo-asado') ?? destacados[0] ?? productos[0];
  const precioEstrella = estrella ? Math.max(...estrella.opciones.map((o) => o.precio)) : 0;
  const opEstrella = estrella?.opciones.find((o) => o.precio === precioEstrella);

  // Comanda guardada en este equipo
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_COMANDA) ?? '[]') as [number, number][];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee una vez al montar (localStorage no existe en el servidor)
      if (Array.isArray(g)) setComanda(new Map(g.filter(([id, n]) => porVariante.has(id) && !porVariante.get(id)!.p.agotado && n > 0)));
    } catch { /* datos dañados: se ignoran */ }
  }, [porVariante]);
  const guardar = (m: Map<number, number>) => {
    setComanda(m);
    localStorage.setItem(CLAVE_COMANDA, JSON.stringify([...m]));
  };

  const avisar = (txt: string) => {
    setToast({ txt, on: true });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast((t) => ({ ...t, on: false })), 2200);
  };

  const agregar = (id: number, qty: number) => {
    const m = new Map(comanda);
    m.set(id, Math.min(99, (m.get(id) ?? 0) + qty));
    guardar(m);
    setPulso((n) => n + 1);
    const x = porVariante.get(id);
    if (x) avisar(`${qty} × ${x.p.nombre}${x.o.nombre ? ` (${x.o.nombre})` : ''} a la comanda`);
  };
  const cantidad = (id: number, qty: number) => {
    const m = new Map(comanda);
    if (qty <= 0) m.delete(id); else m.set(id, Math.min(99, qty));
    guardar(m);
  };
  const vaciar = useCallback(() => { setComanda(new Map()); localStorage.removeItem(CLAVE_COMANDA); }, []);
  const cerrar = useCallback(() => setAbierta(false), []);

  const lineas: Linea[] = [...comanda].flatMap(([id, qty]) => {
    const x = porVariante.get(id);
    return x ? [{ id, qty, nombre: x.p.nombre, opcion: x.o.nombre, precio: x.o.precio, img: x.p.img }] : [];
  });
  const unidades = lineas.reduce((s, l) => s + l.qty, 0);
  const total = lineas.reduce((s, l) => s + l.qty * l.precio, 0);

  // Búsqueda (nombre, descripción, opciones o categoría; sin acentos)
  const palabras = norm(q.trim()).split(/\s+/).filter(Boolean);
  const encontrados = palabras.length
    ? productos.filter((p) => {
      const txt = norm(`${p.nombre} ${p.descripcion} ${p.categoria} ${p.opciones.map((o) => `${o.nombre ?? ''} ${o.detalle ?? ''}`).join(' ')}`);
      return palabras.every((w) => txt.includes(w));
    })
    : null;

  // Sección visible de la carta (para resaltar su pestaña)
  const buscando = encontrados !== null;
  useEffect(() => {
    if (buscando) return;
    const obs = new IntersectionObserver((entradas) => {
      const vis = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActiva(vis.target.id);
    }, { rootMargin: '-140px 0px -60% 0px' });
    document.querySelectorAll('.seccion-carta').forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [buscando]);
  const idCat = (c: string) => `c-${norm(c).replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <>
      <header className="cab">
        <div className="wrap cab__in">
          <a className="cab__marca" href="#inicio" aria-label={`${CONFIG.nombre}, inicio`}>
            <img src="/marca/logo.webp" alt="" width={48} height={48} />
            <span>Di Censo<b>Pollo</b></span>
          </a>
          <nav className="cab__nav" aria-label="Secciones">
            <a href="#carta">Carta</a>
            {destacados.length > 0 && <a href="#favoritos">Favoritos</a>}
            <a href="#local">El local</a>
          </nav>
          <a className="cab__wa" href={linkWa(WA_DEFAULT)} target="_blank" rel="noopener noreferrer"><IconoWa /><span>{CONFIG.telefonoVisible}</span></a>
          <button type="button" key={pulso} className={`cab__comanda${pulso ? ' pulso' : ''}`} onClick={() => setAbierta(true)} aria-label={`Abrir la comanda: ${unidades} productos, ${fmt(total)}`}>
            <IconoBolsa /><span className="cab__total">{unidades ? fmt(total) : 'Carrito'}</span>
            {unidades > 0 && <b className="cab__n">{unidades}</b>}
          </button>
        </div>
      </header>

      <main id="inicio">
        {/* ---------- Portada ---------- */}
        <section className="hero" aria-labelledby="t-hero">
          <div className="hero__chispas" aria-hidden="true">
            {CHISPAS.map((c, i) => <i key={i} style={{ left: `${c.x}%`, animationDelay: `${c.d}s`, animationDuration: `${c.t}s`, width: c.s, height: c.s }} />)}
          </div>
          <div className="wrap hero__in">
            <div className="hero__txt">
              <p className="eyebrow">Comida al paso · {CONFIG.comuna}</p>
              <h1 id="t-hero" className="hero__titulo">
                <span>El más rico,</span>
                <span className="fuego">el más sabroso</span>
              </h1>
              <p className="hero__lead">
                Seleccionamos el mejor pollo y lo preparamos con recetas que resaltan su sabor: doradito, jugosito y delicioso,
                con papas crujientes y ensalada fresca.
              </p>
              <div className="hero__cta">
                <a className="btn btn-fuego" href="#carta">Armar mi pedido</a>
                <a className="btn btn-borde" href={linkWa(WA_DEFAULT)} target="_blank" rel="noopener noreferrer"><IconoWa /> Pedir por WhatsApp</a>
              </div>
              <ul className="hero__datos">
                <li><b>Delivery</b> y retiro en el local</li>
                <li><b>{productos.length}</b> platos en la carta</li>
              </ul>
            </div>
            <div className="hero__plato">
              <svg className="hero__anillo" viewBox="0 0 400 400" aria-hidden="true">
                <defs><path id="anillo" d="M200,200 m-176,0 a176,176 0 1,1 352,0 a176,176 0 1,1 -352,0" /></defs>
                <text><textPath href="#anillo">DI CENSO POLLO ✦ EL MÁS RICO ✦ EL MÁS SABROSO ✦ COMIDA AL PASO ✦</textPath></text>
              </svg>
              <div className="hero__foto"><img src="/marca/pollo-fuego.webp" alt="Pollo asado dorado con papas" width={464} height={364} /></div>
              {estrella && opEstrella && (
                <a className="hero__precio" href={`#p-${estrella.slug}`}>
                  <small>{estrella.nombre}{opEstrella.nombre ? ` ${opEstrella.nombre.toLowerCase()}` : ''}</small>
                  <b>{fmt(precioEstrella)}</b>
                </a>
              )}
            </div>
          </div>
        </section>

        <div className="ticker" aria-hidden="true">
          <div className="ticker__pista">
            {[0, 1].map((k) => <span key={k}>{TICKER.map((t) => <span key={t}>{t}<i>✦</i></span>)}</span>)}
          </div>
        </div>

        {/* ---------- Favoritos ---------- */}
        {destacados.length > 0 && (
          <section className="seccion favoritos" id="favoritos" aria-labelledby="t-fav">
            <div className="wrap">
              <div className="titulo-sec">
                <p className="eyebrow">Los que más salen</p>
                <h2 id="t-fav">Los favoritos de la casa</h2>
              </div>
              <div className="favoritos__riel">
                {destacados.map((p) => <Tarjeta key={p.id} p={p} onAgregar={agregar} grande />)}
              </div>
            </div>
          </section>
        )}

        {/* ---------- Carta ---------- */}
        <section className="seccion carta" id="carta" aria-labelledby="t-carta">
          <div className="wrap">
            <div className="titulo-sec titulo-sec--fila">
              <div>
                <p className="eyebrow">Elige, agrega y envía</p>
                <h2 id="t-carta">La carta</h2>
              </div>
              <label className="buscar">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca: arepa, papas, promo…" aria-label="Buscar en la carta" />
              </label>
            </div>
          </div>

          {!encontrados && (
            <nav className="pestanas" aria-label="Secciones de la carta">
              <div className="wrap pestanas__in">
                {categorias.map((c) => (
                  <a key={c} href={`#${idCat(c)}`} className={activa === idCat(c) ? 'is-on' : ''}>{c}</a>
                ))}
              </div>
            </nav>
          )}

          <div className="wrap">
            {encontrados ? (
              <div className="seccion-carta">
                <p className="carta__resultado">{encontrados.length ? `${encontrados.length} resultado${encontrados.length === 1 ? '' : 's'} para “${q.trim()}”` : `No encontramos “${q.trim()}”. Prueba con otra palabra.`}</p>
                <div className="grilla">{encontrados.map((p) => <Tarjeta key={p.id} p={p} onAgregar={agregar} />)}</div>
              </div>
            ) : categorias.map((c, i) => (
              <section key={c} className="seccion-carta" id={idCat(c)} aria-labelledby={`t-${idCat(c)}`}>
                <h3 className="seccion-carta__titulo" id={`t-${idCat(c)}`}><span>{String(i + 1).padStart(2, '0')}</span>{c}</h3>
                <div className="grilla">{productos.filter((p) => p.categoria === c).map((p) => <Tarjeta key={p.id} p={p} onAgregar={agregar} />)}</div>
              </section>
            ))}
          </div>
        </section>

        {/* ---------- Cómo pedir ---------- */}
        <section className="seccion pasos" aria-labelledby="t-pasos">
          <div className="wrap">
            <div className="titulo-sec"><p className="eyebrow">Así de fácil</p><h2 id="t-pasos">Cómo pedir</h2></div>
            <ol className="pasos__lista">
              <li><b>1</b><h3>Arma tu comanda</h3><p>Elige el tamaño o el relleno en cada plato y agrégalo. Tu comanda se guarda mientras navegas.</p></li>
              <li><b>2</b><h3>Envíala por WhatsApp</h3><p>Completa tus datos y la comanda llega a la cocina con el detalle y el total.</p></li>
              <li><b>3</b><h3>Recibe o retira</h3><p>Te confirmamos por WhatsApp. Delivery a tu puerta o retiro en {CONFIG.direccion}.</p></li>
            </ol>
          </div>
        </section>

        {/* ---------- El local ---------- */}
        <section className="seccion local" id="local" aria-labelledby="t-local">
          <div className="wrap local__in">
            <div className="local__foto"><img src="/marca/local.webp" alt={`Fachada de ${CONFIG.nombre} en ${CONFIG.direccion}`} width={1000} height={979} loading="lazy" /></div>
            <div className="local__info">
              <p className="eyebrow">Ubícanos</p>
              <h2 id="t-local">Te esperamos en {CONFIG.comuna}</h2>
              <p className="local__dir">{DIRECCION_COMPLETA}</p>
              <p>¿Listo para probar el mejor pollo? Calidad y sabor en cada bocado. Visítanos o pide por WhatsApp.</p>
              <div className="local__cta">
                <a className="btn btn-wa" href={linkWa(WA_DEFAULT)} target="_blank" rel="noopener noreferrer"><IconoWa /> {CONFIG.telefonoVisible}</a>
                <a className="btn btn-borde" href={MAPA_LINK} target="_blank" rel="noopener noreferrer">Cómo llegar</a>
              </div>
              <div className="local__redes">
                <a href={CONFIG.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>
                <a href={CONFIG.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
              </div>
              <iframe className="local__mapa" src={MAPA_EMBED} title={`Mapa: ${DIRECCION_COMPLETA}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
          </div>
        </section>
      </main>

      <footer className="pie">
        <div className="wrap pie__in">
          <div className="pie__marca">
            <img src="/marca/logo.webp" alt="" width={64} height={64} loading="lazy" />
            <p><b>{CONFIG.nombre}</b><span>{CONFIG.lema}</span></p>
          </div>
          <p className="pie__dir">{CONFIG.direccion}, {CONFIG.comuna} · {CONFIG.telefonoVisible}</p>
          <a className="nw-credito" href="https://novawork.digital/" target="_blank" rel="noopener" aria-label="Desarrollado por Nova Work Marketing (abre novawork.digital)">
            <span>Desarrollado por</span><img src="/novawork/novawork-claro.webp" alt="Nova Work" width={1200} height={447} loading="lazy" />
          </a>
        </div>
        <p className="pie__copy">© {new Date().getFullYear()} {CONFIG.nombre}. Precios en pesos chilenos (CLP).</p>
      </footer>

      {unidades > 0 && !abierta && (
        <button type="button" className="barra-comanda" onClick={() => setAbierta(true)}>
          <span><b>{unidades}</b> en tu comanda</span>
          <span>Ver comanda · <b>{fmt(total)}</b></span>
        </button>
      )}

      <Comanda abierta={abierta} lineas={lineas} sucursales={sucursales} onCantidad={cantidad} onVaciar={vaciar} onCerrar={cerrar} />
      <div className={`toast${toast.on ? ' on' : ''}`} role="status" aria-live="polite">{toast.txt}</div>
    </>
  );
}
