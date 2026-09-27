import { Sparkles, User } from 'lucide-react';
import { clsx } from 'clsx';

const SOURCE_LABELS = {
  rasa: 'Visites',
  rag: 'Médicaments',
  error: 'Indisponible',
};

const formatTime = (dateObj) => {
  const date = new Date(dateObj);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const formatText = (text) => {
  if (!text) return '';
  const lines = text.split('\n');
  return lines.map((line, index) => (
    <span key={`${index}-${line}`}>
      {line}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));
};

const MessageBubble = ({ message }) => {
  const isUser = message.sender === 'user';

  return (
    <div className={clsx('message-row', isUser ? 'user' : 'bot')}>
      {!isUser && (
        <div className="avatar bot" aria-hidden="true">
          <Sparkles size={16} />
        </div>
      )}
      <div className="bubble-wrapper">
        <div className={clsx('bubble', isUser ? 'user' : 'bot', message.isError && 'error')}>
          {formatText(message.text)}
        </div>
        <div className="bubble-meta">
          <span>{formatTime(message.time)}</span>
          {!isUser && SOURCE_LABELS[message.source] ? <span>{SOURCE_LABELS[message.source]}</span> : null}
        </div>
      </div>
      {isUser && (
        <div className="avatar user" aria-hidden="true">
          <User size={16} />
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
