import React from 'react';
import { Database, Layers, Trash2, BookOpen, RefreshCw, CheckCircle2, Loader2, XCircle, Upload } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../api';

const STATUS_META = {
  pending: { label: 'Pending', color: '#f59e0b', icon: Loader2 },
  running: { label: 'Processing', color: '#3b82f6', icon: Loader2 },
  success: { label: 'Indexed', color: '#34d399', icon: CheckCircle2 },
  failed:  { label: 'Failed', color: '#ef4444', icon: XCircle },
};

export default function LibraryView({ papers, onInspectPaper, onDeletePaper, onRefresh }) {

  const handleUploadPdf = async (paper) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      try {
        await axios.post(apiUrl(`/api/ingestion/papers/${paper.id}/pdf`), form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        alert('PDF uploaded — ingestion queued. Refresh in a moment to see status.');
        onRefresh && onRefresh();
      } catch (err) {
        alert(err?.response?.data?.detail || 'PDF upload failed.');
      }
    };
    input.click();
  };

  const handleRetry = async (paper) => {
    try {
      await axios.post(apiUrl(`/api/ingestion/papers/${paper.id}/retry`));
      onRefresh && onRefresh();
    } catch {
      alert('Retry failed.');
    }
  };
  return (
    <div>
      {/* Header */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={20} color="var(--accent-cyan)" />
            Workspace Vector Library ({papers ? papers.length : 0} Papers Ingested)
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            All papers stored in PostgreSQL with 384-dimensional FastEmbed vector index.
          </p>
        </div>

        <button className="btn-secondary" onClick={onRefresh}>
          <RefreshCw size={14} />
          <span>Refresh Library</span>
        </button>
      </div>

      {/* Paper Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ background: '#f6f8fb', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '14px 20px' }}>Title & DOI</th>
              <th style={{ padding: '14px 20px' }}>Year</th>
              <th style={{ padding: '14px 20px' }}>Ingestion</th>
              <th style={{ padding: '14px 20px' }}>Vector Chunks</th>
              <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {papers && papers.map((paper) => (
              <tr
                key={paper.id}
                style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s ease' }}
                onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '14px 20px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer', marginBottom: '4px' }} onClick={() => onInspectPaper(paper)}>
                    {paper.title}
                  </div>
                  {paper.doi && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                      doi:{paper.doi}
                    </div>
                  )}
                </td>
                <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>
                  {paper.publication_year || 'N/A'}
                </td>
                <td style={{ padding: '14px 20px' }}>
                  {(() => {
                    const meta = STATUS_META[paper.ingestion_status] || STATUS_META.pending;
                    const Icon = meta.icon;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600, color: meta.color }}>
                          <Icon size={13} className={paper.ingestion_status === 'running' ? 'pulse-glow' : ''} />
                          {meta.label}
                        </span>
                        {paper.ingestion_error && (
                        <span style={{ fontSize: '0.7rem', color: '#b42318', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={paper.ingestion_error}>
                            {paper.ingestion_error}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td style={{ padding: '14px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '0.82rem', fontWeight: 600 }}>
                    <CheckCircle2 size={14} />
                    <span>{paper.chunk_count ?? '—'} Chunks</span>
                  </div>
                </td>
                <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => handleUploadPdf(paper)}
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      title="Upload PDF for full ingestion"
                    >
                      <Upload size={12} />
                      PDF
                    </button>
                    {paper.ingestion_status === 'failed' && (
                      <button
                        className="btn-secondary"
                        onClick={() => handleRetry(paper)}
                        style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#b42318' }}
                      >
                        <RefreshCw size={12} />
                        Retry
                      </button>
                    )}
                    <button
                      className="btn-secondary"
                      onClick={() => onInspectPaper(paper)}
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                      <BookOpen size={12} />
                      Inspect
                    </button>
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px' }}
                      onClick={() => onDeletePaper(paper.id)}
                      onMouseOver={(e) => e.target.style.color = '#ef4444'}
                      onMouseOut={(e) => e.target.style.color = 'var(--text-subtle)'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
