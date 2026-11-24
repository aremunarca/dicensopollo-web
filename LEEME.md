# Di Censo Pollo — carta online y panel

Carta online con pedidos por WhatsApp para **Di Censo Pollo** (Av. Aviador Bleriot 2241, Quinta Normal),
con un panel administrativo igual al de los otros sitios. Usa Next.js 16, Prisma 7 y el MySQL/MariaDB de XAMPP.

## Puesta en marcha

```bash
npm install
cp .env.example .env          # completa ADMIN_PASSWORD y ADMIN_SESSION_SECRET
# crea la base "dicenso" (utf8mb4) en phpMyAdmin o con:
#   mysql -uroot -e "CREATE DATABASE dicenso CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
npm run db:deploy             # crea las tablas
npm run db:seed               # carga la carta (18 productos, 49 opciones con precio)
npm run dev                   # http://localhost:3700 (PORT en .env)
```

Panel: `/admin`. La primera vez entra con `ADMIN_USER` / `ADMIN_PASSWORD` del `.env` (se crea el gerente inicial).

## La carta (diseño "a la brasa")

- Portada con el lema, foto del pollo con anillo giratorio y el precio del pollo entero tomado de la BD.
- **Los favoritos** (productos marcados como favoritos) y **la carta** por secciones, con buscador y pestañas fijas.
- En cada tarjeta se elige la opción (tamaño, relleno, promo…) y la cantidad, y se agrega sin abrir ventanas.
- El pedido se arma como una **comanda de cocina** (ticket). Al enviarla se registra en el panel con número
  `DC-000123` y se abre WhatsApp con el detalle y el total. Los productos **agotados hoy** se ven pero no se pueden pedir.

## Panel administrativo (/admin)

| Sección | Quién | Qué hace |
|---|---|---|
| Pedidos | Gerente y Despacho | Pendiente → En preparación → Entregado (o Cancelado con motivo), comentarios, enlace a WhatsApp y al mapa. Se actualiza solo cada 30 s. |
| Carta y precios | Gerente y Despacho | Lista con filtros (en la carta, agotados, ocultos, sin foto). **Clic en la foto** = editarla. Interruptor **Agotado hoy**. **$ Rápida** = edición rápida de precios, opciones visibles, favorito y visibilidad. **Editar** = producto completo con sus opciones. |
| Carga masiva | Gerente y Despacho | Excel/CSV con vista previa antes de aplicar (crear, actualizar o ambos). **Fotos en lote**: arrastra muchas fotos; se asignan solas si el archivo se llama como el producto (`pollo-asado.jpg`) o su código (`AREPAS-QUESO.png`). |
| Ventas y estadísticas | Gerente | Ventas por día, horas con más pedidos, delivery vs. retiro, más vendidos, categorías, comunas. |
| Usuarios | Gerente | Crear usuarios, roles, contraseñas, activar/desactivar. |

**Editor de fotos** (en el navegador, sin programas): encuadre cuadrado arrastrando, zoom, girar, espejo,
"llenar cuadro" o "foto completa" con color de fondo, filtros para comida (Realzar, Cálido, Luminoso, Brasa)
y brillo/contraste/saturación/calidez. Guarda un JPEG de 1200 px por debajo de `MAX_IMAGE_KB`.

## Datos iniciales (seed)

`prisma/seed-data/carta.json` se generó desde https://dicensopollo.com con:

```bash
npm run catalogo:extraer
```

El script lee la API pública de WooCommerce, entra a cada producto y a cada variación para tomar las
opciones y su precio, y guarda las fotos en `public/productos/` (WebP de 800 px). Lo que WooCommerce no
tenía (categorías, orden, favoritos, nombres corregidos como "Empandas" → "Empanadas", descripciones limpias)
está definido en `CARTA` dentro de `scripts/extraer-woocommerce.ts`.

El seed es idempotente: crea lo que falta y solo actualiza precios; no pisa lo editado en el panel.

**Pendiente de completar en el panel:** qué incluye cada **Promo 2 a 5** (el sitio solo describe la Promo 1)
y confirmar las formas de pago en `src/lib/config.ts` (`pagos`).

## Estructura

- `src/lib/config.ts` — datos del local (WhatsApp, dirección, redes, formas de pago y entrega).
- `src/lib/catalogo.ts` — carta pública y alta/edición de productos con sus opciones.
- `src/lib/pedidos.ts` — registro del pedido, mensaje de WhatsApp y gestión en el panel.
- `src/lib/carga-masiva.ts` — Excel/CSV y plantillas. `src/lib/foto.ts` — edición de fotos en el navegador.
- `src/components/tienda/` — la carta. `src/components/admin/` — el panel.
