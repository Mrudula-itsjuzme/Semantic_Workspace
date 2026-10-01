import React from 'react';
import { ExternalLink, Layers, PlusCircle, CheckCircle2, BookOpen, Quote } from 'lucide-react';

export default function PaperCard({
  paper,
  onInspect,
  onIngest,
  isSelectedForSynthesis,
  onToggleSynthesis,
  isIngesting
}) {
  const getBadgeClass = (score) => {
    if (score >= 80) return 'badge-score-high';
    return 'badge-score-medium';
  };

  // Show the ingest action for live catalogue results that aren't in the
  // library yet. Backend sends source "openalex"; some UI flows use
  // "OpenAlex Live". Local/hybrid results already have numeric ids.
  const isLiveResult =
    (paper.source === 'openalex' || paper.source === 'OpenAlex Live') &&
    !paper.id;

  return (
    <div className="glass-panel animate-fade-in" style={{ padding: '22px', marginBottom: '18px', position: 'relative' }}>
      {/* Top Header Row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
            {/* Match Score Badge */}
            <span className={`badge-score-high ${getBadgeClass(paper.score || 0)}`} style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700 }}>
              {paper.score ? `${paper.score}% Match` : 'Result'}
            </span>

            {/* Source Tag */}
            <span className="paper-source-tag">
              {paper.source === 'openalex' ? 'OpenAlex Live' : (paper.source || 'Database')}
            </span>

            {/* Year */}
            {paper.publication_year && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', fontWeight: 600 }}>
                {paper.publication_year}
              </span>
            )}
          </div>

          {/* Title */}
          <h3
            onClick={() => onInspect(paper)}
            style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              color: 'var(--text-main)',
              cursor: 'pointer',
              lineHeight: 1.35,
              transition: 'color 0.2s ease'
            }}
            onMouseOver={(e) => e.target.style.color = 'var(--accent-cyan)'}
            onMouseOut={(e) => e.target.style.color = 'var(--text-main)'}
          >
            {paper.title}
          </h3>
        </div>

        {/* Action Checkbox & Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Select for Synthesis */}
          <button
            onClick={() => onToggleSynthesis(paper)}
            title={isSelectedForSynthesis ? "Remove from Synthesis Matrix" : "Add to Synthesis Matrix"}
            style={{
              background: isSelectedForSynthesis ? '#eaf1ff' : '#ffffff',
              border: isSelectedForSynthesis ? '1px solid var(--primary)' : '1px solid var(--border-color)',
              color: isSelectedForSynthesis ? '#155eef' : 'var(--text-muted)',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            {isSelectedForSynthesis ? <CheckCircle2 size={14} color="#6366f1" /> : <PlusCircle size={14} />}
            <span>{isSelectedForSynthesis ? 'Selected' : 'Compare'}</span>
          </button>
        </div>
      </div>

      {/* Snippet / Matching Chunk Highlight */}
      {paper.matching_snippet && (
        <div style={{
          background: '#f6f8fb',
          borderLeft: '3px solid var(--accent-cyan)',
          padding: '12px 14px',
          borderRadius: '0 8px 8px 0',
          marginBottom: '14px',
          fontSize: '0.88rem',
          color: '#334155',
          fontStyle: 'italic'
        }}>
          <Quote size={14} style={{ color: 'var(--accent-cyan)', marginRight: '6px', opacity: 0.7 }} />
          "{paper.matching_snippet.length > 280 ? paper.matching_snippet.slice(0, 280) + '...' : paper.matching_snippet}"
        </div>
      )}

      {/* Abstract fallback if no snippet */}
      {!paper.matching_snippet && paper.abstract && (
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
          {paper.abstract.length > 240 ? paper.abstract.slice(0, 240) + '...' : paper.abstract}
        </p>
      )}

      {/* Card Footer Actions */}
      <div className="paper-card-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
        {/* Authors */}
        <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Authors:</span>
          <span style={{ color: 'var(--text-muted)' }}>
            {paper.authors && paper.authors.length > 0
              ? paper.authors.map(a => a.name).slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' et al.' : '')
              : 'Unknown / Indexed'}
          </span>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* DOI / External link */}
          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.78rem',
                color: 'var(--accent-cyan)',
                textDecoration: 'none'
              }}
            >
              DOI <ExternalLink size={12} />
            </a>
          )}

          {/* Ingest to Local Vector DB button (for live search results) */}
          {isLiveResult && (
            <button
              className="btn-secondary"
              onClick={() => onIngest(paper)}
              disabled={isIngesting}
              style={{ fontSize: '0.78rem', padding: '5px 12px', background: '#ecfeff', borderColor: '#a5f3fc', color: '#0e7490' }}
            >
              <Layers size={13} />
              <span>{isIngesting ? 'Vectorizing...' : 'Ingest to Vector DB'}</span>
            </button>
          )}

          {/* Inspect Chunks Button */}
          <button
            className="btn-secondary"
            onClick={() => onInspect(paper)}
            style={{ fontSize: '0.78rem', padding: '5px 12px' }}
          >
            <BookOpen size={13} />
            <span>Inspect Vectors</span>
          </button>
        </div>
      </div>
    </div>
  );
}
