import type { Metadata } from 'next';
import { connection } from 'next/server';
import { usuarioActual } from '@/lib/auth';
import { listarCategorias, listarProductosAdmin } from '@/lib/catalogo';
import { contarPendientes } from '@/lib/pedidos';
import { maxImagenKB } from '@/lib/imagenes';
import { leerIdPedido, vistasDe, type Vista } from '@/lib/admin-tipos';
import AdminLogin from '@/components/admin/AdminLogin';
import AdminPanel from '@/components/admin/AdminPanel';
import './admin.css';

export const metadata: Metadata = { title: 'Panel administrativo · Di Censo Pollo', robots: { index: false, follow: false } };

/** /admin?vista=pedidos|estadisticas|productos|carga|usuarios (&pedido=12 abre ese pedido). */
export default async function Admin(props: PageProps<'/admin'>) {
  await connection();
  const usuario = await usuarioActual();
  if (!usuario) return <AdminLogin />;

  const sp = await props.searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const permitidas = vistasDe(usuario.rol);
  const pedido = leerIdPedido(uno(sp.pedido));
  const pedida = uno(sp.vista) as Vista;
  const vista: Vista = pedido ? 'pedidos' : permitidas.includes(pedida) ? pedida : permitidas[0];

  const [productos, categorias, pendientes] = await Promise.all([listarProductosAdmin(), listarCategorias(), contarPendientes()]);
  return (
    <AdminPanel
      usuario={usuario}
      productos={productos}
      categorias={categorias}
      maxKB={maxImagenKB()}
      vistaInicial={vista}
      pedidoInicial={pedido}
      pendientes={pendientes}
    />
  );
}
