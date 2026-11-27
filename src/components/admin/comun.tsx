'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ESTADO_TEXTO, type EstadoPedido } from '@/lib/admin-tipos';

// Piezas compartidas por las vistas del panel /admin.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** fetch a la API del panel: devuelve el JSON o lanza ApiError con el mensaje del servidor. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init).catch(() => null);
  if (!res) throw new ApiError(0, 'Sin conexión con el servidor.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Ocurrió un error. Intenta de nuevo.');
  return data as T;
}
export const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Sube una foto ya procesada y devuelve su URL (/api/imagenes/12). */
export async function subirFoto(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append('imagen', blob, 'foto.jpg');
  return (await api<{ url: string }>('/api/admin/imagenes', { method: 'POST', body: fd })).url;
}

/** Descarga un archivo de la API (plantillas, carta). */
export async function descargar(url: string) {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) throw new ApiError(res?.status ?? 0, (await res?.json().catch(() => null))?.error ?? 'No se pudo descargar el archivo.');
  const nombre = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'archivo';
  const href = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href, download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
  return nombre;
}

export type Toast = (texto: string, tipo?: 'ok' | 'error') => void;

export function useToast() {
  const [estado, setEstado] = useState({ texto: '', tipo: 'ok' as 'ok' | 'error', visible: false });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast: Toast = useCallback((texto, tipo = 'ok') => {
    setEstado({ texto, tipo, visible: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setEstado((e) => ({ ...e, visible: false })), tipo === 'error' ? 4500 : 2800);
  }, []);
  const nodo = (
    <div className={`adm-toast${estado.visible ? ' on' : ''}${estado.tipo === 'error' ? ' adm-toast--error' : ''}`} role="status" aria-live="polite">
      {estado.texto}
    </div>
  );
  return { toast, nodo };
}

/** Bloquea el scroll de la página y cierra con Esc mientras un modal está abierto. */
export function useModal(onCerrar: () => void, activo = true) {
  useEffect(() => {
    if (!activo) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onCerrar, activo]);
}

export const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Nunca';

export function ChipEstado({ estado }: { estado: EstadoPedido | 'COMENTARIO' }) {
  return <span className={`adm-chip adm-chip--${estado.toLowerCase()}`}>{estado === 'COMENTARIO' ? 'Comentario' : ESTADO_TEXTO[estado]}</span>;
}

export function Kpi({ titulo, valor, nota, acento = false }: { titulo: string; valor: string; nota?: string; acento?: boolean }) {
  return (
    <div className={`adm-kpi${acento ? ' adm-kpi--acento' : ''}`}>
      <span>{titulo}</span>
      <strong>{valor}</strong>
      {nota && <small>{nota}</small>}
    </div>
  );
}

export function Tarjeta({ titulo, sub, children, ancha = false, className = '' }: { titulo: string; sub?: string; children: ReactNode; ancha?: boolean; className?: string }) {
  return (
    <article className={`adm-card${ancha ? ' adm-card--ancha' : ''} ${className}`}>
      <header><h3>{titulo}</h3>{sub && <span>{sub}</span>}</header>
      {children}
    </article>
  );
}

/* ---------- Iconos del menú ---------- */

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const ICONOS = {
  estadisticas: svg(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  pedidos: svg(<><path d="M6 3h12l1 18-4-2-3 2-3-2-4 2z" /><path d="M9 8h6M9 12h6" /></>),
  productos: svg(<><path d="M3 11h18a9 9 0 0 1-18 0Z" /><path d="M12 3v3M8 4.5l1 2M16 4.5l-1 2" /></>),
  carga: svg(<><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></>),
  usuarios: svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a5 5 0 0 1 3.5 5.5" /></>),
  sucursales: svg(<><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.2" /></>),
  tienda: svg(<><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9M9 20v-6h6v6M3 9h18" /></>),
  salir: svg(<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />),
  menu: svg(<path d="M4 6h16M4 12h16M4 18h16" />),
};
