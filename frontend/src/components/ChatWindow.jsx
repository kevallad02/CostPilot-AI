import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import CostSummary from './CostSummary';
import { sendMessage, fetchSummary } from '../api/chatApi';

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const WELCOME = {
  id: 'welcome',
  role: 'bot',
  text:
    'Hi! I am CostPilot AI.\n\n' +
    'Try asking:\n' +
    '• "Estimate 20 cubic meter concrete"\n' +
    '• "Add 500 kg steel"\n' +
    '• "What is the total cost?"\n' +
    '• "Show me the breakdown"',
  time: timestamp(),
};

export default function ChatWindow() {
  const [messages, setMessages]     = useState([WELCOME]);
  const [loading, setLoading]       = useState(false);
  const [sessionId, setSessionId]   = useState(() => uuidv4());
  const [summary, setSummary]       = useState({ items: [], total: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function refreshSummary(sid) {
    try {
      const data = await fetchSummary(sid);
      setSummary(data);
    } catch {
      // Non-critical
    }
  }

  async function handleSend(text) {
    const userMsg = { id: Date.now(), role: 'user', text, time: timestamp() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await sendMessage(text, sessionId);

      if (res.session_id && res.session_id !== sessionId) {
        setSessionId(res.session_id);
      }

      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'bot', text: res.reply, time: timestamp() },
      ]);

      if (['estimate', 'add', 'total', 'summary'].includes(res.parsed?.action)) {
        await refreshSummary(res.session_id || sessionId);
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Something went wrong. Please try again.';
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'bot', text: errMsg, time: timestamp(), isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSessionId(uuidv4());
    setMessages([WELCOME]);
    setSummary({ items: [], total: 0 });
    setSidebarOpen(false);
  }

  return (
    <div className="app-shell">
      {/* Mobile backdrop */}
      <div
        className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Chat panel */}
      <div className="chat-panel">
        {/* Header */}
        <div className="chat-header">
          <div>
            <div className="chat-header-title">CostPilot AI</div>
            <div className="chat-header-sub">Construction Cost Estimator</div>
          </div>
          <div className="header-actions">
            {/* Summary button – mobile only (hidden on desktop via CSS) */}
            <button
              className="btn-ghost btn-summary-toggle"
              onClick={() => setSidebarOpen((o) => !o)}
            >
              💰 {summary.total > 0 ? `$${Number(summary.total).toFixed(0)}` : 'Summary'}
            </button>
            <button className="btn-ghost" onClick={handleReset}>
              New Session
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="messages-area">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {loading && (
            <div className="typing-indicator">
              <div className="typing-bubble">···</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <InputBar onSend={handleSend} disabled={loading} />
      </div>

      {/* Sidebar – fixed bottom sheet on mobile, right panel on desktop */}
      <CostSummary
        summary={summary}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
    </div>
  );
}
