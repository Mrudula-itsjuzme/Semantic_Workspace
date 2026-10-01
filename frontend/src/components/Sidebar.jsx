import React from 'react';
import {
  FileText, Layers, CheckSquare, GitCompare, Search, Sparkles, Network,
  Folder, Plus, ArrowRight, Database
} from 'lucide-react';

const navItems = [
  { id: 'canvas', label: 'Canvas', icon: Layers },
  { id: 'explorer', label: 'Literature Search', icon: Search },
  { id: 'graph', label: 'Knowledge Graph', icon: Network },
  { id: 'papers', label: 'Papers Library', icon: FileText },
  { id: 'compare', label: 'Synthesis', icon: GitCompare },
  { id: 'assistant', label: 'AI Assistant', icon: Sparkles },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
];

export default function Sidebar({
  activeTab, setActiveTab, stats, taskCount, projects = [], activeProjectId,
  onSelectProject, onCreateProject, papers = [], onSelectPaper
}) {
  const paperCount = stats?.total_papers ?? '—';
  const vectorCount = stats?.total_vector_chunks ?? '—';
  const dbConnected = stats?.database === 'connected';

  return (
    <aside className="workspace-sidebar">
      <nav className="workspace-sections" aria-label="Workspace sections">
        <p className="sidebar-section-title">Workspace</p>
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`workspace-nav-item ${activeTab === id ? 'is-active' : ''}`}
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <Icon size={17} strokeWidth={1.8} />
            <span>{label}</span>
            {id === 'tasks' && <span className="workspace-nav-badge">{taskCount}</span>}
            {id === 'papers' && paperCount !== '—' && <span className="workspace-nav-badge">{paperCount}</span>}
          </button>
        ))}
      </nav>

      <section className="sidebar-projects" aria-labelledby="sidebar-projects-title">
        <div className="sidebar-section-heading">
          <p className="sidebar-section-title" id="sidebar-projects-title">Projects</p>
          <button className="sidebar-icon-button" onClick={onCreateProject} aria-label="Create project" title="Create project">
            <Plus size={17} />
          </button>
        </div>
        <div className="sidebar-project-list">
          {projects.map(project => (
            <button
              key={project.id}
              className={`sidebar-project ${project.id === activeProjectId ? 'is-active' : ''}`}
              onClick={() => onSelectProject(project.id)}
              title={project.name}
            >
              <Folder size={16} strokeWidth={1.8} />
              <span>{project.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar-recent" aria-labelledby="sidebar-recent-title">
        <div className="sidebar-section-heading">
          <p className="sidebar-section-title" id="sidebar-recent-title">Recent papers</p>
          {papers.length > 4 && (
            <button className="sidebar-text-button" onClick={() => setActiveTab('papers')}>All</button>
          )}
        </div>
        {papers.length ? (
          <div className="sidebar-recent-list">
            {papers.slice(0, 4).map(paper => (
              <button className="sidebar-paper" key={paper.id} onClick={() => onSelectPaper(paper)} title={paper.title}>
                <span className="sidebar-paper-icon"><FileText size={15} /></span>
                <span className="sidebar-paper-copy">
                  <span className="sidebar-paper-title">{paper.title}</span>
                  <span className="sidebar-paper-meta">{paper.publication_year || 'Year n/a'}{paper.venue ? ` · ${paper.venue}` : ''}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="sidebar-empty-papers">
            <span>No papers saved yet</span>
            <button className="sidebar-text-button" onClick={() => setActiveTab('explorer')}>Find papers <ArrowRight size={13} /></button>
          </div>
        )}
      </section>

      <div className="sidebar-status">
        <span className={`workspace-status-dot ${dbConnected ? 'is-connected' : ''}`} />
        <span>{dbConnected ? 'Database connected' : 'Database offline'}</span>
        <span className="sidebar-status-count"><Database size={13} /> {vectorCount} vectors</span>
      </div>
    </aside>
  );
}

