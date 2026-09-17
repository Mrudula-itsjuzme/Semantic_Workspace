import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronUp, FileText, CheckSquare, Edit3 } from 'lucide-react';

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

const API_BASE = 'http://localhost:8000';

// Read canvas element & connection counts live from localStorage
function getCanvasStats() {
  try {
    const elems = JSON.parse(localStorage.getItem('srw_canvas_elements_v4') || '[]');
    const conns = JSON.parse(localStorage.getItem('srw_canvas_connections_v4') || '[]');
    return { nodes: elems.length, connections: conns.length };
  } catch {
    return { nodes: 0, connections: 0 };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('canvas');
  const [selectedProject, setSelectedProject] = useState('Uncertainty-Aware LLM Reasoning');

  // Backend health stats (papers, vector chunks, db status)
  const [healthStats, setHealthStats] = useState(null);
  // Live canvas stats derived from localStorage
  const [canvasStats, setCanvasStats] = useState(getCanvasStats);

  // Bottom dock: which panel is active, and whether it's collapsed
  const [bottomDockTab, setBottomDockTab] = useState('papers');
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);

  // Search state
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState('semantic');
  const [minScore, setMinScore] = useState(50);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Library & inspection state
  const [libraryPapers, setLibraryPapers] = useState([]);
  const [selectedSynthesisPapers, setSelectedSynthesisPapers] = useState([]);
  const [inspectedPaper, setInspectedPaper] = useState(null);
  const [ingestingId, setIngestingId] = useState(null);

  // Tasks — persisted to localStorage, initialised with empty array (no fake defaults)
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('srw_workspace_tasks_v2');
    return saved ? JSON.parse(saved) : [];
  });

  // Persist tasks
  useEffect(() => {
    localStorage.setItem('srw_workspace_tasks_v2', JSON.stringify(tasks));
  }, [tasks]);

  // Refresh canvas stats whenever the tab changes back to canvas
  useEffect(() => {
    setCanvasStats(getCanvasStats());
  }, [activeTab]);

  // Also poll canvas stats every 3 s while on canvas tab
  useEffect(() => {
    if (activeTab !== 'canvas') return;
    const id = setInterval(() => setCanvasStats(getCanvasStats()), 3000);
    return () => clearInterval(id);
  }, [activeTab]);

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

  const handleAskAi = () => setActiveTab('assistant');

  const handleTriggerCopilotTool = (toolId) => {
    if (toolId === 'related' || toolId === 'gaps') {
      setActiveTab('explorer');
      handleSearch('uncertainty estimation calibration LLM reasoning', 'semantic', 40);
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
    const saved = localStorage.getItem('srw_canvas_elements_v4');
    const elems = saved ? JSON.parse(saved) : [];
    const newNode = {
      id: `paper_${paper.id || Date.now()}`,
      type: 'paper',
      title: paper.title,
      text: paper.matching_snippet || paper.abstract || '',
      authors: paper.authors || '',
      venue: paper.venue || 'ArXiv',
      year: paper.publication_year || 2024,
      paperData: paper,
      x: 140 + (elems.length % 5) * 35,
      y: 140 + (elems.length % 5) * 28,
      width: 255, height: 150,
      bgColor: '#ffffff', textColor: '#0f172a'
    };
    localStorage.setItem('srw_canvas_elements_v4', JSON.stringify([...elems, newNode]));
    setCanvasStats(getCanvasStats());
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
    setIngestingId(paper.openalex_id || paper.title);
    try {
      const res = await axios.post(`${API_BASE}/papers/import`, {
        title: paper.title,
        abstract: paper.abstract,
        doi: paper.doi,
        publication_year: paper.publication_year,
        pdf_url: paper.pdf_url,
        openalex_id: paper.openalex_id,
        authors: paper.authors,
        source: paper.source
      });
      fetchHealth();
      fetchLibrary();
    } catch (err) {
      console.error('Ingest error:', err);
      alert('Failed to ingest paper.');
    } finally {
      setIngestingId(null);
    }
  };

  const handleToggleSynthesis = (paper) => {
    setSelectedSynthesisPapers(prev => {
      const exists = prev.some(p => (p.id && p.id === paper.id) || p.title === paper.title);
      return exists
        ? prev.filter(p => p.id ? p.id !== paper.id : p.title !== paper.title)
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
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <Header
        projects={['Uncertainty-Aware LLM Reasoning', 'Transformer Attention Efficiency', 'Monadic Semantics']}
        selectedProject={selectedProject}
        setSelectedProject={setSelectedProject}
        query={query}
        setQuery={setQuery}
        onSearch={() => { setActiveTab('explorer'); handleSearch(); }}
        onAskAi={handleAskAi}
        stats={healthStats}
      />

      {/* ── Body row ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          stats={mergedStats}
          taskCount={tasks.length}
        />

        {/* ── Center ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px', overflow: 'hidden', gap: '12px' }}>

          {/* === Canvas Tab === */}
          {(activeTab === 'canvas' || activeTab === 'workspace') && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: '10px' }}>

              {/* Whiteboard */}
              <div style={{ flex: 1, minHeight: 0 }}>
                <ResearchCanvas
                  libraryPapers={libraryPapers}
                  onInspectPaper={handleInspectPaper}
                  onCanvasChange={() => setCanvasStats(getCanvasStats())}
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
                  {searchMode === 'semantic' ? 'FastEmbed 384d · pgvector cosine' : searchMode}
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
                  isSelectedForSynthesis={selectedSynthesisPapers.some(p => p.id === paper.id || p.title === paper.title)}
                  onToggleSynthesis={handleToggleSynthesis}
                  isIngesting={ingestingId === paper.openalex_id || ingestingId === paper.title}
                />
              ))}
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
              <AiAssistant papers={libraryPapers} />
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
        <CopilotSidebar
          onTriggerTool={handleTriggerCopilotTool}
          onAddGeneratedTask={handleAddGeneratedTask}
          onAddPaperToCanvas={handleAddPaperToCanvas}
        />
      </div>

      {/* Paper detail slide-over */}
      <PaperDetailDrawer paper={inspectedPaper} onClose={() => setInspectedPaper(null)} />
    </div>
  );
}
