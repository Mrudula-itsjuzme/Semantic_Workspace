import React, { useState } from 'react';
import {
  LayoutGrid, FileText, Layers, CheckSquare, GitCompare, Edit3,
  Download, Database, Search, CheckCircle2, Activity, Network
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, stats, taskCount }) {
  const navItems = [
    { id: 'canvas',   label: 'Canvas',           icon: Layers },
    { id: 'explorer', label: 'Literature Search', icon: Search },
    { id: 'graph',    label: 'Knowledge Graph',  icon: Network },
    { id: 'papers',   label: 'Papers Library',   icon: FileText },
    { id: 'compare',  label: 'Synthesis',         icon: GitCompare },
    { id: 'assistant',label: 'AI Assistant',      icon: Activity },
    { id: 'tasks',    label: 'Tasks',             icon: CheckSquare },
  ];

  // Derive all real stats from props — zero hardcoding
  const nodes       = stats?.nodes        ?? '—';
  const connections = stats?.connections  ?? '—';
  const papers      = stats?.total_papers ?? '—';
  const vectors     = stats?.total_vector_chunks ?? '—';
  const tasks       = taskCount           ?? '—';
  const dbStatus    = stats?.database === 'connected';

  return (
    <aside className="workspace-sidebar" style={{
      width: '208px',
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      padding: '12px 10px',
      flexShrink: 0,
      gap: '4px'
    }}>
      {/* Navigation */}
      <nav style={{ flex: 1 }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingLeft: '10px', display: 'block', marginBottom: '6px' }}>
          Workspace
        </span>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button className={`workspace-nav-item ${isActive ? 'is-active' : ''}`}
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: isActive ? 'var(--bg-surface)' : 'transparent',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.84rem',
                cursor: 'pointer',
                marginBottom: '1px',
                transition: 'all 0.15s ease',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <Icon size={15} color={isActive ? 'var(--primary)' : '#64748b'} />
                <span>{item.label}</span>
              </div>

              {/* Live count badge */}
              {item.id === 'papers' && papers !== '—' && (
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', background: isActive ? '#dbeafe' : '#f1f5f9', color: isActive ? '#1e40af' : '#64748b' }}>
                  {papers}
                </span>
              )}
              {item.id === 'tasks' && tasks !== '—' && (
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', background: isActive ? '#dbeafe' : '#f1f5f9', color: isActive ? '#1e40af' : '#64748b' }}>
                  {tasks}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Workspace Stats — 100% Live from backend & localStorage */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '13px 14px',
        marginTop: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Workspace Stats
          </h4>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: dbStatus ? '#15803d' : '#e11d48', fontWeight: 600 }}>
            <span className={dbStatus ? 'live-dot' : ''} style={!dbStatus ? { width: 7, height: 7, background: '#fca5a5', borderRadius: '50%', display: 'inline-block' } : {}} />
            {dbStatus ? 'DB Connected' : 'DB Offline'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          {[
            { label: 'Canvas Nodes', value: nodes },
            { label: 'Connections',  value: connections },
            { label: 'Papers',       value: papers },
            { label: 'Vectors',      value: vectors },
            { label: 'Tasks',        value: tasks, span: 2 },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                gridColumn: s.span === 2 ? '1 / -1' : undefined,
                display: 'flex',
                flexDirection: 'column',
                gap: '1px'
              }}
            >
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: dbStatus ? '#15803d' : '#94a3b8', fontWeight: 600 }}>
          <CheckCircle2 size={12} />
          <span>{dbStatus ? 'pgvector index active' : 'No database connection'}</span>
        </div>
      </div>
    </aside>
  );
}
