import React, { useEffect, useState } from 'react';
import { Network, RefreshCw, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../api';

export default function GraphExplorer({ onInspectPaper }) {
  const [graph, setGraph] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadGraph = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(apiUrl('/graph/snapshot'), { params: { limit: 120 } });
      setGraph(res.data);
    } catch (err) {
      const status = err?.response?.status;
      setError(
        status === 503
          ? 'Neo4j is not configured. Set NEO4J_URI in your environment to enable the graph layer.'
          : 'Graph service unavailable. Is the backend running?'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGraph(); }, []);

  if (loading && !graph) {
    return (
      <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={36} className="pulse-glow" />
        <p style={{ marginTop: '12px' }}>Loading knowledge graph…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <AlertTriangle size={40} style={{ opacity: 0.4, marginBottom: '12px' }} />
        <h3>Graph Unavailable</h3>
        <p style={{ fontSize: '0.88rem', marginTop: '8px' }}>{error}</p>
        <button className="btn-secondary" onClick={loadGraph} style={{ marginTop: '16px' }}>Retry</button>
      </div>
    );
  }

  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];

  if (nodes.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Network size={40} style={{ opacity: 0.3, marginBottom: '14px' }} />
        <h3>Knowledge Graph Empty</h3>
        <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>
          Papers, authors and citations appear here after ingestion syncs to Neo4j.
        </p>
      </div>
    );
  }

  // Simple circular layout
  const positioned = nodes.map((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    return {
      ...n,
      cx: 350 + Math.cos(angle) * 180,
      cy: 260 + Math.sin(angle) * 180,
    };
  });
  const posById = Object.fromEntries(positioned.map(n => [n.id, n]));

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Network size={20} color="var(--accent-cyan)" /> Knowledge Graph
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {nodes.length} papers · {edges.length} edges (CITES / AUTHORED) — live from Neo4j
          </p>
        </div>
        <button className="btn-secondary" onClick={loadGraph} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ background: '#f8fafc', borderRadius: '14px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <svg width="100%" height="520" viewBox="0 0 700 520">
          {edges.map((e, i) => {
            const a = posById[e.source];
            const b = posById[e.target];
            if (!a || !b) return null;
            return (
              <line
                key={i}
                x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
                stroke={e.type === 'CITES' ? 'rgba(5, 150, 105, 0.35)' : 'rgba(99, 102, 241, 0.32)'}
                strokeWidth={e.type === 'CITES' ? 1.4 : 1}
              />
            );
          })}
          {positioned.map(n => (
            <g
              key={n.id}
              onClick={() => onInspectPaper && onInspectPaper({ id: n.id, title: n.title, publication_year: n.year })}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={n.cx} cy={n.cy} r={14} fill="#e8f5ef" stroke="#15966b" strokeWidth={1.6} />
              <text x={n.cx} y={n.cy + 3.5} textAnchor="middle" fill="#14532d" fontSize="8.5" fontWeight="bold">
                {n.id}
              </text>
              <text x={n.cx} y={n.cy + 26} textAnchor="middle" fill="#475569" fontSize="9.5">
                {(n.title || '').slice(0, 22)}{(n.title || '').length > 22 ? '…' : ''}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: '18px', marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <span><span style={{ color: '#34d399' }}>—</span> CITES</span>
        <span><span style={{ color: '#a5b4fc' }}>—</span> AUTHORED (paper–paper shared authors collapsed)</span>
      </div>
    </div>
  );
}
