import { useEffect, useRef, useState } from 'react';

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function ChatView({ messages, pending, onSend, busy, onStop, onReset, placeholder }: { messages: ChatMsg[]; pending: string; onSend: (text: string) => void; busy: boolean; onStop?: () => void; onReset: () => void; placeholder?: string }) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: 'nearest' }), [messages, pending]);
  const send = () => {
    if (!input.trim() || busy) return;
    onSend(input.trim());
    setInput('');
  };
  return (
    <div className="chat">
      <div className="chat-log">
        {messages
          .filter((m) => m.role !== 'system')
          .map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.content}
            </div>
          ))}
        {busy && <div className="msg assistant">{pending || '…'}</div>}
        <div ref={endRef} />
      </div>
      <div className="row">
        <textarea
          rows={2}
          value={input}
          placeholder={placeholder ?? 'Type a message (Enter to send, Shift+Enter for new line)'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="stack">
          {busy && onStop ? <button onClick={onStop}>Stop</button> : <button className="primary" onClick={send} disabled={busy}>Send</button>}
          <button onClick={onReset} disabled={busy}>Reset</button>
        </div>
      </div>
    </div>
  );
}
