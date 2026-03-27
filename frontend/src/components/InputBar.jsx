import { useState } from 'react';

const PLACEHOLDER_EXAMPLES = [
  'Estimate 20 cubic meter concrete',
  'Add 500 kg steel',
  'What is the total cost?',
  'Show me the breakdown',
];

export default function InputBar({ onSend, disabled }) {
  const [text, setText] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  }

  const placeholder =
    PLACEHOLDER_EXAMPLES[Math.floor(Date.now() / 10000) % PLACEHOLDER_EXAMPLES.length];

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        gap: 8,
        padding: '12px 16px',
        borderTop: '1px solid #e2e8f0',
        background: '#fff',
      }}
    >
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          padding: '10px 14px',
          border: '1px solid #cbd5e1',
          borderRadius: 24,
          fontSize: 14,
          outline: 'none',
          background: disabled ? '#f8fafc' : '#fff',
          color: '#1e293b',
          transition: 'border-color 0.2s',
        }}
        onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
        onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
      />
      <button
        type="submit"
        disabled={!text.trim() || disabled}
        style={{
          padding: '10px 20px',
          background: !text.trim() || disabled ? '#94a3b8' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 24,
          fontSize: 14,
          fontWeight: 600,
          cursor: !text.trim() || disabled ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
          whiteSpace: 'nowrap',
        }}
      >
        {disabled ? '...' : 'Send'}
      </button>
    </form>
  );
}
