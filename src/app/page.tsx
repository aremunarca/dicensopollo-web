import { connection } from 'next/server';
import { listarCarta } from '@/lib/catalogo';
import { listarSucursalesPublicas } from '@/lib/sucursales';
import Tienda from '@/components/tienda/Tienda';

// La carta se lee de MySQL en cada visita: los cambios del panel se ven al recargar.
export default async function Page() {
  await connection();
  const [productos, sucursales] = await Promise.all([listarCarta(), listarSucursalesPublicas()]);
  return <Tienda productos={productos} sucursales={sucursales} />;
}
