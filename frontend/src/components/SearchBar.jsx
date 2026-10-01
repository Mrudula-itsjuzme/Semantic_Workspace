import React from 'react';
import { Search, Sparkles, Filter, Zap, Globe, HardDrive } from 'lucide-react';

export default function SearchBar({
  query,
  setQuery,
  searchMode,
  setSearchMode,
  minScore,
  setMinScore,
  onSearch,
  isLoading
}) {
  const sampleQueries = [
    "transformer self-attention efficiency",
    "graph neural networks for molecules",
    "retrieval augmented generation evaluation",
    "uncertainty estimation in LLMs"
  ];

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px' }}>
      {/* Search Input Box */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="glass-input"
            placeholder="Ask a natural language research question or search topics..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ width: '100%', paddingLeft: '48px', height: '52px', fontSize: '1rem' }}
          />
        </div>
        <button
          className="btn-primary"
          onClick={onSearch}
          disabled={isLoading || !query.trim()}
          style={{ height: '52px', padding: '0 28px', fontSize: '0.95rem' }}
        >
          {isLoading ? (
            <span>Computing Vectors...</span>
          ) : (
            <>
              <Sparkles size={18} />
              <span>Search</span>
            </>
          )}
        </button>
      </div>

      {/* Mode Selectors & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        {/* Search Mode Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Mode:
          </span>

          {[
            { id: 'hybrid', label: 'Hybrid RRF', icon: Zap, desc: 'Reciprocal Rank Fusion: FTS + pgvector' },
            { id: 'vector', label: 'Semantic Vector', icon: Sparkles, desc: 'pgvector Cosine Similarity' },
            { id: 'lexical', label: 'Lexical FTS', icon: HardDrive, desc: 'PostgreSQL Full-Text Search' },
            { id: 'live', label: 'OpenAlex Live', icon: Globe, desc: 'Live OpenAlex API Search' },
          ].map(m => {
            const Icon = m.icon;
            const isSelected = searchMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setSearchMode(m.id)}
                title={m.desc}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  background: isSelected ? '#eaf1ff' : '#ffffff',
                  color: isSelected ? '#124bb8' : 'var(--text-muted)',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <Icon size={14} color={isSelected ? '#155eef' : 'var(--text-muted)'} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Min Score Threshold Slider */}
        {searchMode === 'vector' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <Filter size={14} />
            <span>Min Similarity: <strong style={{ color: 'var(--text-main)' }}>{minScore}%</strong></span>
            <input
              type="range"
              min="0"
              max="90"
              step="5"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              style={{ accentColor: 'var(--primary)', cursor: 'pointer', width: '100px' }}
            />
          </div>
        )}
      </div>

      {/* Quick Prompt Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>Try asking:</span>
        {sampleQueries.map((q, idx) => (
          <button
            key={idx}
            onClick={() => { setQuery(q); }}
            style={{
              background: '#ffffff',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              padding: '4px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={(e) => e.target.style.borderColor = 'var(--primary)'}
            onMouseOut={(e) => e.target.style.borderColor = 'var(--border-color)'}
          >
            "{q}"
          </button>
        ))}
      </div>
    </div>
  );
}
