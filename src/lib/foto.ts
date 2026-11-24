// Edición de fotos en el navegador (sin dependencias): encuadre cuadrado, zoom, rotación, espejo,
// brillo/contraste/saturación/calidez y compresión a JPEG. MySQL de XAMPP acepta paquetes de 1 MB,
// por eso cada foto se reduce hasta pesar menos de MAX_IMAGE_KB.

/** Lado de la foto final (las tarjetas de la carta son cuadradas o 4:3 con recorte al centro). */
export const LADO_FINAL = 1200;

export type Ajuste = 'llenar' | 'completa';
export type EstadoFoto = {
  /** 1 = la foto llena (o cabe completa en) el cuadro. */
  zoom: number;
  /** Desplazamiento del centro, en fracción del lado (−1 a 1). */
  dx: number;
  dy: number;
  /** Cuartos de vuelta (0–3). */
  rot: number;
  espejo: boolean;
  brillo: number;
  contraste: number;
  saturacion: number;
  calidez: number;
  ajuste: Ajuste;
  /** Color del fondo cuando la foto no llena el cuadro. */
  fondo: string;
};

export const ESTADO_INICIAL: EstadoFoto = {
  zoom: 1, dx: 0, dy: 0, rot: 0, espejo: false, brillo: 100, contraste: 100, saturacion: 100, calidez: 0, ajuste: 'llenar', fondo: '#ffffff',
};

/** Ajustes rápidos pensados para fotos de comida. */
export const FILTROS: { id: string; label: string; v: Pick<EstadoFoto, 'brillo' | 'contraste' | 'saturacion' | 'calidez'> }[] = [
  { id: 'original', label: 'Original', v: { brillo: 100, contraste: 100, saturacion: 100, calidez: 0 } },
  { id: 'realzar', label: 'Realzar', v: { brillo: 106, contraste: 112, saturacion: 125, calidez: 0 } },
  { id: 'calido', label: 'Cálido', v: { brillo: 104, contraste: 106, saturacion: 118, calidez: 18 } },
  { id: 'brillante', label: 'Luminoso', v: { brillo: 116, contraste: 104, saturacion: 110, calidez: 0 } },
  { id: 'brasa', label: 'Brasa', v: { brillo: 98, contraste: 122, saturacion: 135, calidez: 12 } },
];

export function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error('No se pudo abrir la imagen. Usa una foto JPG, PNG o WebP.'));
    img.src = src;
  });
}

/** Dibuja la foto en un lienzo cuadrado de `lado` px según el estado. */
export function dibujar(ctx: CanvasRenderingContext2D, img: HTMLImageElement, lado: number, e: EstadoFoto) {
  ctx.save();
  ctx.clearRect(0, 0, lado, lado);
  ctx.fillStyle = e.fondo;
  ctx.fillRect(0, 0, lado, lado);
  ctx.filter = `brightness(${e.brillo}%) contrast(${e.contraste}%) saturate(${e.saturacion}%) sepia(${e.calidez}%)`;
  ctx.imageSmoothingQuality = 'high';
  const girada = e.rot % 2 === 1;
  const w = girada ? img.naturalHeight : img.naturalWidth;
  const h = girada ? img.naturalWidth : img.naturalHeight;
  const base = e.ajuste === 'llenar' ? Math.max(lado / w, lado / h) : Math.min(lado / w, lado / h);
  const s = base * e.zoom;
  ctx.translate(lado / 2 + e.dx * lado, lado / 2 + e.dy * lado);
  ctx.rotate((e.rot * Math.PI) / 2);
  ctx.scale(e.espejo ? -s : s, s);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();
}

/** Genera el JPEG final (LADO_FINAL px) y baja la calidad hasta pesar menos de maxKB. */
export async function exportar(img: HTMLImageElement, e: EstadoFoto, maxKB: number): Promise<{ blob: Blob; url: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LADO_FINAL;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador no permite editar fotos.');
  dibujar(ctx, img, LADO_FINAL, e);
  for (let q = 0.9; q >= 0.4; q -= 0.08) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= maxKB * 1024) return { blob, url: URL.createObjectURL(blob) };
  }
  throw new Error(`No se pudo reducir la foto a menos de ${maxKB} KB. Prueba con otra.`);
}

/** Foto lista sin pasar por el editor: cuadrada, centrada y con el ajuste "Realzar" (para las fotos en lote). */
export async function procesarAuto(archivo: File, maxKB: number, realzar = true) {
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) throw new Error('La foto debe ser JPG, PNG o WebP.');
  const url = URL.createObjectURL(archivo);
  try {
    const img = await cargarImagen(url);
    return await exportar(img, { ...ESTADO_INICIAL, ...(realzar ? FILTROS[1].v : {}) }, maxKB);
  } finally {
    URL.revokeObjectURL(url);
  }
}
