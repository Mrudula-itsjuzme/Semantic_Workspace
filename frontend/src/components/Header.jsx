import React, { useState } from 'react';
import { Sparkles, Search, ChevronDown, FlaskConical, Pencil, Check, Plus, Send } from 'lucide-react';

export default function Header({
  projects,
  selectedProject,
  setSelectedProject,
  onSelectProject,
  onCreateProject,
  query,
  setQuery,
  onSearch,
  onAskAi,
  onToggleCopilot,
  copilotOpen,
  stats,
}) {
  const [askQuery, setAskQuery] = useState('');
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(selectedProject);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') onSearch();
  };

  const handleAskKeyDown = (e) => {
    if (e.key === 'Enter' && askQuery.trim()) {
      onAskAi(askQuery.trim());
      setAskQuery('');
    }
  };

  const submitAssistantQuestion = () => {
    if (!askQuery.trim()) return;
    onAskAi(askQuery.trim());
    setAskQuery('');
  };

  return (
    <header className="app-header" style={{
      background: '#fffefa',
      borderBottom: '1px solid var(--border-color)',
      zIndex: 30,
      flexShrink: 0,
    }}>
      <div className="app-header__inner" style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexShrink: 0 }}>
          <div className="brand-mark" style={{
            width: '30px', height: '30px', borderRadius: '8px',
            background: '#d98669',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 3px 10px rgba(217,134,105,0.22)'
          }}>
            <FlaskConical size={16} color="#ffffff" />
          </div>
          <div>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', fontWeight: 600, color: '#192638', letterSpacing: '-0.025em', display: 'block', lineHeight: 1.1 }}>
              Semantic Research
            </span>
          </div>
        </div>

        <div className="header-divider" style={{ width: '1px', height: '28px', background: 'var(--border-color)', flexShrink: 0 }} />

        {/* Project Selector — renameable, persisted in localStorage by App */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {renaming ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSelectedProject(renameValue.trim() || selectedProject);
                    setRenaming(false);
                  } else if (e.key === 'Escape') setRenaming(false);
                }}
                style={{
                  border: '1px solid #93c5fd', borderRadius: 'var(--radius-md)',
                  padding: '6px 10px', fontSize: '0.84rem', fontWeight: 700, color: '#0f172a',
                  outline: 'none', width: '180px'
                }}
              />
              <button
                onClick={() => { setSelectedProject(renameValue.trim() || selectedProject); setRenaming(false); }}
                style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex' }}
              >
                <Check size={13} color="#2563eb" />
              </button>
            </div>
          ) : (
          <button className="project-switcher"
            onClick={() => setShowProjectMenu(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: '#fffefa', border: '1px solid #e6e0d7',
              borderRadius: 'var(--radius-md)', padding: '6px 12px',
              cursor: 'pointer', transition: 'all 0.15s ease'
            }}
          >
              <span style={{ fontSize: '0.84rem', fontWeight: 650, color: '#192638', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedProject}
            </span>
            <Pencil
              size={11}
              color="#94a3b8"
              onClick={(e) => { e.stopPropagation(); setRenameValue(selectedProject); setRenaming(true); }}
              style={{ cursor: 'pointer' }}
            />
            <ChevronDown size={13} color="#64748b" />
          </button>
          )}

          {showProjectMenu && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
              background: '#ffffff', border: '1px solid #e2e8f0',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
              minWidth: '220px', overflow: 'hidden'
            }}>
              {(projects || []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onSelectProject(p.id); setRenameValue(p.name); setShowProjectMenu(false); }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '9px 14px',
                    background: p.name === selectedProject ? '#f7e8df' : '#fffefa',
                    color: p.name === selectedProject ? '#774735' : '#192638',
                    border: 'none', cursor: 'pointer', fontSize: '0.84rem',
                    fontWeight: p.name === selectedProject ? 700 : 500,
                    borderBottom: '1px solid #f1f5f9'
                  }}
                >
                  {p.name}
                </button>
              ))}
              <button className="project-menu-create" onClick={() => { onCreateProject(); setShowProjectMenu(false); }}>
                <Plus size={14} /> New project
              </button>
            </div>
          )}
        </div>

        {/* Search + Ask AI  */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input className="header-search-input"
              type="text"
              placeholder="Search papers, methods, datasets… ⌘K"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              style={{
                width: '100%', padding: '8px 12px 8px 36px',
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 'var(--radius-md)', fontSize: '0.84rem',
                outline: 'none', color: '#0f172a',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={e => e.target.style.borderColor = '#93c5fd'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div style={{ position: 'relative', flex: 1 }}>
            <Sparkles size={15} color="#c66d50" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input className="header-assistant-input"
              type="text"
              placeholder="Ask your research assistant…"
              value={askQuery}
              onChange={(e) => setAskQuery(e.target.value)}
              onKeyDown={handleAskKeyDown}
              style={{
                width: '100%', padding: '8px 12px 8px 36px',
                background: '#fff4ef', border: '1px solid #f1d8cb',
                borderRadius: 'var(--radius-md)', fontSize: '0.84rem',
                outline: 'none', color: '#884f3b',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={e => e.target.style.borderColor = '#d98669'}
              onBlur={e => e.target.style.borderColor = '#f1d8cb'}
            />
            <button className="assistant-send-button" onClick={submitAssistantQuestion} disabled={!askQuery.trim()} aria-label="Send question to assistant">
              <Send size={15} />
            </button>
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {/* DB status pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: stats?.database === 'connected' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${stats?.database === 'connected' ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: '20px', padding: '4px 10px',
            fontSize: '0.72rem', fontWeight: 600,
            color: stats?.database === 'connected' ? '#15803d' : '#dc2626'
          }}>
            <span className={stats?.database === 'connected' ? 'live-dot' : ''} style={stats?.database !== 'connected' ? { width: 7, height: 7, background: '#fca5a5', borderRadius: '50%', display: 'inline-block' } : {}} />
            {stats?.database === 'connected' ? `pgvector · ${stats?.total_papers ?? 0} papers` : 'DB Offline'}
          </div>

          <button className={`copilot-toggle ${copilotOpen ? 'is-active' : ''}`} onClick={onToggleCopilot} aria-label={copilotOpen ? 'Close research copilot' : 'Open research copilot'} title="Research Copilot">
            <Sparkles size={16} />
          </button>

          <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#dce9df', color: '#35574b', fontWeight: 700, fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            SR
          </div>
        </div>
      </div>
    </header>
  );
}
