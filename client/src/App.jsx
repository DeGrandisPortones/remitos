import React, { useMemo, useState } from 'react';
import { pdfUrlForRemito, searchRemitosByNumero } from './api.js';

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('es-AR');
}

function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export default function App() {
  const [numero, setNumero] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);

  const canSearch = useMemo(() => String(numero).trim().length > 0, [numero]);

  async function onSearch(e) {
    e.preventDefault();
    setError('');
    setResults([]);

    const n = Number(numero);
    if (!Number.isFinite(n)) {
      setError('Ingresá un número válido.');
      return;
    }

    setLoading(true);
    try {
      const data = await searchRemitosByNumero(Math.trunc(n));
      setResults(data.items || []);
      if (!data.items || data.items.length === 0) setError('No se encontraron remitos con ese número.');
    } catch (err) {
      setError(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  function openPdf(r) {
    const url = pdfUrlForRemito({ tipo: r.tipo, sucursal: r.sucursal, numero: r.numero });
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Imprimir remito</h1>
        <p>Ingresá el <b>número</b>. Si hay más de un resultado (por tipo/sucursal), elegí cuál imprimir.</p>
      </header>

      <form className="card" onSubmit={onSearch}>
        <label className="label">
          Número de remito
          <input
            className="input"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Ej: 670"
            inputMode="numeric"
          />
        </label>
        <div className="row">
          <button className="btn" disabled={!canSearch || loading} type="submit">
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => { setNumero(''); setResults([]); setError(''); }}>
            Limpiar
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </form>

      {results.length > 0 && (
        <section className="card">
          <div className="card-title">
            Resultados <Badge>{results.length}</Badge>
          </div>

          <div className="table">
            <div className="t-head">
              <div>Fecha</div>
              <div>Tipo</div>
              <div>Suc</div>
              <div>Nro</div>
              <div>Cliente</div>
              <div>Estado</div>
              <div></div>
            </div>

            {results.map((r, idx) => (
              <div className="t-row" key={`${r.tipo}-${r.sucursal}-${r.numero}-${idx}`}>
                <div>{fmtDate(r.fecha)}</div>
                <div>{r.tipo}</div>
                <div>{r.sucursal}</div>
                <div>{r.numero}</div>
                <div className="muted">
                  <div><b>{r.cliente}</b> — {r.nombre}</div>
                  <div className="small">{r.localidad} ({r.provincia})</div>
                </div>
                <div>
                  {r.anulado ? <Badge tone="danger">ANULADO</Badge> : <Badge tone="ok">OK</Badge>}
                  {r.pendiente ? <span style={{ marginLeft: 6 }}><Badge tone="warn">PEND</Badge></span> : null}
                </div>
                <div className="right">
                  <button className="btn btn-small" onClick={() => openPdf(r)} type="button">
                    PDF
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hint">
            Tip: el PDF se abre en una pestaña nueva. Desde ahí podés imprimir.
          </div>
        </section>
      )}

      <footer className="footer">
        <span className="small muted">Servidor: <code>/api</code> (Express) · Front: React + Vite</span>
      </footer>
    </div>
  );
}
