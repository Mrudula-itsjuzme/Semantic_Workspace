import React from 'react';
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
    <nav className="workspace-sidebar" aria-label="Workspace sections">
      <div className="workspace-nav-list">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button className={`workspace-nav-item ${isActive ? 'is-active' : ''}`}
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
            >
              <div className="workspace-nav-label">
                <Icon size={16} />
                <span>{item.label}</span>
              </div>

              {/* Live count badge */}
              {item.id === 'papers' && papers !== '—' && (
                <span className="workspace-nav-badge">
                  {papers}
                </span>
              )}
              {item.id === 'tasks' && tasks !== '—' && (
                <span className="workspace-nav-badge">
                  {tasks}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="workspace-nav-status" title={dbStatus ? 'Database connected' : 'Database offline'}>
        <span className={`workspace-status-dot ${dbStatus ? 'is-connected' : ''}`} />
        <span>{dbStatus ? 'Connected' : 'Offline'}</span>
        <span className="workspace-status-count">{papers} papers</span>
      </div>
    </nav>
  );
}
