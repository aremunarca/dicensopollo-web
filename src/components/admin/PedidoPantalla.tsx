'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { numeroPedido, ROL_TEXTO, type UsuarioSesion } from '@/lib/admin-tipos';
import { useToast, type ApiError } from './comun';
import PedidoDetalle from './PedidoDetalle';

const PANEL = '/admin?vista=pedidos';

/** Pantalla propia de un pedido (/admin/pedidos/[id]): el mismo detalle del panel a página completa. */
export default function PedidoPantalla({ id, usuario }: { id: number; usuario: UsuarioSesion }) {
  const { toast, nodo } = useToast();
  const [error, setError] = useState<{ noExiste: boolean; msg: string } | null>(null);
  const [intento, setIntento] = useState(0);

  const sesionVencida = useCallback(() => { setTimeout(() => window.location.reload(), 1200); }, []);
  const errorCarga = useCallback((e: ApiError) => {
    if (e.status === 401) return window.location.reload();
    setError(e.status === 404 ? { noExiste: true, msg: `El pedido ${numeroPedido(id)} no existe o fue eliminado.` } : { noExiste: false, msg: e.message });
  }, [id]);
  const salir = async () => { await fetch('/api/admin/sesion', { method: 'DELETE' }).catch(() => null); window.location.reload(); };

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-contenedor adm-top__in">
          <Link href={PANEL} aria-label="Ir al panel" className="adm-top__marca"><img src="/marca/logo.webp" alt="" width={40} height={40} /><b>Di Censo Pollo</b></Link>
          <div className="adm-top__der">
            <span className="adm-top__user">{usuario.nombre} · {ROL_TEXTO[usuario.rol]}</span>
            <Link className="adm-btn adm-btn--claro" href={PANEL}>← Todos los pedidos</Link>
            <button className="adm-btn adm-btn--claro" type="button" onClick={salir}>Salir</button>
          </div>
        </div>
      </header>
      <main className="adm-contenedor adm-main">
        <div className="adm-card adm-pantalla">
          {error ? (
            <div className="adm-vacio">
              <p className="adm-eyebrow">{numeroPedido(id)}</p>
              <h1>{error.noExiste ? 'Pedido no encontrado' : 'No se pudo abrir el pedido'}</h1>
              <p>{error.msg}</p>
              <div className="adm-acciones__btns adm-centro">
                {!error.noExiste && <button className="btn btn-brasa" type="button" onClick={() => { setError(null); setIntento((n) => n + 1); }}>Reintentar</button>}
                <Link className="btn adm-btn-borde" href={PANEL}>Ver todos los pedidos</Link>
              </div>
            </div>
          ) : (
            <PedidoDetalle key={intento} id={id} toast={toast} onSesionVencida={sesionVencida} onErrorCarga={errorCarga} Titulo="h1" />
          )}
        </div>
      </main>
      {nodo}
    </div>
  );
}
