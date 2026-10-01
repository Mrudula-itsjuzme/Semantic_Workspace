import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronUp, FileText, CheckSquare, Edit3 } from 'lucide-react';

import { API_BASE } from './api';

import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ResearchCanvas from './components/ResearchCanvas';
import CopilotSidebar from './components/CopilotSidebar';
import SavedPapersTable from './components/SavedPapersTable';
import TasksWidget from './components/TasksWidget';
import DraftsExportWidget from './components/DraftsExportWidget';
import PaperDetailDrawer from './components/PaperDetailDrawer';
import SearchBar from './components/SearchBar';
import PaperCard from './components/PaperCard';
import SynthesisView from './components/SynthesisView';
import AiAssistant from './components/AiAssistant';
import LibraryView from './components/LibraryView';
import GraphExplorer from './components/GraphExplorer';

const DEFAULT_PROJECT_ID = 'workspace-default';

function scopedKey(key, projectId) {
  return projectId === DEFAULT_PROJECT_ID ? key : `${key}_${projectId}`;
}

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function getSavedProjects() {
  try {
    const saved = JSON.parse(localStorage.getItem('srw_projects_v1') || '[]');
    const validProjects = Array.isArray(saved) ? saved.filter(project => project?.id && project?.name) : [];
    if (validProjects.length) return validProjects;
  } catch { /* migrate the existing single project below */ }
  return [{
    id: DEFAULT_PROJECT_ID,
    name: localStorage.getItem('srw_project_name') || 'Untitled Research Project'
  }];
}

function getCanvasStats(projectId) {
  const elems = readArray(scopedKey('srw_canvas_elements_v4', projectId));
  const conns = readArray(scopedKey('srw_canvas_connections_v4', projectId));
  return { nodes: elems.length, connections: conns.length };
}

function getSavedTasks(projectId) {
  return readArray(scopedKey('srw_workspace_tasks_v2', projectId));
}

