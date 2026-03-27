function formatText(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part.split('\n').map((line, j, arr) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </span>
    ));
  });
}

export default function MessageBubble({ message }) {
  const isBot   = message.role === 'bot';
  const isError = message.isError;

  const bubbleClass = `bubble ${isError ? 'error' : isBot ? 'bot' : 'user'}`;

  return (
    <div className={`message-row ${isBot ? 'bot' : 'user'}`}>
      {isBot && <div className="bot-avatar">AI</div>}
      <div className={bubbleClass}>
        {isBot ? formatText(message.text) : message.text}
        <div className={`bubble-time ${isBot ? 'bot' : 'user'}`}>{message.time}</div>
      </div>
    </div>
  );
}
