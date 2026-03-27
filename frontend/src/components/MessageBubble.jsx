/**
 * MessageBubble – renders a single chat message.
 * Supports basic markdown-like bold (**text**) formatting in bot replies.
 */
function formatText(text) {
  // Replace **bold** with <strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    // Preserve newlines as line breaks
    return part.split('\n').map((line, j) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < part.split('\n').length - 1 && <br />}
      </span>
    ));
  });
}

export default function MessageBubble({ message }) {
  const isBot = message.role === 'bot';
  const isError = message.isError;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isBot ? 'flex-start' : 'flex-end',
        marginBottom: '12px',
      }}
    >
      {isBot && (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            marginRight: 8,
            flexShrink: 0,
            alignSelf: 'flex-end',
          }}
        >
          AI
        </div>
      )}

      <div
        style={{
          maxWidth: '72%',
          padding: '10px 14px',
          borderRadius: isBot ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
          background: isError ? '#fee2e2' : isBot ? '#f1f5f9' : '#2563eb',
          color: isError ? '#991b1b' : isBot ? '#1e293b' : '#fff',
          fontSize: 14,
          lineHeight: 1.6,
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
          wordBreak: 'break-word',
        }}
      >
        {isBot ? formatText(message.text) : message.text}
        <div
          style={{
            fontSize: 11,
            marginTop: 4,
            opacity: 0.55,
            textAlign: isBot ? 'left' : 'right',
          }}
        >
          {message.time}
        </div>
      </div>
    </div>
  );
}
