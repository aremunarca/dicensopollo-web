'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ROL_TEXTO, vistasDe, type ProductoAdmin, type Rol, type UsuarioSesion, type Vista } from '@/lib/admin-tipos';
import { api, ICONOS, useToast } from './comun';
import VistaProductos from './VistaProductos';
import VistaPedidos from './VistaPedidos';
import VistaEstadisticas from './VistaEstadisticas';
import VistaUsuarios from './VistaUsuarios';
import VistaCarga from './VistaCarga';

const MENU: { titulo: string; items: { id: Vista; label: string; icono: ReactNode; roles: Rol[] }[] }[] = [
  {
    titulo: 'Gerencia',
    items: [
      { id: 'estadisticas', label: 'Ventas y estadísticas', icono: ICONOS.estadisticas, roles: ['GERENTE'] },
      { id: 'usuarios', label: 'Usuarios', icono: ICONOS.usuarios, roles: ['GERENTE'] },
    ],
  },
  {
    titulo: 'Operación',
    items: [
      { id: 'pedidos', label: 'Pedidos', icono: ICONOS.pedidos, roles: ['GERENTE', 'LOGISTICA'] },
      { id: 'productos', label: 'Carta y precios', icono: ICONOS.productos, roles: ['GERENTE', 'LOGISTICA'] },
      { id: 'carga', label: 'Carga masiva', icono: ICONOS.carga, roles: ['GERENTE', 'LOGISTICA'] },
    ],
  },
];

const TITULOS: Record<Vista, { eyebrow: string; titulo: string }> = {
  estadisticas: { eyebrow: 'Gerencia', titulo: 'Ventas y estadísticas' },
  usuarios: { eyebrow: 'Gerencia', titulo: 'Usuarios del panel' },
  pedidos: { eyebrow: 'Operación', titulo: 'Pedidos' },
  productos: { eyebrow: 'Operación', titulo: 'Carta y precios' },
  carga: { eyebrow: 'Operación', titulo: 'Carga masiva y fotos en lote' },
};

/** Panel /admin: menú lateral según el rol y la vista elegida (?vista=…). */
export default function AdminPanel(props: {
  usuario: UsuarioSesion;
  productos: ProductoAdmin[];
  categorias: string[];
  maxKB: number;
  vistaInicial: Vista;
  pedidoInicial: number | null;
  pendientes: number;
}) {
  const { usuario } = props;
  const [vista, setVista] = useState<Vista>(props.vistaInicial);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [pendientes, setPendientes] = useState(props.pendientes);
  const [productos, setProductos] = useState(props.productos);
  const [categorias, setCategorias] = useState(props.categorias);
  const { toast, nodo: toastNodo } = useToast();

  const permitidas = vistasDe(usuario.rol);

  const ir = (v: Vista) => {
    setVista(v); setMenuAbierto(false);
    const url = new URL(window.location.href);
    url.searchParams.set('vista', v);
    url.searchParams.delete('pedido');
    window.history.replaceState(null, '', url);
    window.scrollTo({ top: 0 });
  };

  // Atrás/adelante del navegador
  useEffect(() => {
    const pop = () => {
      const v = new URL(window.location.href).searchParams.get('vista') as Vista | null;
      if (v && permitidas.includes(v)) setVista(v);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [permitidas]);

  const sesionVencida = useCallback(() => { setTimeout(() => window.location.reload(), 1200); }, []);
  const salir = async () => { await fetch('/api/admin/sesion', { method: 'DELETE' }).catch(() => null); window.location.reload(); };

  /** Después de una carga masiva o de fotos en lote: se recargan productos y categorías. */
  const recargarCarta = useCallback(async () => {
    const r = await api<{ productos: ProductoAdmin[]; categorias: string[] }>('/api/admin/productos');
    setProductos(r.productos);
    setCategorias(r.categorias);
  }, []);

  const t = TITULOS[vista];

  return (
    <div className="adm adm-panel">
      <aside className={`adm-side${menuAbierto ? ' is-open' : ''}`} aria-label="Menú del panel">
        <div className="adm-side__marca">
          <img className="adm-side__logo" src="/marca/logo.webp" alt="" width={52} height={52} />
          <span><b>Di Censo Pollo</b><small>Panel administrativo</small></span>
        </div>
        <nav className="adm-side__nav">
          {MENU.map((sec) => {
            const items = sec.items.filter((i) => i.roles.includes(usuario.rol));
            if (!items.length) return null;
            return (
              <div key={sec.titulo} className="adm-side__sec">
                <p>{sec.titulo}</p>
                {items.map((i) => (
                  <button key={i.id} type="button" className={`adm-side__link${vista === i.id ? ' is-active' : ''}`}
                    aria-current={vista === i.id ? 'page' : undefined} onClick={() => ir(i.id)}>
                    {i.icono}<span>{i.label}</span>
                    {i.id === 'pedidos' && pendientes > 0 && <b className="adm-badge" aria-label={`${pendientes} pedidos pendientes`}>{pendientes}</b>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="adm-side__pie">
          <div className="adm-side__user">
            <span className="adm-avatar" aria-hidden="true">{usuario.nombre.slice(0, 1).toUpperCase()}</span>
            <span><b>{usuario.nombre}</b><small>{ROL_TEXTO[usuario.rol]} · @{usuario.usuario}</small></span>
          </div>
          <a className="adm-side__link" href="/" target="_blank" rel="noopener">{ICONOS.tienda}<span>Ver la carta</span></a>
          <button className="adm-side__link" type="button" onClick={salir}>{ICONOS.salir}<span>Cerrar sesión</span></button>
        </div>
      </aside>
      {menuAbierto && <div className="adm-side__velo" onClick={() => setMenuAbierto(false)} aria-hidden="true" />}

      <div className="adm-contenido">
        <header className="adm-cab">
          <button type="button" className="adm-cab__menu" aria-label="Abrir menú" onClick={() => setMenuAbierto(true)}>{ICONOS.menu}</button>
          <div>
            <p className="adm-eyebrow">{t.eyebrow}</p>
            <h1>{t.titulo}</h1>
          </div>
        </header>

        <main className="adm-main">
          {vista === 'pedidos' && (
            <VistaPedidos toast={toast} onSesionVencida={sesionVencida} onPendientes={setPendientes} pedidoInicial={props.pedidoInicial} />
          )}
          {vista === 'estadisticas' && usuario.rol === 'GERENTE' && <VistaEstadisticas toast={toast} onSesionVencida={sesionVencida} />}
          {vista === 'productos' && (
            <VistaProductos lista={productos} setLista={setProductos} categorias={categorias} maxKB={props.maxKB} toast={toast} onSesionVencida={sesionVencida} />
          )}
          {vista === 'carga' && (
            <VistaCarga productos={productos} maxKB={props.maxKB} toast={toast} onSesionVencida={sesionVencida} onAplicado={recargarCarta} />
          )}
          {vista === 'usuarios' && usuario.rol === 'GERENTE' && <VistaUsuarios yo={usuario} toast={toast} onSesionVencida={sesionVencida} />}
        </main>
      </div>
      {toastNodo}
    </div>
  );
}
