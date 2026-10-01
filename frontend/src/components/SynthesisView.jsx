import React, { useState } from 'react';
import { Cpu, Sparkles, Trash2, CheckCircle2, FileText, ArrowRight } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../api';

export default function SynthesisView({ selectedPapers, onRemovePaper, onInspectPaper }) {
  const [synthesisResult, setSynthesisResult] = useState(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const handleSynthesize = async () => {
    if (!selectedPapers || selectedPapers.length === 0) return;
    const pids = selectedPapers.map(p => p.id || p.paper_id).filter(Boolean);
    if (pids.length === 0) {
      alert(
        "None of the selected papers are in your library yet. " +
        "Import them from the live results first (Ingest to Vector DB), then compare."
      );
      return;
    }
    setIsSynthesizing(true);
    try {
      const res = await axios.post(apiUrl('/api/ai/synthesize'), { paper_ids: pids });
      setSynthesisResult(res.data);
    } catch (err) {
      console.error("Synthesis error:", err);
      alert("Failed to synthesize selected papers. Ensure backend is running.");
    } finally {
      setIsSynthesizing(false);
    }
  };

  if (!selectedPapers || selectedPapers.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Cpu size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
        <h3>Synthesis Matrix Empty</h3>
        <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>
          Select "Compare" on paper cards in the Search Explorer to build a side-by-side comparison matrix.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Matrix Controls */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={20} color="var(--accent-purple)" />
            Multi-Paper Synthesis Matrix ({selectedPapers.length} Selected)
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Compare methodologies, key focus areas, and vector similarities side by side.
          </p>
        </div>

        <button
          className="btn-primary"
          onClick={handleSynthesize}
          disabled={isSynthesizing}
          style={{ background: 'linear-gradient(135deg, var(--accent-purple), #6366f1)' }}
        >
          <Sparkles size={16} />
          <span>{isSynthesizing ? 'Synthesizing...' : 'Generate AI Synthesis'}</span>
        </button>
      </div>

      {/* Generated AI Executive Summary Banner */}
      {synthesisResult && (
        <div className="glass-panel animate-fade-in" style={{ padding: '24px', marginBottom: '28px', borderLeft: '4px solid var(--accent-purple)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--accent-purple)" />
            Executive Synthesis Overview
          </h3>
          <p style={{ fontSize: '0.92rem', color: '#334155', marginBottom: '14px', lineHeight: 1.6 }}>
            {synthesisResult.executive_summary}
          </p>

          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
            Key Comparative Insights:
          </h4>
          <ul style={{ paddingLeft: '20px', fontSize: '0.88rem', color: '#475569' }}>
            {synthesisResult.key_insights.map((insight, i) => (
              <li key={i} style={{ marginBottom: '6px' }}>{insight}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Side-by-Side Comparison Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(selectedPapers.length, 3)}, 1fr)`, gap: '20px' }}>
        {selectedPapers.map((paper) => (
          <div key={paper.id || paper.doi || paper.title} className="glass-panel animate-fade-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}>
                  {paper.publication_year || 'Year N/A'}
                </span>

                <button
                  onClick={() => onRemovePaper(paper)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px' }}
                  onMouseOver={(e) => e.target.style.color = '#ef4444'}
                  onMouseOut={(e) => e.target.style.color = 'var(--text-subtle)'}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Title */}
              <h4
                onClick={() => onInspectPaper(paper)}
                style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '10px', cursor: 'pointer', lineHeight: 1.35 }}
              >
                {paper.title}
              </h4>

              {/* Abstract snippet */}
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '16px' }}>
                {paper.abstract ? (paper.abstract.length > 200 ? paper.abstract.slice(0, 200) + '...' : paper.abstract) : 'No abstract preview.'}
              </p>
            </div>

            <button
              className="btn-secondary"
              onClick={() => onInspectPaper(paper)}
              style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}
            >
              <span>Inspect Chunks</span>
              <ArrowRight size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
