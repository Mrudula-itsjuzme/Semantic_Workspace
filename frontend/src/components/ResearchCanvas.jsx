import React, { useState, useEffect, useRef } from 'react';
import { 
  MousePointer, StickyNote, Type, PenTool, Highlighter, Square,
  ArrowUpRight, FileText, Trash2, Sparkles, X, Bold, Italic 
} from 'lucide-react';

export default function ResearchCanvas({ libraryPapers, onInspectPaper }) {
  // Canvas elements state (persistent via localStorage)
  const [elements, setElements] = useState(() => {
    const saved = localStorage.getItem('srw_canvas_elements_v4');
    return saved ? JSON.parse(saved) : [];
  });

  // Freehand drawing paths state
  const [drawings, setDrawings] = useState(() => {
    const saved = localStorage.getItem('srw_canvas_drawings_v4');
    return saved ? JSON.parse(saved) : [];
  });

  // Connections state
  const [connections, setConnections] = useState(() => {
    const saved = localStorage.getItem('srw_canvas_connections_v4');
    return saved ? JSON.parse(saved) : [];
  });

  // Active Tool: 'select' | 'sticky' | 'text' | 'draw' | 'highlight' | 'shape' | 'arrow' | 'paper'
  const [activeTool, setActiveTool] = useState('select');
  const [selectedShapeType, setSelectedShapeType] = useState('rectangle');

  // Drawing settings
  const [brushColor, setBrushColor] = useState('#2563eb');
  const [brushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);

  // Selected & Editing element IDs
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [editingElementId, setEditingElementId] = useState(null);

  // Connecting mode state
  const [connectingFromId, setConnectingFromId] = useState(null);

  // Dragging state
  const [draggedId, setDraggedId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Modal for paper insertion
  const [showPaperModal, setShowPaperModal] = useState(false);

  const containerRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const activeInputRef = useRef(null);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('srw_canvas_elements_v4', JSON.stringify(elements));
  }, [elements]);

  useEffect(() => {
    localStorage.setItem('srw_canvas_drawings_v4', JSON.stringify(drawings));
  }, [drawings]);

  useEffect(() => {
    localStorage.setItem('srw_canvas_connections_v4', JSON.stringify(connections));
  }, [connections]);

  // Auto-focus active input when editing starts
  useEffect(() => {
    if (editingElementId && activeInputRef.current) {
      activeInputRef.current.focus();
    }
  }, [editingElementId]);

  // Global Keyboard Shortcuts (Delete, Escape)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId) {
          handleDeleteSelected();
        }
      } else if (e.key === 'Escape') {
        setSelectedElementId(null);
        setEditingElementId(null);
        setActiveTool('select');
        setConnectingFromId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementId]);

  // Redraw freehand paths on HTML5 canvas overlay
  useEffect(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawings.forEach(pathObj => {
      if (!pathObj.points || pathObj.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = pathObj.color;
      ctx.lineWidth = pathObj.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = pathObj.isHighlighter ? 0.4 : 1.0;

      ctx.moveTo(pathObj.points[0].x, pathObj.points[0].y);
      for (let i = 1; i < pathObj.points.length; i++) {
        ctx.lineTo(pathObj.points[i].x, pathObj.points[i].y);
      }
      ctx.stroke();
    });

    if (currentPath.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = activeTool === 'highlight' ? 18 : brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = activeTool === 'highlight' ? 0.4 : 1.0;

      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x, currentPath[i].y);
      }
      ctx.stroke();
    }
  }, [drawings, currentPath, brushColor, brushSize, activeTool]);

  // INSTANT ELEMENT SPAWNING FUNCTION
  const spawnElementAtCoordinates = (x, y, forceType = null) => {
    const typeToSpawn = forceType || (activeTool === 'sticky' ? 'sticky' : activeTool === 'shape' ? 'shape' : 'text');
    
    let newElem;
    if (typeToSpawn === 'sticky') {
      newElem = {
        id: `sticky_${Date.now()}`,
        type: 'sticky',
        text: 'New Sticky Note',
        x,
        y,
        width: 190,
        height: 140,
        bgColor: '#fef08a', // Yellow
        textColor: '#854d0e',
        fontFamily: 'Inter',
        fontSize: '14px',
        fontWeight: 'normal',
        fontStyle: 'normal'
      };
    } else if (typeToSpawn === 'shape') {
      newElem = {
        id: `shape_${Date.now()}`,
        type: 'shape',
        shapeType: selectedShapeType,
        text: selectedShapeType.toUpperCase(),
        x,
        y,
        width: 170,
        height: 90,
        bgColor: '#e0e7ff',
        textColor: '#3730a3',
        fontFamily: 'Inter',
        fontSize: '14px',
        fontWeight: '600',
        fontStyle: 'normal'
      };
    } else {
      // Default Typable Text Box
      newElem = {
        id: `text_${Date.now()}`,
        type: 'text',
        text: 'Type text here...',
        x,
        y,
        width: 220,
        height: 50,
        bgColor: '#ffffff',
        textColor: '#0f172a',
        fontFamily: 'Inter',
        fontSize: '16px',
        fontWeight: '600',
        fontStyle: 'normal'
      };
    }

    setElements(prev => [...prev, newElem]);
    setSelectedElementId(newElem.id);
    setEditingElementId(newElem.id);
    if (activeTool !== 'select') setActiveTool('select');
  };

  // Canvas Click Handler
  const handleCanvasClick = (e) => {
    // If clicked on an existing element, let element handler process it
    if (e.target.closest('.canvas-element')) return;
    
    if (activeTool === 'draw' || activeTool === 'highlight') return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(10, e.clientX - rect.left - 60);
    const y = Math.max(10, e.clientY - rect.top - 20);

    if (activeTool === 'sticky' || activeTool === 'text' || activeTool === 'shape') {
      spawnElementAtCoordinates(x, y);
    } else {
      // In Select Mode, clicking background deselects active element
      setSelectedElementId(null);
      setEditingElementId(null);
    }
  };

  // DOUBLE CLICK ANYWHERE ON CANVAS GRID -> Spawn Typable Text Box Immediately!
  const handleCanvasDoubleClick = (e) => {
    if (e.target.closest('.canvas-element')) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(10, e.clientX - rect.left - 40);
    const y = Math.max(10, e.clientY - rect.top - 15);
    spawnElementAtCoordinates(x, y, 'text');
  };

  // Freehand Draw Mouse Handlers
  const handleMouseDownCanvas = (e) => {
    if (activeTool === 'draw' || activeTool === 'highlight') {
      setIsDrawing(true);
      const rect = containerRef.current.getBoundingClientRect();
      const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setCurrentPath([pt]);
    }
  };

  const handleMouseMoveCanvas = (e) => {
    const rect = containerRef.current.getBoundingClientRect();

    if (isDrawing && (activeTool === 'draw' || activeTool === 'highlight')) {
      const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setCurrentPath(prev => [...prev, pt]);
      return;
    }

    if (draggedId) {
      const newX = Math.max(10, e.clientX - dragOffset.x);
      const newY = Math.max(10, e.clientY - dragOffset.y);

      setElements(prev => prev.map(el => {
        if (el.id === draggedId) {
          return { ...el, x: newX, y: newY };
        }
        return el;
      }));
    }
  };

  const handleMouseUpCanvas = () => {
    if (isDrawing) {
      setIsDrawing(false);
      if (currentPath.length >= 2) {
        setDrawings(prev => [
          ...prev,
          {
            id: `draw_${Date.now()}`,
            points: currentPath,
            color: brushColor,
            size: activeTool === 'highlight' ? 18 : brushSize,
            isHighlighter: activeTool === 'highlight'
          }
        ]);
      }
      setCurrentPath([]);
    }
    setDraggedId(null);
  };

  // Element Selection & Dragging Handlers
  const handleElementMouseDown = (e, elemId) => {
    e.stopPropagation();
    setSelectedElementId(elemId);

    if (activeTool === 'arrow') {
      if (!connectingFromId) {
        setConnectingFromId(elemId);
      } else if (connectingFromId !== elemId) {
        const newConn = { id: `conn_${Date.now()}`, from: connectingFromId, to: elemId };
        setConnections(prev => [...prev, newConn]);
        setConnectingFromId(null);
        setActiveTool('select');
      }
      return;
    }

    if (activeTool === 'select') {
      const elem = elements.find(el => el.id === elemId);
      if (elem) {
        setDraggedId(elemId);
        setDragOffset({
          x: e.clientX - elem.x,
          y: e.clientY - elem.y
        });
      }
    }
  };

  const handleElementDoubleClick = (e, elemId) => {
    e.stopPropagation();
    setSelectedElementId(elemId);
    setEditingElementId(elemId);
  };

  // Direct Text Change Handler for any element
  const handleTextChange = (elemId, newText) => {
    setElements(prev => prev.map(el => {
      if (el.id === elemId) {
        return { ...el, text: newText };
      }
      return el;
    }));
  };

  // Property Updates & Deletion
  const updateSelectedElement = (updates) => {
    if (!selectedElementId) return;
    setElements(prev => prev.map(el => {
      if (el.id === selectedElementId) {
        return { ...el, ...updates };
      }
      return el;
    }));
  };

  const handleDeleteSelected = () => {
    if (!selectedElementId) return;
    setElements(prev => prev.filter(el => el.id !== selectedElementId));
    setConnections(prev => prev.filter(c => c.from !== selectedElementId && c.to !== selectedElementId));
    setSelectedElementId(null);
    setEditingElementId(null);
  };

  const handleClearEntireCanvas = () => {
    if (window.confirm("Clear all whiteboard notes, drawings, shapes, and connections?")) {
      setElements([]);
      setDrawings([]);
      setConnections([]);
      setSelectedElementId(null);
      setEditingElementId(null);
      localStorage.removeItem('srw_canvas_elements_v4');
      localStorage.removeItem('srw_canvas_drawings_v4');
      localStorage.removeItem('srw_canvas_connections_v4');
    }
  };

  const handleInsertPaperCard = (paper) => {
    const newElem = {
      id: `paper_${paper.id || Date.now()}`,
      type: 'paper',
      title: paper.title,
      text: paper.abstract ? paper.abstract.slice(0, 120) + '...' : 'Indexed paper entry.',
      authors: paper.authors ? paper.authors.map(a => a.name).join(', ') : 'Authors N/A',
      venue: paper.venue || 'ArXiv',
      year: paper.publication_year || 2024,
      paperData: paper,
      x: 150 + (elements.length % 4) * 40,
      y: 150 + (elements.length % 4) * 30,
      width: 260,
      height: 150,
      bgColor: '#ffffff',
      textColor: '#0f172a'
    };
    setElements(prev => [...prev, newElem]);
    setShowPaperModal(false);
    setSelectedElementId(newElem.id);
  };

  const selectedElement = elements.find(el => el.id === selectedElementId);

  return (
    <div
      ref={containerRef}
      onClick={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMoveCanvas}
      onMouseUp={handleMouseUpCanvas}
      className="research-canvas"
      style={{
        flex: 1,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '700px',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        cursor: activeTool === 'draw' || activeTool === 'highlight' ? 'crosshair' : activeTool !== 'select' ? 'pointer' : 'default'
      }}
    >
      {/* Infinite Grid Background */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
        backgroundSize: '24px 24px',
        opacity: 0.65,
        pointerEvents: 'none'
      }} />

      {/* TOP FLOATING TOOLBAR */}
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.08)'
      }}>
        {/* Select Tool */}
        <button
          onClick={() => setActiveTool('select')}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'select' ? '#eff6ff' : 'transparent', color: activeTool === 'select' ? '#2563eb' : '#475569'
          }}
          title="Select & Move Tool (Double-click anywhere to type text)"
        >
          <MousePointer size={16} />
          <span>Select</span>
        </button>

        <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />

        {/* Sticky Note Tool */}
        <button
          onClick={() => setActiveTool('sticky')}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'sticky' ? '#fef9c3' : 'transparent', color: activeTool === 'sticky' ? '#854d0e' : '#475569'
          }}
          title="Click anywhere to drop sticky note"
        >
          <StickyNote size={16} color="#d97706" />
          <span>Sticky Note</span>
        </button>

        {/* Text Tool */}
        <button
          onClick={() => setActiveTool('text')}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'text' ? '#eff6ff' : 'transparent', color: activeTool === 'text' ? '#2563eb' : '#475569'
          }}
          title="Click anywhere to insert text box"
        >
          <Type size={16} />
          <span>Text</span>
        </button>

        {/* Freehand Draw */}
        <button
          onClick={() => setActiveTool('draw')}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'draw' ? '#eff6ff' : 'transparent', color: activeTool === 'draw' ? '#2563eb' : '#475569'
          }}
          title="Freehand Draw Pen"
        >
          <PenTool size={16} />
          <span>Draw</span>
        </button>

        {/* Highlighter */}
        <button
          onClick={() => setActiveTool('highlight')}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'highlight' ? '#fef9c3' : 'transparent', color: activeTool === 'highlight' ? '#854d0e' : '#475569'
          }}
          title="Highlighter Brush"
        >
          <Highlighter size={16} color="#d97706" />
          <span>Highlight</span>
        </button>

        {/* Shape Dropdown Tool */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setActiveTool('shape')}
            style={{
              padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
              background: activeTool === 'shape' ? '#f3e8ff' : 'transparent', color: activeTool === 'shape' ? '#7e22ce' : '#475569'
            }}
          >
            <Square size={16} color="#9333ea" />
            <span>Shape</span>
          </button>
          {activeTool === 'shape' && (
            <select
              value={selectedShapeType}
              onChange={(e) => setSelectedShapeType(e.target.value)}
              style={{ fontSize: '0.78rem', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
              <option value="pill">Process Pill</option>
            </select>
          )}
        </div>

        {/* Arrow Connector Tool */}
        <button
          onClick={() => { setActiveTool('arrow'); setConnectingFromId(null); }}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'arrow' ? '#e0e7ff' : 'transparent', color: activeTool === 'arrow' ? '#3730a3' : '#475569'
          }}
          title="Click source node -> click target node to draw arrow"
        >
          <ArrowUpRight size={16} color="#4f46e5" />
          <span>{connectingFromId ? 'Click Target...' : 'Arrow Line'}</span>
        </button>

        {/* Insert Paper Tool */}
        <button
          onClick={() => setShowPaperModal(true)}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: '#ffe4e6', color: '#e11d48'
          }}
        >
          <FileText size={16} />
          <span>Insert Paper</span>
        </button>

        <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />

        {/* Color Palette & Brush Size Picker */}
        {(activeTool === 'draw' || activeTool === 'highlight') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {['#2563eb', '#16a34a', '#d97706', '#dc2626', '#9333ea', '#0f172a'].map(c => (
              <div
                key={c}
                onClick={() => setBrushColor(c)}
                style={{
                  width: '20px', height: '20px', borderRadius: '50%', background: c, cursor: 'pointer',
                  border: brushColor === c ? '2px solid #0f172a' : 'none'
                }}
              />
            ))}
          </div>
        )}

        {/* Reset Canvas Button */}
        <button
          onClick={handleClearEntireCanvas}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
          title="Clear Entire Canvas"
          onMouseOver={(e) => e.target.style.color = '#ef4444'}
          onMouseOut={(e) => e.target.style.color = '#94a3b8'}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* CONTEXTUAL FLOATING FORMATTING BAR (Positioned Directly Above Active Element) */}
      {selectedElement && activeTool === 'select' && (
        <div style={{
          position: 'absolute',
          left: `${Math.max(10, selectedElement.x)}px`,
          top: `${Math.max(10, selectedElement.y - 48)}px`,
          zIndex: 50,
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          animation: 'fadeIn 0.15s ease-out'
        }}>
          {/* Font Family Selector */}
          <select
            value={selectedElement.fontFamily || 'Inter'}
            onChange={(e) => updateSelectedElement({ fontFamily: e.target.value })}
            style={{ fontSize: '0.78rem', padding: '2px 6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          >
            <option value="Inter">Inter (Sans)</option>
            <option value="Outfit">Outfit (Heading)</option>
            <option value="JetBrains Mono">JetBrains Mono (Code)</option>
            <option value="Georgia">Georgia (Serif)</option>
          </select>

          {/* Font Size Selector */}
          <select
            value={selectedElement.fontSize || '16px'}
            onChange={(e) => updateSelectedElement({ fontSize: e.target.value })}
            style={{ fontSize: '0.78rem', padding: '2px 6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          >
            <option value="12px">12px</option>
            <option value="14px">14px</option>
            <option value="16px">16px</option>
            <option value="20px">20px</option>
            <option value="28px">28px</option>
          </select>

          {/* Bold / Italic Toggles */}
          <button
            onClick={() => updateSelectedElement({ fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold' })}
            style={{
              padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'pointer',
              background: selectedElement.fontWeight === 'bold' ? '#e0e7ff' : '#ffffff',
              color: selectedElement.fontWeight === 'bold' ? '#3730a3' : '#475569'
            }}
          >
            <Bold size={12} />
          </button>

          <button
            onClick={() => updateSelectedElement({ fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' })}
            style={{
              padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'pointer',
              background: selectedElement.fontStyle === 'italic' ? '#e0e7ff' : '#ffffff',
              color: selectedElement.fontStyle === 'italic' ? '#3730a3' : '#475569'
            }}
          >
            <Italic size={12} />
          </button>

          {/* Quick Color Swatches */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { bg: '#fef08a', text: '#854d0e' }, // Yellow
              { bg: '#bfdbfe', text: '#1e40af' }, // Blue
              { bg: '#bbf7d0', text: '#15803d' }, // Green
              { bg: '#e9d5ff', text: '#6b21a8' }, // Purple
              { bg: '#ffffff', text: '#0f172a' }  // White
            ].map((theme, i) => (
              <div
                key={i}
                onClick={() => updateSelectedElement({ bgColor: theme.bg, textColor: theme.text })}
                style={{
                  width: '16px', height: '16px', borderRadius: '50%', background: theme.bg, border: '1px solid #cbd5e1', cursor: 'pointer'
                }}
              />
            ))}
          </div>

          <button
            onClick={handleDeleteSelected}
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.75rem', fontWeight: 600 }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {/* HTML5 DRAWING CANVAS OVERLAY */}
      <canvas
        ref={drawingCanvasRef}
        width={1400}
        height={900}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: activeTool === 'draw' || activeTool === 'highlight' ? 'auto' : 'none',
          zIndex: 15
        }}
      />

      {/* SVG CONNECTOR LINES OVERLAY */}
      <svg style={{ position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <polygon points="0 0, 8 4, 0 8" fill="#475569" />
          </marker>
        </defs>
        {connections.map((conn) => {
          const fromEl = elements.find(el => el.id === conn.from);
          const toEl = elements.find(el => el.id === conn.to);
          if (!fromEl || !toEl) return null;

          const x1 = fromEl.x + (fromEl.width || 180) / 2;
          const y1 = fromEl.y + (fromEl.height || 80) / 2;
          const x2 = toEl.x + (toEl.width || 180) / 2;
          const y2 = toEl.y + (toEl.height || 80) / 2;

          return (
            <line
              key={conn.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#475569"
              strokeWidth="2.5"
              strokeDasharray="4 4"
              markerEnd="url(#arrowhead)"
            />
          );
        })}
      </svg>

      {/* CANVAS EMPTY STATE GUIDE */}
      {elements.length === 0 && drawings.length === 0 && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          textAlign: 'center', color: '#94a3b8', zIndex: 5, maxWidth: '440px', pointerEvents: 'none'
        }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <Sparkles size={32} color="#2563eb" />
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
            Tap Anywhere to Type & Sketch
          </h3>
          <p style={{ fontSize: '0.88rem', color: '#64748b', lineHeight: 1.5 }}>
            Double-click anywhere on the canvas grid to instantly spawn a typable text box, drop sticky notes, freehand draw, or insert paper cards!
          </p>
        </div>
      )}

      {/* RENDER DRAGGABLE & TYPABLE ELEMENTS */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, pointerEvents: 'none' }}>
        {elements.map((el) => {
          const isSelected = selectedElementId === el.id;
          const isEditing = editingElementId === el.id;

          return (
            <div
              key={el.id}
              className="canvas-element"
              onMouseDown={(e) => handleElementMouseDown(e, el.id)}
              onDoubleClick={(e) => handleElementDoubleClick(e, el.id)}
              style={{
                position: 'absolute',
                left: `${el.x}px`,
                top: `${el.y}px`,
                width: `${el.width || 220}px`,
                minHeight: `${el.height || 50}px`,
                background: el.bgColor || '#ffffff',
                color: el.textColor || '#0f172a',
                fontFamily: el.fontFamily || 'Inter',
                fontSize: el.fontSize || '16px',
                fontWeight: el.fontWeight || 'normal',
                fontStyle: el.fontStyle || 'normal',
                borderRadius: el.shapeType === 'circle' ? '50%' : el.shapeType === 'pill' ? '30px' : '10px',
                border: isSelected ? '2px solid #2563eb' : '1px solid rgba(0,0,0,0.12)',
                padding: '10px',
                boxShadow: isSelected ? '0 0 16px rgba(37, 99, 235, 0.25)' : '0 2px 8px rgba(0,0,0,0.06)',
                cursor: activeTool === 'select' ? 'move' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: el.shapeType === 'circle' ? 'center' : 'flex-start',
                pointerEvents: 'auto'
              }}
            >
              {el.type === 'paper' ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#e11d48', fontSize: '0.72rem', fontWeight: 700, marginBottom: '4px' }}>
                    <FileText size={14} />
                    <span>Research Paper</span>
                  </div>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.3, marginBottom: '4px' }}>
                    {el.title}
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '8px' }}>
                    {el.authors} ({el.year})
                  </p>
                  <button
                    className="btn-subtle"
                    onClick={() => el.paperData && onInspectPaper(el.paperData)}
                    style={{ width: '100%', padding: '3px', fontSize: '0.72rem', justifyContent: 'center' }}
                  >
                    Inspect Vectors
                  </button>
                </div>
              ) : (
                /* INSTANT TYPABLE TEXTAREA */
                <textarea
                  ref={isEditing ? activeInputRef : null}
                  value={el.text}
                  placeholder="Type text..."
                  onMouseDown={(e) => e.stopPropagation()} // Stop drag when clicking inside textarea to type!
                  onChange={(e) => handleTextChange(el.id, e.target.value)}
                  onFocus={() => { setSelectedElementId(el.id); setEditingElementId(el.id); }}
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: '40px',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    color: el.textColor || 'inherit',
                    fontFamily: el.fontFamily || 'inherit',
                    fontSize: el.fontSize || 'inherit',
                    fontWeight: el.fontWeight || 'inherit',
                    fontStyle: el.fontStyle || 'inherit',
                    textAlign: el.shapeType === 'circle' ? 'center' : 'left'
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* PAPER INSERTION MODAL */}
      {showPaperModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="ui-card" style={{ width: '480px', maxHeight: '80vh', padding: '24px', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                Insert Paper onto Whiteboard
              </h3>
              <button onClick={() => setShowPaperModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#64748b" /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {libraryPapers && libraryPapers.length > 0 ? (
                libraryPapers.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleInsertPaperCard(p)}
                    style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', background: '#f8fafc', transition: 'all 0.15s ease' }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = '#2563eb'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                  >
                    <h5 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{p.title}</h5>
                    <p style={{ fontSize: '0.78rem', color: '#64748b' }}>{p.publication_year || '2024'} • {p.venue || 'ArXiv'}</p>
                  </div>
                ))
              ) : (
                <p style={{ fontSize: '0.88rem', color: '#64748b', textAlign: 'center', padding: '20px' }}>
                  No papers found in your workspace library. Search for papers in the Literature Search tab to ingest them!
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
