import React, { useState } from 'react';
import { Sparkles, Send, BookOpen, Quote, HelpCircle } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../api';

export default function AiAssistant({ papers }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: 'Hello! I am your Semantic Research Assistant. Ask me any technical question about your indexed papers, transformer models, or domain methodologies.',
      citations: []
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!question.trim() || isLoading) return;
    const userQ = question.trim();
    setQuestion('');

    setMessages(prev => [...prev, { sender: 'user', text: userQ }]);
    setIsLoading(true);

    try {
      const res = await axios.post(apiUrl('/api/ai/ask'), { question: userQ });
      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: res.data.answer,
          citations: res.data.citations || []
        }
      ]);
    } catch (err) {
      console.error("AI QA error:", err);
      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: 'Apologies, an error occurred while searching vector chunks for your question. Ensure backend is running.',
          citations: []
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '650px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--accent-cyan), var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={20} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>Semantic RAG Assistant</h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Grounded Q&A powered by fastembed vector chunk retrieval
          </p>
        </div>
      </div>

      {/* Messages Stream */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: msg.sender === 'user' ? '80%' : '90%',
              background: msg.sender === 'user' ? 'linear-gradient(135deg, var(--primary), var(--primary-hover))' : '#f4f7fb',
              border: msg.sender === 'user' ? 'none' : '1px solid var(--border-color)',
              padding: '16px 20px',
              borderRadius: msg.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              color: msg.sender === 'user' ? '#ffffff' : 'var(--text-main)',
              fontSize: '0.92rem',
              lineHeight: 1.6
            }}
          >
            <p style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>

            {/* Render Context Citations */}
            {msg.citations && msg.citations.length > 0 && (
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Retrieved Vector Context Citations:
                </span>
                {msg.citations.map((c, ci) => (
                  <div key={ci} style={{ background: '#ffffff', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '8px', marginBottom: '6px', fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 600, color: '#4338ca', marginBottom: '2px' }}>
                      "{c.title}" ({c.year || 'N/A'}) — <span style={{ color: '#15803d' }}>{c.score != null ? `${c.score}% Relevance` : (c.relevance_score != null ? `${c.relevance_score}% Relevance` : '')}</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      "{c.snippet}"
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} className="pulse-glow" color="var(--accent-cyan)" />
            Retrieving vector chunks and formulating response...
          </div>
        )}
      </div>

      {/* Input Box */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
        <input
          type="text"
          className="glass-input"
          placeholder="Ask a question about your indexed papers..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          style={{ flex: 1, height: '48px' }}
        />
        <button
          className="btn-primary"
          onClick={handleSend}
          disabled={isLoading || !question.trim()}
          style={{ height: '48px', padding: '0 20px' }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
