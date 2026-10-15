import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MousePointer, StickyNote, Type, PenTool, Highlighter, Square,
  ArrowUpRight, FileText, Trash2, Sparkles, X, Bold, Italic, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Eraser, Search
} from 'lucide-react';

const DEFAULT_PROJECT_ID = 'workspace-default';

function projectStorageKey(key, projectId) {
  return projectId === DEFAULT_PROJECT_ID ? key : `${key}_${projectId}`;
}

function readStoredItems(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export default function ResearchCanvas({ libraryPapers, onInspectPaper, onCanvasChange, addPaperRequest, projectId = DEFAULT_PROJECT_ID }) {
  const elementsKey = projectStorageKey('srw_canvas_elements_v4', projectId);
  const drawingsKey = projectStorageKey('srw_canvas_drawings_v4', projectId);
  const connectionsKey = projectStorageKey('srw_canvas_connections_v4', projectId);

  // Canvas elements state (persistent via localStorage)
  const [elements, setElements] = useState(() => readStoredItems(elementsKey));

  // Freehand drawing paths state
  const [drawings, setDrawings] = useState(() => readStoredItems(drawingsKey));

  // Connections state
  const [connections, setConnections] = useState(() => readStoredItems(connectionsKey));
  const [zoom, setZoom] = useState(100);
  const [, setHistoryVersion] = useState(0);

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
  const [paperFilter, setPaperFilter] = useState('');

  const containerRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const activeInputRef = useRef(null);
  const processedPaperRequest = useRef(null);
  const historyRef = useRef({ past: [], future: [], snapshot: null, isDragging: false, dragStart: null });
  const [drawingSurfaceSize, setDrawingSurfaceSize] = useState({ width: 0, height: 0 });

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(elementsKey, JSON.stringify(elements));
    onCanvasChange?.();
  }, [elements, elementsKey, onCanvasChange]);

  useEffect(() => {
    localStorage.setItem(drawingsKey, JSON.stringify(drawings));
    onCanvasChange?.();
  }, [drawings, drawingsKey, onCanvasChange]);

  useEffect(() => {
    localStorage.setItem(connectionsKey, JSON.stringify(connections));
    onCanvasChange?.();
  }, [connections, connectionsKey, onCanvasChange]);

  // Keep a bounded history for reversible canvas edits.
  useEffect(() => {
    const snapshot = JSON.stringify({ elements, drawings, connections });
    const history = historyRef.current;
    if (history.snapshot === null) {
      history.snapshot = snapshot;
      return;
    }
    if (history.snapshot === snapshot) return;
    if (history.isDragging) {
      history.snapshot = snapshot;
      return;
    }
    history.past.push(history.snapshot);
    if (history.past.length > 60) history.past.shift();
    history.future = [];
    history.snapshot = snapshot;
    setHistoryVersion(version => version + 1);
  }, [elements, drawings, connections]);

  const applyHistorySnapshot = useCallback((direction) => {
    const history = historyRef.current;
    const source = direction === 'undo' ? history.past : history.future;
    if (!source.length) return;
    const destination = direction === 'undo' ? history.future : history.past;
    destination.push(JSON.stringify({ elements, drawings, connections }));
    const snapshot = source.pop();
    const restored = JSON.parse(snapshot);
    history.snapshot = snapshot;
    setElements(restored.elements);
    setDrawings(restored.drawings);
    setConnections(restored.connections);
    setSelectedElementId(null);
    setEditingElementId(null);
    setHistoryVersion(version => version + 1);
  }, [elements, drawings, connections]);

  const undo = useCallback(() => applyHistorySnapshot('undo'), [applyHistorySnapshot]);
  const redo = useCallback(() => applyHistorySnapshot('redo'), [applyHistorySnapshot]);

  useEffect(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return undefined;

    const resizeSurface = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
      canvas.getContext('2d')?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      setDrawingSurfaceSize({ width: rect.width, height: rect.height });
    };

    const observer = new ResizeObserver(resizeSurface);
    observer.observe(canvas);
    resizeSurface();
    return () => observer.disconnect();
  }, []);

  // Auto-focus active input when editing starts
  useEffect(() => {
    if (editingElementId && activeInputRef.current) {
      activeInputRef.current.focus();
      if (['New Sticky Note', 'Type text here...'].includes(activeInputRef.current.value)) {
        activeInputRef.current.select();
      }
    }
  }, [editingElementId]);

  // Global Keyboard Shortcuts (Delete, Escape)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable || e.altKey) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId) {
          handleDeleteSelected();
        }
      } else if (e.key === 'Escape') {
        setSelectedElementId(null);
        setEditingElementId(null);
        setActiveTool('select');
        setConnectingFromId(null);
      } else {
        const toolShortcuts = { v: 'select', n: 'sticky', t: 'text', d: 'draw', h: 'highlight', a: 'arrow' };
        const nextTool = toolShortcuts[e.key.toLowerCase()];
        if (nextTool) setActiveTool(nextTool);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementId, undo, redo]);

  // Redraw freehand paths on HTML5 canvas overlay
  useEffect(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

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
  }, [drawings, currentPath, brushColor, brushSize, activeTool, drawingSurfaceSize]);

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

  const clampElementPosition = (x, y, width = 220, height = 140) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    const scale = zoom / 100;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, ((bounds?.width || width) / scale) - width - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, ((bounds?.height || height) / scale) - height - 8))
    };
  };

  const canvasPoint = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    const scale = zoom / 100;
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  // Canvas Click Handler
  const handleCanvasClick = (e) => {
    // If clicked on an existing element, let element handler process it
    if (e.target.closest('.canvas-element')) return;
    
    if (activeTool === 'draw' || activeTool === 'highlight') return;

    const point = canvasPoint(e.clientX, e.clientY);
    const x = point.x - 60;
    const y = point.y - 20;

    if (activeTool === 'sticky' || activeTool === 'text' || activeTool === 'shape') {
      const [width, height] = activeTool === 'sticky' ? [190, 140] : activeTool === 'shape' ? [170, 90] : [220, 50];
      const position = clampElementPosition(x, y, width, height);
      spawnElementAtCoordinates(position.x, position.y);
    } else {
      // In Select Mode, clicking background deselects active element
      setSelectedElementId(null);
      setEditingElementId(null);
    }
  };

  // DOUBLE CLICK ANYWHERE ON CANVAS GRID -> Spawn Typable Text Box Immediately!
  const handleCanvasDoubleClick = (e) => {
    if (e.target.closest('.canvas-element')) return;
    const point = canvasPoint(e.clientX, e.clientY);
    const position = clampElementPosition(point.x - 40, point.y - 15, 220, 50);
    const x = position.x;
    const y = position.y;
    spawnElementAtCoordinates(x, y, 'text');
  };

  // Freehand Draw Mouse Handlers
  const handleMouseDownCanvas = (e) => {
    if (activeTool === 'draw' || activeTool === 'highlight') {
      setIsDrawing(true);
      const pt = canvasPoint(e.clientX, e.clientY);
      setCurrentPath([pt]);
    }
  };

  const handleMouseMoveCanvas = (e) => {
    if (isDrawing && (activeTool === 'draw' || activeTool === 'highlight')) {
      const pt = canvasPoint(e.clientX, e.clientY);
      setCurrentPath(prev => [...prev, pt]);
      return;
    }

    if (draggedId) {
      const draggedElement = elements.find(el => el.id === draggedId);
      const point = canvasPoint(e.clientX, e.clientY);
      const position = clampElementPosition(
        point.x - dragOffset.x,
        point.y - dragOffset.y,
        draggedElement?.width || 220,
        draggedElement?.height || 50
      );

      setElements(prev => prev.map(el => {
        if (el.id === draggedId) {
          return { ...el, x: position.x, y: position.y };
        }
        return el;
      }));
    }
  };

  const handleMouseUpCanvas = useCallback(() => {
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
  }, [isDrawing, currentPath, brushColor, activeTool, brushSize]);

  useEffect(() => {
    const finishPointerAction = () => {
      if (isDrawing) handleMouseUpCanvas();
      if (draggedId) {
        const history = historyRef.current;
        const snapshot = JSON.stringify({ elements, drawings, connections });
        if (history.dragStart && history.dragStart !== snapshot) {
          history.past.push(history.dragStart);
          if (history.past.length > 60) history.past.shift();
          history.future = [];
          history.snapshot = snapshot;
          setHistoryVersion(version => version + 1);
        }
        history.isDragging = false;
        history.dragStart = null;
        setDraggedId(null);
      }
    };
    window.addEventListener('mouseup', finishPointerAction);
    return () => window.removeEventListener('mouseup', finishPointerAction);
  }, [isDrawing, draggedId, handleMouseUpCanvas, elements, drawings, connections]);

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
        historyRef.current.isDragging = true;
        historyRef.current.dragStart = JSON.stringify({ elements, drawings, connections });
        setDraggedId(elemId);
        const point = canvasPoint(e.clientX, e.clientY);
        setDragOffset({
          x: point.x - elem.x,
          y: point.y - elem.y
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
      localStorage.removeItem(elementsKey);
      localStorage.removeItem(drawingsKey);
      localStorage.removeItem(connectionsKey);
    }
  };

  const handleInsertPaperCard = useCallback((paper) => {
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
  }, [elements.length]);

  useEffect(() => {
    if (!addPaperRequest || addPaperRequest.projectId !== projectId || processedPaperRequest.current === addPaperRequest.id) return;
    processedPaperRequest.current = addPaperRequest.id;
    handleInsertPaperCard(addPaperRequest.paper);
  }, [addPaperRequest, projectId, handleInsertPaperCard]);

  const selectedElement = elements.find(el => el.id === selectedElementId);
  const filteredLibraryPapers = (libraryPapers || []).filter(paper => {
    const authors = Array.isArray(paper.authors) ? paper.authors : [];
    const searchable = `${paper.title || ''} ${paper.publication_year || ''} ${authors.map(author => typeof author === 'string' ? author : author?.name || '').join(' ')}`;
    return searchable.toLowerCase().includes(paperFilter.trim().toLowerCase());
  });

  return (
    <div
      ref={containerRef}
      onClick={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMoveCanvas}
      className="research-canvas"
      style={{
        flex: 1,
        background: '#fffefa',
        border: '1px solid #e6e0d7',
        borderRadius: '15px',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        cursor: activeTool === 'draw' || activeTool === 'highlight' ? 'crosshair' : activeTool !== 'select' ? 'pointer' : 'default'
      }}
    >
      {/* Infinite Grid Background */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: 'radial-gradient(#d9d1c5 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        opacity: 0.42,
        pointerEvents: 'none'
      }} />

      {/* TOP FLOATING TOOLBAR */}
      <div className="canvas-toolbar" style={{
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
          className={`canvas-tool-button ${activeTool === 'select' ? 'is-active' : ''}`}
          onClick={() => setActiveTool('select')}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'select' ? '#e6f0eb' : 'transparent', color: activeTool === 'select' ? '#38685c' : '#475569'
          }}
          title="Select & Move Tool (Double-click anywhere to type text)"
        >
          <MousePointer size={16} />
          <span>Select</span>
        </button>

          <button type="button" className="canvas-utility-button" onClick={undo} disabled={!historyRef.current.past.length} title="Undo (Ctrl/⌘ Z)" aria-label="Undo canvas change">
          <Undo2 size={16} />
        </button>
        <button type="button" className="canvas-utility-button" onClick={redo} disabled={!historyRef.current.future.length} title="Redo (Ctrl/⌘ Shift Z)" aria-label="Redo canvas change">
          <Redo2 size={16} />
        </button>

        <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />

        {/* Sticky Note Tool */}
        <button
          className={`canvas-tool-button ${activeTool === 'sticky' ? 'is-active' : ''}`}
          onClick={() => setActiveTool('sticky')}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'sticky' ? '#fae8df' : 'transparent', color: activeTool === 'sticky' ? '#99563e' : '#475569'
          }}
          title="Click anywhere to drop sticky note"
        >
          <StickyNote size={16} color="#d97706" />
          <span>Sticky Note</span>
        </button>

        {/* Text Tool */}
        <button
          className={`canvas-tool-button ${activeTool === 'text' ? 'is-active' : ''}`}
          onClick={() => setActiveTool('text')}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'text' ? '#e6f0eb' : 'transparent', color: activeTool === 'text' ? '#38685c' : '#475569'
          }}
          title="Click anywhere to insert text box"
        >
          <Type size={16} />
          <span>Text</span>
        </button>

        {/* Freehand Draw */}
        <button
          className={`canvas-tool-button ${activeTool === 'draw' ? 'is-active' : ''}`}
          onClick={() => setActiveTool('draw')}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'draw' ? '#e6f0eb' : 'transparent', color: activeTool === 'draw' ? '#38685c' : '#475569'
          }}
          title="Freehand Draw Pen"
        >
          <PenTool size={16} />
          <span>Draw</span>
        </button>

        {/* Highlighter */}
        <button
          className={`canvas-tool-button ${activeTool === 'highlight' ? 'is-active' : ''}`}
          onClick={() => setActiveTool('highlight')}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'highlight' ? '#fae8df' : 'transparent', color: activeTool === 'highlight' ? '#99563e' : '#475569'
          }}
          title="Highlighter Brush"
        >
          <Highlighter size={16} color="#d97706" />
          <span>Highlight</span>
        </button>

        {/* Shape Dropdown Tool */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            className={`canvas-tool-button ${activeTool === 'shape' ? 'is-active' : ''}`}
            onClick={() => setActiveTool('shape')}
            style={{
              padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
              background: activeTool === 'shape' ? '#e6f0eb' : 'transparent', color: activeTool === 'shape' ? '#38685c' : '#475569'
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
          className={`canvas-tool-button ${activeTool === 'arrow' ? 'is-active' : ''}`}
          onClick={() => { setActiveTool('arrow'); setConnectingFromId(null); }}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: activeTool === 'arrow' ? '#e6f0eb' : 'transparent', color: activeTool === 'arrow' ? '#38685c' : '#475569'
          }}
          title="Click source node -> click target node to draw arrow"
        >
          <ArrowUpRight size={16} color="#4f46e5" />
          <span>{connectingFromId ? 'Click Target...' : 'Arrow Line'}</span>
        </button>

        {/* Insert Paper Tool */}
        <button
          className="canvas-tool-button canvas-insert-paper"
          onClick={() => { setPaperFilter(''); setShowPaperModal(true); }}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600,
            background: '#fae8df', color: '#99563e'
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
        <button
          className="canvas-utility-button"
          onClick={() => setDrawings([])}
          disabled={drawings.length === 0}
          title="Clear drawings"
          aria-label="Clear drawings"
        >
          <Eraser size={15} />
        </button>
        <div className="canvas-zoom-control" aria-label={`Canvas zoom ${zoom}%`}>
          <button className="canvas-utility-button" onClick={() => setZoom(value => Math.max(50, value - 10))} title="Zoom out" aria-label="Zoom out"><ZoomOut size={15} /></button>
          <span>{zoom}%</span>
          <button className="canvas-utility-button" onClick={() => setZoom(value => Math.min(150, value + 10))} title="Zoom in" aria-label="Zoom in"><ZoomIn size={15} /></button>
          <button className="canvas-utility-button" onClick={() => setZoom(100)} title="Reset zoom" aria-label="Reset zoom"><Maximize2 size={14} /></button>
        </div>
      </div>

      {/* CONTEXTUAL FLOATING FORMATTING BAR (Positioned Directly Above Active Element) */}
      {selectedElement && activeTool === 'select' && (
        <div style={{
          position: 'absolute',
          left: `${Math.max(10, selectedElement.x * zoom / 100)}px`,
          top: `${Math.max(10, selectedElement.y * zoom / 100 - 48)}px`,
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
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: `scale(${zoom / 100})`, transformOrigin: 'top left',
          pointerEvents: activeTool === 'draw' || activeTool === 'highlight' ? 'auto' : 'none',
          zIndex: 15
        }}
      />

      {/* SVG CONNECTOR LINES OVERLAY */}
      <svg style={{ position: 'absolute', width: '100%', height: '100%', transform: `scale(${zoom / 100})`, transformOrigin: 'top left', pointerEvents: 'none', zIndex: 10 }}>
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
        <div className="canvas-empty-state" style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          textAlign: 'center', color: '#94a3b8', zIndex: 5, maxWidth: '480px'
        }}>
          <div className="canvas-empty-mark"><Sparkles size={23} /></div>
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 500, color: '#192638', marginBottom: '10px' }}>
            Your research, <em style={{ color: '#d98669', fontStyle: 'normal' }}>visually.</em>
          </h3>
          <p style={{ fontSize: '0.92rem', color: '#748196', lineHeight: 1.65, marginBottom: '20px' }}>
            Add a thought, sketch a connection, or bring a paper into your research map.
          </p>
          <div className="canvas-empty-actions">
            <button className="canvas-start-button" onClick={(event) => {
              event.stopPropagation();
              spawnElementAtCoordinates(containerRef.current.clientWidth / (2 * zoom / 100) - 95, containerRef.current.clientHeight / (2 * zoom / 100) - 60, 'sticky');
            }}>
              <StickyNote size={16} /> Start with a note
            </button>
            <button className="canvas-paper-button" onClick={(event) => { event.stopPropagation(); setPaperFilter(''); setShowPaperModal(true); }}>
              <FileText size={16} /> Add a paper
            </button>
          </div>
          <p className="canvas-shortcut-note">Double-click to add text · N note · T text · D draw · V select · Ctrl/⌘ Z undo</p>
        </div>
      )}

      {/* RENDER DRAGGABLE & TYPABLE ELEMENTS */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, pointerEvents: 'none', transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}>
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
        <div onClick={(event) => event.stopPropagation()} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(25, 38, 56, 0.28)', backdropFilter: 'blur(3px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="ui-card" style={{ width: '480px', maxHeight: '80vh', padding: '24px', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                Insert Paper onto Whiteboard
              </h3>
              <button onClick={() => setShowPaperModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#64748b" /></button>
            </div>

            <label className="canvas-paper-search">
              <Search size={16} aria-hidden="true" />
              <input
                autoFocus
                type="search"
                placeholder="Find a saved paper by title, author, or year"
                value={paperFilter}
                onChange={(event) => setPaperFilter(event.target.value)}
              />
            </label>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredLibraryPapers.length > 0 ? (
                filteredLibraryPapers.map((p) => (
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
                  {paperFilter.trim() ? 'No saved papers match that search.' : 'No papers found in your workspace library. Search for papers in the Literature Search tab to ingest them!'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