export default function App() {
  const [projects, setProjects] = useState(getSavedProjects);
  const [activeProjectId, setActiveProjectId] = useState(() => {
    const savedId = localStorage.getItem('srw_active_project_id');
    const savedProjects = getSavedProjects();
    return savedProjects.some(project => project.id === savedId) ? savedId : savedProjects[0].id;
  });
  const activeProject = projects.find(project => project.id === activeProjectId) || projects[0];
  const selectedProject = activeProject?.name || 'Untitled Research Project';
  const [activeTab, setActiveTab] = useState('canvas');
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState(null);
  const [canvasPaperRequest, setCanvasPaperRequest] = useState(null);

  // Backend health stats (papers, vector chunks, db status)
  const [healthStats, setHealthStats] = useState(null);
  // Live canvas stats derived from localStorage
  const [canvasStats, setCanvasStats] = useState(() => getCanvasStats(activeProject?.id || DEFAULT_PROJECT_ID));

  // Bottom dock: which panel is active, and whether it's collapsed
  const [bottomDockTab, setBottomDockTab] = useState('papers');
  const [isDockCollapsed, setIsDockCollapsed] = useState(true);

  // Search state — default to hybrid (RRF) which is the strongest mode
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState('hybrid');
  const [minScore, setMinScore] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Library & inspection state
  const [libraryPapers, setLibraryPapers] = useState([]);
  const [selectedSynthesisPapers, setSelectedSynthesisPapers] = useState([]);
  const [inspectedPaper, setInspectedPaper] = useState(null);
  const [ingestingId, setIngestingId] = useState(null);

  // Tasks — persisted to localStorage, initialised with empty array (no fake defaults)
  const [tasksByProject, setTasksByProject] = useState(() => Object.fromEntries(
    getSavedProjects().map(project => [project.id, getSavedTasks(project.id)])
  ));
  const tasks = tasksByProject[activeProjectId] || [];
  const setTasks = (update) => setTasksByProject(previous => {
    const current = previous[activeProjectId] || [];
    return { ...previous, [activeProjectId]: typeof update === 'function' ? update(current) : update };
  });

  // Persist projects and their active selection locally.
  useEffect(() => {
    localStorage.setItem('srw_projects_v1', JSON.stringify(projects));
    if (projects.length && !projects.some(project => project.id === activeProjectId)) {
      setActiveProjectId(projects[0].id);
    }
  }, [projects, activeProjectId]);

  useEffect(() => {
    localStorage.setItem('srw_active_project_id', activeProjectId);
    localStorage.setItem('srw_project_name', selectedProject);
  }, [activeProjectId, selectedProject]);

  // Persist tasks
  useEffect(() => {
    Object.entries(tasksByProject).forEach(([projectId, projectTasks]) => {
      localStorage.setItem(scopedKey('srw_workspace_tasks_v2', projectId), JSON.stringify(projectTasks));
    });
  }, [tasksByProject]);

  // Refresh canvas stats whenever the tab changes back to canvas
  useEffect(() => {
    setCanvasStats(getCanvasStats(activeProjectId));
  }, [activeTab, activeProjectId]);

  // Also poll canvas stats every 3 s while on canvas tab
  useEffect(() => {
    if (activeTab !== 'canvas') return;
    const id = setInterval(() => setCanvasStats(getCanvasStats(activeProjectId)), 3000);
    return () => clearInterval(id);
  }, [activeTab, activeProjectId]);

  // Combine all stats for sidebar
  const mergedStats = {
    ...healthStats,
    nodes: canvasStats.nodes,
    connections: canvasStats.connections,
  };

  useEffect(() => {
    fetchHealth();
    fetchLibrary();
  }, []);

  const fetchHealth = async () => {
    try {
      const res = await axios.get(`${API_BASE}/health`);
      setHealthStats(res.data);
    } catch {
      setHealthStats({ database: 'offline' });
    }
  };

  const fetchLibrary = async () => {
    try {
      const res = await axios.get(`${API_BASE}/papers`);
      setLibraryPapers(res.data || []);
    } catch (err) {
      console.error('Fetch library error:', err);
    }
  };

  const handleSearch = useCallback(async (overrideQuery, overrideMode, overrideMinScore) => {
    const q    = overrideQuery    !== undefined ? overrideQuery    : query;
    const mode = overrideMode     !== undefined ? overrideMode     : searchMode;
    const minS = overrideMinScore !== undefined ? overrideMinScore : minScore;
    if (!q?.trim()) return;

    setIsSearching(true);
    try {
      const res = await axios.get(`${API_BASE}/search`, {
        params: { q: q.trim(), mode, min_score: minS, limit: 15 }
      });
      setSearchResults(res.data.results || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, [query, searchMode, minScore]);

  const handleAskAi = (question) => {
    if (question?.trim()) setAssistantPrompt({ id: Date.now(), text: question.trim() });
    setActiveTab('assistant');
  };

  const handleCreateProject = () => {
    const name = window.prompt('Name your project');
    if (!name?.trim()) return;
    if (projects.some(project => project.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) {
      window.alert('A project with that name already exists.');
      return;
    }
    const project = { id: `project_${Date.now()}`, name: name.trim() };
    setProjects(previous => [...previous, project]);
    setActiveProjectId(project.id);
    setActiveTab('canvas');
  };

  const handleRenameProject = (name) => {
    const nextName = name.trim();
    if (!nextName) return;
    setProjects(previous => previous.map(project =>
      project.id === activeProjectId ? { ...project, name: nextName } : project
    ));
  };

  const handleCanvasChange = useCallback(() => {
    setCanvasStats(getCanvasStats(activeProjectId));
  }, [activeProjectId]);

  // ⌘K / Ctrl+K focuses the header search box (the placeholder promises this)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document
        .querySelector('.header-search-input')
          ?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleTriggerCopilotTool = (toolId) => {
    setCopilotOpen(false);
    if (toolId === 'related' || toolId === 'gaps') {
      setActiveTab('explorer');
      handleSearch(query || 'recent advances', 'hybrid', 0);
    } else if (toolId === 'compare') {
      setActiveTab('compare');
    } else if (toolId === 'tasks') {
      setIsDockCollapsed(false);
      setBottomDockTab('tasks');
    } else {
      setActiveTab('canvas');
    }
  };

  const handleAddGeneratedTask = (todo) => {
    setCopilotOpen(false);
    setTasks(prev => [{
      id: `task_${Date.now()}`,
      text: todo.text,
      priority: todo.priority || 'Medium',
      date: todo.due_date || 'Soon',
      completed: false
    }, ...prev]);
    setIsDockCollapsed(false);
    setBottomDockTab('tasks');
  };

  const handleAddPaperToCanvas = (paper) => {
    setCopilotOpen(false);
    setCanvasPaperRequest({ id: Date.now(), projectId: activeProjectId, paper });
    setActiveTab('canvas');
  };

  const handleInspectPaper = async (paper) => {
    const pid = paper.id || paper.paper_id;
    if (pid) {
      try {
        const res = await axios.get(`${API_BASE}/papers/${pid}`);
        setInspectedPaper(res.data);
        return;
      } catch {/* fall through */}
    }
    setInspectedPaper(paper);
  };

  const handleExportLatex = () => {
    const content = `% Semantic Research Workspace — LaTeX Export
\\documentclass[12pt]{article}
\\usepackage{amsmath, amssymb, hyperref}
\\title{${selectedProject}}
\\author{Research Workspace}
\\date{\\today}
\\begin{document}
\\maketitle
\\section{Introduction}
% Exported from Semantic Research Workspace
% Total papers indexed: ${healthStats?.total_papers ?? 0}
% Vector chunks: ${healthStats?.total_vector_chunks ?? 0}
\\end{document}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedProject.replace(/\W+/g, '_')}_export.tex`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleIngestPaper = async (paper) => {
    // Live results carry `openalex_id` / `source_id`; the backend ExternalPaper
    // schema requires { source, source_id, title }.
    const sourceId = paper.source_id || paper.openalex_id || paper.doi || `title:${paper.title}`;
    const source = paper.source === 'openalex' || paper.source === 'OpenAlex Live'
      ? 'openalex'
      : (paper.source === 'core' ? 'core' : 'openalex');
    setIngestingId(sourceId || paper.title);
    try {
      const res = await axios.post(`${API_BASE}/papers/import`, {
        source,
        source_id: sourceId,
        title: paper.title,
        abstract: paper.abstract,
        doi: paper.doi,
        publication_year: paper.publication_year,
        pdf_url: paper.pdf_url,
        authors: paper.authors || [],
        cited_paper_ids: paper.cited_paper_ids || [],
        cited_by_count: paper.cited_by_count
      });
      fetchHealth();
      fetchLibrary();
      setIngestingId(null);
      return res.data;
    } catch (err) {
      console.error('Ingest error:', err);
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map(d => d.msg).join('; ')
          : 'Failed to ingest paper.';
      alert(`Failed to ingest paper: ${msg}`);
      setIngestingId(null);
      throw err;
    }
  };

  // Stable identity for compare-selection: DB papers by id, live catalogue
  // results by their external id (title as last resort). A bare `p.id ===
  // paper.id` matches every id-less card (undefined === undefined).
  const paperKey = (p) =>
    p?.id != null
      ? `db:${p.id}`
      : `live:${p?.openalex_id || p?.source_id || p?.doi || p?.title || ''}`;

  const handleToggleSynthesis = (paper) => {
    setSelectedSynthesisPapers(prev => {
      const key = paperKey(paper);
      return prev.some(p => paperKey(p) === key)
        ? prev.filter(p => paperKey(p) !== key)
        : [...prev, paper];
    });
  };

  const handleDeleteLibraryPaper = async (paperId) => {
    if (!window.confirm('Delete paper and its vector chunks?')) return;
    try {
      await axios.delete(`${API_BASE}/papers/${paperId}`);
      fetchHealth();
      fetchLibrary();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Dock tabs definition
  const dockTabs = [
    { id: 'papers', label: `Saved Papers (${libraryPapers.length})`, icon: FileText },
    { id: 'tasks',  label: `Tasks (${tasks.length})`,                 icon: CheckSquare },
    { id: 'drafts', label: 'Drafts & Export',                          icon: Edit3 },
  ];

  return (
    <div className="app-shell" style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <Header
        projects={projects}
        selectedProject={selectedProject}
        setSelectedProject={handleRenameProject}
        onSelectProject={setActiveProjectId}
        onCreateProject={handleCreateProject}
        query={query}
        setQuery={setQuery}
        onSearch={() => { setActiveTab('explorer'); handleSearch(); }}
        onAskAi={handleAskAi}
        onToggleCopilot={() => setCopilotOpen(open => !open)}
        copilotOpen={copilotOpen}
        stats={healthStats}
      />

      {/* ── Body row ── */}
      <div className="app-body" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          stats={mergedStats}
          taskCount={tasks.length}
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={setActiveProjectId}
          onCreateProject={handleCreateProject}
          papers={libraryPapers}
          onSelectPaper={handleInspectPaper}
        />

        <div className="workspace-content">
          {/* ── Center ── */}
          <main className="workspace-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px', overflow: 'hidden', gap: '12px' }}>

          {/* === Canvas Tab === */}
          {(activeTab === 'canvas' || activeTab === 'workspace') && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: '10px' }}>

              {/* Whiteboard */}
              <div style={{ flex: 1, minHeight: 0 }}>
                <ResearchCanvas
                  key={activeProjectId}
                  projectId={activeProjectId}
                  addPaperRequest={canvasPaperRequest}
                  libraryPapers={libraryPapers}
                  onInspectPaper={handleInspectPaper}
                  onCanvasChange={handleCanvasChange}
                />
              </div>

              {/* Collapsible Bottom Dock */}
              <div className="ui-card" style={{
                display: 'flex', flexDirection: 'column',
                height: isDockCollapsed ? '40px' : '220px',
                transition: 'height 0.22s cubic-bezier(0.16,1,0.3,1)',
                flexShrink: 0, overflow: 'hidden'
              }}>
                {/* Dock header / tab bar */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 14px', height: '40px', background: '#f8fafc',
                  borderBottom: isDockCollapsed ? 'none' : '1px solid #e2e8f0', flexShrink: 0
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {dockTabs.map(tab => {
                      const Icon = tab.icon;
                      const isSel = bottomDockTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => { setBottomDockTab(tab.id); setIsDockCollapsed(false); }}
                          style={{
                            padding: '4px 11px', borderRadius: '6px', border: 'none',
                            fontSize: '0.78rem', fontWeight: isSel ? 700 : 500,
                            cursor: 'pointer',
                            background: isSel ? '#ffffff' : 'transparent',
                            color: isSel ? 'var(--primary)' : 'var(--text-muted)',
                            boxShadow: isSel ? 'var(--shadow-sm)' : 'none',
                            display: 'flex', alignItems: 'center', gap: '5px'
                          }}
                        >
                          <Icon size={13} />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setIsDockCollapsed(v => !v)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600 }}
                  >
                    <span>{isDockCollapsed ? 'Expand' : 'Collapse'}</span>
                    {isDockCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {/* Dock content */}
                {!isDockCollapsed && (
                  <div style={{ flex: 1, padding: '12px 14px', overflow: 'auto' }}>
                    {bottomDockTab === 'papers' && (
                      <SavedPapersTable papers={libraryPapers} onSelectPaper={handleInspectPaper} onDeletePaper={handleDeleteLibraryPaper} />
                    )}
                    {bottomDockTab === 'tasks' && (
                      <TasksWidget tasks={tasks} setTasks={setTasks} />
                    )}
                    {bottomDockTab === 'drafts' && (
                      <DraftsExportWidget onExport={handleExportLatex} projectName={selectedProject} />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* === Explorer Tab === */}
          {activeTab === 'explorer' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <SearchBar
                query={query} setQuery={setQuery}
                searchMode={searchMode} setSearchMode={setSearchMode}
                minScore={minScore} setMinScore={setMinScore}
                onSearch={() => handleSearch()} isLoading={isSearching}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  Results ({searchResults.length})
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600 }}>
                  {searchMode === 'vector' ? 'FastEmbed 384d · pgvector cosine' : searchMode}
                </span>
              </div>
              {searchResults.length === 0 && !isSearching && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '0.88rem' }}>
                  Search for papers, methods, or concepts above.
                </div>
              )}
              {searchResults.map((paper, idx) => (
                <PaperCard
                  key={paper.id || paper.doi || idx}
                  paper={paper}
                  onInspect={handleInspectPaper}
                  onIngest={handleIngestPaper}
                  isSelectedForSynthesis={selectedSynthesisPapers.some(p => paperKey(p) === paperKey(paper))}
                  onToggleSynthesis={handleToggleSynthesis}
                  isIngesting={ingestingId === (paper.source_id || paper.openalex_id) || ingestingId === paper.title}
                />
              ))}
            </div>
          )}

          {/* === Graph Tab === */}
          {activeTab === 'graph' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <GraphExplorer onInspectPaper={handleInspectPaper} />
            </div>
          )}

          {/* === Synthesis / Compare Tab === */}
          {(activeTab === 'compare' || activeTab === 'synthesis') && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <SynthesisView
                selectedPapers={selectedSynthesisPapers.length > 0 ? selectedSynthesisPapers : libraryPapers.slice(0, 3)}
                onRemovePaper={handleToggleSynthesis}
                onInspectPaper={handleInspectPaper}
              />
            </div>
          )}

          {/* === AI Assistant Tab === */}
          {activeTab === 'assistant' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <AiAssistant papers={libraryPapers} initialQuestion={assistantPrompt} />
            </div>
          )}

          {/* === Papers Library Tab === */}
          {(activeTab === 'papers' || activeTab === 'library' || activeTab === 'collections') && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <LibraryView
                papers={libraryPapers}
                onInspectPaper={handleInspectPaper}
                onDeletePaper={handleDeleteLibraryPaper}
                onRefresh={fetchLibrary}
              />
            </div>
          )}

          {/* === Tasks standalone tab === */}
          {activeTab === 'tasks' && (
            <div style={{ flex: 1, overflowY: 'auto', maxWidth: '760px' }}>
              <TasksWidget tasks={tasks} setTasks={setTasks} />
            </div>
          )}
          </main>

        {/* Right Research Copilot */}
          {copilotOpen && (
            <>
              <button className="copilot-scrim" aria-label="Close research copilot" onClick={() => setCopilotOpen(false)} />
              <CopilotSidebar
                onClose={() => setCopilotOpen(false)}
                onTriggerTool={handleTriggerCopilotTool}
                onAddGeneratedTask={handleAddGeneratedTask}
                onAddPaperToCanvas={handleAddPaperToCanvas}
                projectId={activeProjectId}
                projectName={selectedProject}
              />
            </>
          )}
        </div>
      </div>

      {/* Paper detail slide-over */}
      <PaperDetailDrawer paper={inspectedPaper} onClose={() => setInspectedPaper(null)} />
    </div>
  );
}
