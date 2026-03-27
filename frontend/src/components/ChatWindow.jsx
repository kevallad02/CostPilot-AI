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
  const [messages, setMessages] = useState([WELCOME]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => uuidv4());
  const [summary, setSummary] = useState({ items: [], total: 0 });
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function refreshSummary(sid) {
    try {
      const data = await fetchSummary(sid);
      setSummary(data);
    } catch {
      // Non-critical – sidebar will just not update
    }
  }

  async function handleSend(text) {
    const userMsg = { id: Date.now(), role: 'user', text, time: timestamp() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await sendMessage(text, sessionId);

      // Server may assign a new session if ours was invalid
      if (res.session_id && res.session_id !== sessionId) {
        setSessionId(res.session_id);
      }

      const botMsg = {
        id: Date.now() + 1,
        role: 'bot',
        text: res.reply,
        time: timestamp(),
      };
      setMessages((prev) => [...prev, botMsg]);

      // Refresh sidebar if the action mutated data
      if (['estimate', 'add', 'total', 'summary'].includes(res.parsed?.action)) {
        await refreshSummary(res.session_id || sessionId);
      }
    } catch (err) {
      const errMsg =
        err.response?.data?.error || 'Something went wrong. Please try again.';
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
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Inter, sans-serif' }}>
      {/* Chat panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #e2e8f0',
            background: '#2563eb',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>CostPilot AI</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Construction Cost Estimator</div>
          </div>
          <button
            onClick={handleReset}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff',
              padding: '6px 14px',
              borderRadius: 20,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            New Session
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            background: '#f8fafc',
          }}
        >
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
              <div
                style={{
                  padding: '10px 16px',
                  background: '#f1f5f9',
                  borderRadius: '4px 16px 16px 16px',
                  fontSize: 20,
                  letterSpacing: 4,
                  color: '#94a3b8',
                }}
              >
                ···
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <InputBar onSend={handleSend} disabled={loading} />
      </div>

      {/* Sidebar */}
      <CostSummary summary={summary} />
    </div>
  );
}
