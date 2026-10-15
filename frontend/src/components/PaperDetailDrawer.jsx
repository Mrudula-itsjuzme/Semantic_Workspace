import React, { useState } from 'react';
import { X, Layers, Copy, Check } from 'lucide-react';

export default function PaperDetailDrawer({ paper, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!paper) return null;

  const generateBibtex = () => {
    const key = (paper.title || 'paper').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) + (paper.publication_year || '2026');
    return `@article{${key},
  title={${paper.title}},
  year={${paper.publication_year || 'N/A'}},
  venue={${paper.venue || 'N/A'}},
  doi={${paper.doi || 'N/A'}}
}`;
  };

  const handleCopyBibtex = () => {
    const bibtex = generateBibtex();
    const write = navigator.clipboard && window.document.hasFocus()
      ? navigator.clipboard.writeText(bibtex)
      : Promise.reject(new Error('clipboard unavailable'));
    write.then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback: legacy textarea copy so the button still works
      try {
        const ta = document.createElement('textarea');
        ta.value = bibtex;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        alert('Copy failed — select the BibTeX text manually.');
      }
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: '540px',
      maxWidth: '90vw',
      background: '#ffffff',
      backdropFilter: 'blur(20px)',
      borderLeft: '1px solid var(--border-color)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-10px 0 32px rgba(15, 32, 61, 0.16)',
      animation: 'fadeIn 0.25s ease-out'
    }}>
      {/* Drawer Header */}
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#eaf1ff', color: '#124bb8' }}>
              ID: {paper.id || 'N/A'}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
              {paper.source || 'Local DB'}
            </span>
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.3 }}>
            {paper.title}
          </h2>
        </div>

        <button
          onClick={onClose}
          style={{ background: '#f1f5f9', border: 'none', color: 'var(--text-muted)', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Drawer Body Scroll */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {/* Publication Info Metadata */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', display: 'block' }}>Publication Year</span>
            <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>{paper.publication_year || 'N/A'}</strong>
          </div>
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', display: 'block' }}>Venue</span>
            <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>{paper.venue || 'ArXiv / Standard'}</strong>
          </div>
        </div>

        {/* Abstract */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
            Full Abstract
          </h3>
          <p style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.6, background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            {paper.abstract || 'No abstract text available for this entry.'}
          </p>
        </div>

        {/* Vector Chunks Explorer */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={15} />
            Vector Chunks Index ({paper.chunks ? paper.chunks.length : 0} Chunks)
          </h3>

          {paper.chunks && paper.chunks.length > 0 ? (
            paper.chunks.map((chunk, i) => (
              <div key={i} style={{ background: '#ffffff', border: '1px solid var(--border-color)', padding: '14px', borderRadius: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span>Chunk #{chunk.chunk_index !== undefined ? chunk.chunk_index : i}</span>
                  {chunk.score && (
                    <span style={{ color: '#34d399', fontWeight: 700 }}>{chunk.score}% Vector Score</span>
                  )}
                </div>
                <p style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                  "{chunk.content}"
                </p>
              </div>
            ))
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-subtle)' }}>No chunk details retrieved.</p>
          )}
        </div>

        {/* BibTeX Export Box */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              BibTeX Citation
            </h3>
            <button
              onClick={handleCopyBibtex}
              style={{ background: 'none', border: 'none', color: copied ? '#34d399' : 'var(--accent-cyan)', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? 'Copied!' : 'Copy BibTeX'}</span>
            </button>
          </div>
          <pre style={{ background: 'rgba(5, 8, 15, 0.8)', padding: '12px', borderRadius: '10px', fontSize: '0.78rem', color: '#a5b4fc', fontFamily: 'var(--font-code)', overflowX: 'auto' }}>
            {generateBibtex()}
          </pre>
        </div>
      </div>
    </div>
  );
}
