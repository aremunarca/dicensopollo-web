import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { usuarioActual } from '@/lib/auth';
import { leerIdPedido, numeroPedido } from '@/lib/admin-tipos';
import AdminLogin from '@/components/admin/AdminLogin';
import PedidoPantalla from '@/components/admin/PedidoPantalla';
import '../../admin.css';

type Props = PageProps<'/admin/pedidos/[id]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = leerIdPedido((await params).id);
  return { title: `${id ? `Pedido ${numeroPedido(id)}` : 'Pedido'} · Di Censo Pollo`, robots: { index: false, follow: false } };
}

/**
 * /admin/pedidos/12 (o /admin/pedidos/DC-000012) — pantalla de un pedido a página completa:
 * el enlace que llega en el mensaje de WhatsApp. Sin sesión pide usuario y contraseña.
 */
export default async function PedidoPage({ params }: Props) {
  await connection();
  const id = leerIdPedido((await params).id);
  if (!id) notFound();
  const usuario = await usuarioActual();
  if (!usuario) return <AdminLogin titulo={`Pedido ${numeroPedido(id)}`} />;
  return <PedidoPantalla id={id} usuario={usuario} />;
}
