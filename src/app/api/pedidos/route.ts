import { error, json, manejar, readJson } from '@/lib/api';
import { registrarPedido } from '@/lib/pedidos';

/**
 * POST /api/pedidos — registra el pedido con los precios de la BD y devuelve el enlace de WhatsApp.
 * { items: [{ id, qty }], nombre, telefono, entrega, comuna?, direccion?, pago, notas? }
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return error('Cuerpo JSON inválido.');
  return manejar(async () => json(await registrarPedido(body), 201));
}
