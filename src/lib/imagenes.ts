// Validación de fotos por su contenido real (no por la extensión) y lectura de sus medidas.
// Sin dependencias para poder usarlo también en el seed.

export const maxImagenKB = () => {
  const n = Number(process.env.MAX_IMAGE_KB);
  return Number.isFinite(n) && n >= 50 ? Math.floor(n) : 900;
};

function tipo(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

function medidas(b: Uint8Array, mime: string): { ancho: number; alto: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (mime === 'image/png') return { ancho: v.getUint32(16), alto: v.getUint32(20) };
    if (mime === 'image/webp') {
      const fmt = String.fromCharCode(...b.slice(12, 16));
      if (fmt === 'VP8X') return { ancho: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), alto: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      if (fmt === 'VP8 ') return { ancho: v.getUint16(26, true) & 0x3fff, alto: v.getUint16(28, true) & 0x3fff };
      if (fmt === 'VP8L') { const x = v.getUint32(21, true); return { ancho: (x & 0x3fff) + 1, alto: ((x >> 14) & 0x3fff) + 1 }; }
      return null;
    }
    // JPEG: busca el marcador SOFn
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { alto: v.getUint16(i + 5), ancho: v.getUint16(i + 7) };
      i += 2 + v.getUint16(i + 2);
    }
  } catch { /* archivo incompleto */ }
  return null;
}

export type ImagenValida = { mime: string; datos: Uint8Array<ArrayBuffer>; bytes: number; ancho: number | null; alto: number | null };

/** Devuelve la imagen validada o un mensaje de error. */
export function validarImagen(datos: Uint8Array<ArrayBuffer>): ImagenValida | string {
  if (!datos.length) return 'La foto está vacía.';
  const max = maxImagenKB();
  if (datos.length > max * 1024) return `La foto pesa ${Math.round(datos.length / 1024)} KB; el máximo es ${max} KB.`;
  const mime = tipo(datos);
  if (!mime) return 'La foto debe ser JPG, PNG o WebP.';
  const m = medidas(datos, mime);
  return { mime, datos, bytes: datos.length, ancho: m?.ancho ?? null, alto: m?.alto ?? null };
}
