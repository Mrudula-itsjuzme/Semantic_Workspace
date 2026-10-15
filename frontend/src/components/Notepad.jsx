import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

export default function Notepad({ onClose }) {
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote(localStorage.getItem('srw_quick_notes') || '');
  }, []);

  const handleChange = (e) => {
    setNote(e.target.value);
    localStorage.setItem('srw_quick_notes', e.target.value);
  };

  return (
    <div style={{
      position: 'absolute',
      top: 'calc(100% + 10px)',
      right: 0,
      width: '320px',
      background: '#fff',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-lg)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-color)',
        background: '#f8fafc'
      }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>Quick Notepad</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
          <X size={14} />
        </button>
      </div>
      <textarea
        value={note}
        onChange={handleChange}
        placeholder="Jot down quick thoughts here..."
        style={{
          width: '100%',
          height: '250px',
          padding: '12px',
          border: 'none',
          resize: 'none',
          outline: 'none',
          fontSize: '0.85rem',
          fontFamily: 'var(--font-body)',
          color: '#1e293b',
          background: '#fffefa'
        }}
      />
    </div>
  );
}
