'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';

/** Ingreso al panel con usuario y contraseña. Al entrar se recarga la página (que ya ve la sesión). */
export default function AdminLogin({ titulo = 'Panel administrativo' }: { titulo?: string }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setError('');
    const res = await fetch('/api/admin/sesion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, password }),
    }).catch(() => null);
    if (res?.ok) { window.location.reload(); return; }
    setError((await res?.json().catch(() => null))?.error ?? 'Sin conexión.');
    setEnviando(false);
  }

  return (
    <main className="adm-login">
      <form className="adm-caja" onSubmit={entrar}>
        <img className="adm-login__logo" src="/marca/logo.webp" alt="Di Censo Pollo" width={112} height={112} />
        <p className="adm-eyebrow">Di Censo Pollo</p>
        <h1>{titulo}</h1>
        <label className="adm-campo">
          Usuario
          <input className="adm-input" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username"
            autoCapitalize="none" spellCheck={false} autoFocus required maxLength={40} />
        </label>
        <label className="adm-campo">
          Contraseña
          <input className="adm-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="adm-error" role="alert">{error}</p>}
        <button className="btn btn-brasa ancho" disabled={enviando || !usuario || !password}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <p className="adm-login__pie"><Link href="/">Volver a la carta</Link></p>
      </form>
    </main>
  );
}
