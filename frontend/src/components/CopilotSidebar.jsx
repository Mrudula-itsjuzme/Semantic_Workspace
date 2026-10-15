import React, { useState } from 'react';
import { Sparkles, Search, Scale, Target, GitBranch, Quote, CheckSquare, ArrowRight, Plus, AlertCircle, RefreshCw, X } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../api';

export default function CopilotSidebar({ onClose, onTriggerTool, onAddGeneratedTask, onAddPaperToCanvas, projectId = 'workspace-default', projectName }) {
  const [isScanning, setIsScanning] = useState(false);
  const [parsedResults, setParsedResults] = useState(null);

  const handleScanWorkspace = async () => {
    setIsScanning(true);
    try {
      // Read active canvas nodes from localStorage
      const canvasKey = projectId === 'workspace-default'
        ? 'srw_canvas_elements_v4'
        : `srw_canvas_elements_v4_${projectId}`;
      const savedNodes = localStorage.getItem(canvasKey);
      const canvasNodes = savedNodes ? JSON.parse(savedNodes) : [];

      const res = await axios.post(apiUrl('/api/ai/parse-workspace'), {
        canvas_nodes: canvasNodes,
        project_name: projectName || localStorage.getItem('srw_project_name') || 'Untitled Research Project'
      });

      setParsedResults(res.data);
    } catch (err) {
      console.error("Parse workspace error:", err);
      alert("Failed to parse workspace. Ensure backend is running.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <aside className="research-rail" style={{ width: '310px', background: '#ffffff', borderLeft: '1px solid #e2e8f0', padding: '20px 16px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Copilot Header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <Sparkles size={18} color="#2563eb" />
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
            Research Copilot
          </h3>
          <button className="copilot-close" onClick={onClose} aria-label="Close research copilot"><X size={16} /></button>
        </div>
        <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
          AI workspace parser & suggestions
        </p>
      </div>

      {/* Main Scan Workspace Button */}
      <button
        className="btn-blue"
        onClick={handleScanWorkspace}
        disabled={isScanning}
        style={{ width: '100%', justifyContent: 'center', padding: '10px', marginBottom: '18px', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)' }}
      >
        {isScanning ? (
          <>
            <RefreshCw size={16} className="pulse-glow" />
            <span>Scanning Vectors...</span>
          </>
        ) : (
          <>
            <Sparkles size={16} />
            <span>Scan & Auto-Generate</span>
          </>
        )}
      </button>

      {/* PARSED INTELLIGENCE RESULTS PANEL */}
      {parsedResults ? (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* 1. Generated To-Do Tasks */}
          <div className="ui-card" style={{ padding: '14px', borderLeft: '4px solid #2563eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h4 style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckSquare size={15} color="#2563eb" />
                Auto-Generated Tasks ({(parsedResults.todos || []).length})
              </h4>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(parsedResults.todos || []).map((todo) => (
                <div key={todo.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px', lineHeight: 1.3 }}>
                    {todo.text}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className={`tag-pill priority-${todo.priority.toLowerCase()}`}>
                      {todo.priority}
                    </span>
                    <button
                      onClick={() => onAddGeneratedTask(todo)}
                      style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Plus size={12} />
                      <span>Add to Tasks</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Recommended Papers */}
          <div className="ui-card" style={{ padding: '14px', borderLeft: '4px solid #16a34a' }}>
            <h4 style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Search size={15} color="#16a34a" />
              Recommended Papers ({(parsedResults.related_papers || []).length})
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(parsedResults.related_papers || []).map((p) => (
                <div key={p.id} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '2px', lineHeight: 1.3 }}>
                    {p.title}
                  </div>
                  <div style={{ color: '#15803d', fontSize: '0.72rem', fontWeight: 600, marginBottom: '6px' }}>
                    {p.publication_year || ''} • In library
                  </div>
                  <button
                    onClick={() => onAddPaperToCanvas(p)}
                    style={{ background: '#ffffff', border: '1px solid #bbf7d0', color: '#15803d', padding: '3px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', width: '100%', justifyContent: 'center' }}
                  >
                    <Plus size={12} />
                    <span>Add to Canvas</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Open Research Gaps */}
          <div className="ui-card" style={{ padding: '14px', borderLeft: '4px solid #e11d48' }}>
            <h4 style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={15} color="#e11d48" />
              Open Research Gaps
            </h4>
            <ul style={{ paddingLeft: '16px', fontSize: '0.78rem', color: '#475569', lineHeight: 1.4 }}>
              {(parsedResults.suggestions || []).map((gap, gi) => (
                <li key={gi} style={{ marginBottom: '4px' }}>{gap.text}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        /* Standard Suggestion Cards */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
          {[
            { id: 'related', title: 'Find related papers', desc: 'Discover papers related to this research question.', icon: Search, color: '#2563eb', bg: '#eff6ff' },
            { id: 'compare', title: 'Compare methods', desc: 'Analyze strengths and weaknesses of approaches.', icon: Scale, color: '#d97706', bg: '#fffbeb' },
            { id: 'gaps', title: 'Identify gaps', desc: 'Find under-explored areas and open problems.', icon: Target, color: '#e11d48', bg: '#ffe4e6' },
            { id: 'workflow', title: 'Generate workflow', desc: 'Create a step-by-step research plan for this project.', icon: GitBranch, color: '#0d9488', bg: '#f0fdfa' },
            { id: 'citation', title: 'Add citation', desc: 'Insert a citation or create bibliography entry.', icon: Quote, color: '#16a34a', bg: '#f0fdf4' },
            { id: 'tasks', title: 'Create tasks', desc: 'Turn ideas and notes into actionable tasks.', icon: CheckSquare, color: '#9333ea', bg: '#faf5ff' }
          ].map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.id}
                onClick={() => onTriggerTool(t.id)}
                className="ui-card"
                style={{ padding: '12px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '10px', transition: 'all 0.15s ease' }}
              >
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={15} color={t.color} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>
                    {t.title}
                  </h4>
                  <p style={{ fontSize: '0.74rem', color: '#64748b', lineHeight: 1.3 }}>
                    {t.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Button */}
      <button
        className="btn-subtle"
        onClick={handleScanWorkspace}
        style={{ width: '100%', justifyContent: 'center', marginTop: '14px', padding: '8px', fontSize: '0.8rem' }}
      >
        <span>Re-scan workspace</span>
        <ArrowRight size={14} />
      </button>
    </aside>
  );
}
