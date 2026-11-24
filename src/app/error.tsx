'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="error-pag">
      <img src="/marca/logo.webp" alt="" width={120} height={120} />
      <p className="eyebrow">Di Censo Pollo</p>
      <h1>No pudimos cargar la carta</h1>
      <p>Intenta de nuevo en unos segundos o pide directo por WhatsApp.</p>
      <div className="hero__cta">
        <button className="btn btn-fuego" onClick={reset}>Reintentar</button>
        <a className="btn btn-wa" href="https://wa.me/56929163138" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      </div>
    </main>
  );
}
