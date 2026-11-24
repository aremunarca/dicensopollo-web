import { connection } from 'next/server';
import { listarCarta } from '@/lib/catalogo';
import Tienda from '@/components/tienda/Tienda';

// La carta se lee de MySQL en cada visita: los cambios del panel se ven al recargar.
export default async function Page() {
  await connection();
  const productos = await listarCarta();
  return <Tienda productos={productos} />;
}
