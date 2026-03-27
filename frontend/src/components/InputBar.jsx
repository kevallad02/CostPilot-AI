import { useState } from 'react';

const EXAMPLES = [
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
    if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e);
  }

  const placeholder = EXAMPLES[Math.floor(Date.now() / 10000) % EXAMPLES.length];

  return (
    <form className="input-bar" onSubmit={handleSubmit}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button type="submit" className="btn-send" disabled={!text.trim() || disabled}>
        {disabled ? '···' : 'Send'}
      </button>
    </form>
  );
}
