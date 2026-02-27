import React, { useMemo, useState } from 'react';
import { pdfUrlForRemito, searchRemitosByNumero, searchRemitosByNv } from './api.js';

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
  const [mode, setMode] = useState('nv'); // remito | nv
  const [empresa, setEmpresa] = useState('portones'); // portones | ipanel
  const [lastNv, setLastNv] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [logoShake, setLogoShake] = useState(null); // 'portones' | 'ipanel' | null

  const canSearch = useMemo(() => String(numero).trim().length > 0, [numero]);

  async function onSearch(e) {
    e.preventDefault();
    // Animación del logo al buscar (según empresa seleccionada)
    setLogoShake(empresa);
    window.setTimeout(() => setLogoShake(null), 420);

    setError('');
    setResults([]);

    const n = Number(numero);
    if (!Number.isFinite(n)) {
      setError('Ingresá un número válido.');
      return;
    }

    if (mode === 'nv') setLastNv(Math.trunc(n)); else setLastNv(null);

    setLoading(true);
    try {
      const data = mode === 'nv'
        ? await searchRemitosByNv(Math.trunc(n), empresa)
        : await searchRemitosByNumero(Math.trunc(n), empresa);

      setResults(data.items || []);
      if (!data.items || data.items.length === 0) {
        if (mode === 'nv') {
          window.alert('La NV ingresada no tiene remito aún.');
          setError('');
        } else {
          setError('No se encontraron remitos con ese número.');
        }
      }
    } catch (err) {
      const msg = err?.message || 'Error';
      if (mode === 'nv' && String(msg).toLowerCase().includes('no tiene remito')) {
        window.alert('La NV ingresada no tiene remito aún.');
        setError('');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function openPdf(r) {
    const url = pdfUrlForRemito({ tipo: r.tipo, sucursal: r.sucursal, numero: r.numero, empresa, nv: (mode === 'nv' ? lastNv : null) });
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function pickEmpresa(next) {
    setEmpresa(next);
    setLastNv(null);
    setResults([]);
    setError('');
  }

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <button
            type="button"
            className={`logo-btn ${empresa === 'portones' ? 'active' : ''}`}
            onClick={() => pickEmpresa('portones')}
            title="De Grandis Portones"
          >
            <img
              className={`logo ${logoShake === 'portones' ? 'shake' : ''}`}
              src="/logo.ico"
              alt="De Grandis Portones"
            />
          </button>

          <button
            type="button"
            className={`logo-btn ${empresa === 'ipanel' ? 'active' : ''}`}
            onClick={() => pickEmpresa('ipanel')}
            title="IPANELS"
          >
            <img
              className={`logo ${logoShake === 'ipanel' ? 'shake' : ''}`}
              src="/logoipanel.png"
              alt="IPANELS"
            />
          </button>

          <div className="brand-text">
            <h1>Imprimir remito</h1>
          </div>
        </div>
      </header>

      <form className="card" onSubmit={onSearch}>
        <div className="mode">
          <label>
            <input
              type="radio"
              name="mode"
              value="nv"
              checked={mode === 'nv'}
              onChange={() => { setMode('nv'); setLastNv(null); setResults([]); setError(''); }}
            />
            NV
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="remito"
              checked={mode === 'remito'}
              onChange={() => { setMode('remito'); setLastNv(null); setResults([]); setError(''); }}
            />
            Remito
          </label>
        </div>

        <label className="label">
          {mode === 'nv' ? 'Número de NV' : 'Número de remito'}
          <input
            className="input"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder={mode === 'nv' ? 'Ej: 1234' : 'Ej: 670'}
            inputMode="numeric"
          />
        </label>
        <div className="row">
          <button className="btn" disabled={!canSearch || loading} type="submit">
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => { setNumero(''); setLastNv(null); setResults([]); setError(''); }}>
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

    </div>
  );
}
