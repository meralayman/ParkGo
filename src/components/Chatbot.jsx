import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PARKGO_RESERVATIONS_CHANGED } from '../constants/parkgoEvents';
import { sendChatbotMessage } from '../services/chatbot.service';
import './Chatbot.css';

const WELCOME =
  "Hi — I'm ParkGo assistant. Ask about availability, demand, bookings, or say “park at 6 PM” to reserve.";

const CONTEXT_STORAGE_KEY = 'parkgo_chatbot_context';

/** Shown until the server returns its own quick replies (e.g. Yes/No during booking). */
const DEFAULT_SUGGESTIONS = [
  'Check parking',
  'My bookings',
  'Book now',
  'Parking prediction',
  'Help',
];

function MessageList({ messages, typing }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  return (
    <div className="parkgo-chatbot-messages" aria-live="polite">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`parkgo-chatbot-bubble parkgo-chatbot-bubble--${m.role}`}
        >
          {m.text}
        </div>
      ))}
      {typing ? (
        <div className="parkgo-chatbot-typing">Assistant is typing…</div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => [
    { id: 'w', role: 'bot', text: WELCOME },
  ]);
  const [pending, setPending] = useState(false);
  const [context, setContext] = useState(() => {
    try {
      const raw = sessionStorage.getItem(CONTEXT_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return {};
  });
  const [quickReplies, setQuickReplies] = useState([]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(context));
    } catch {
      /* ignore */
    }
  }, [context]);

  const handleSend = useCallback(
    async (rawText) => {
      const text = String(rawText || '').trim();
      if (!text || pending) return;

      const userMsg = {
        id: `u-${Date.now()}`,
        role: 'user',
        text,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setPending(true);
      setQuickReplies([]);

      const result = await sendChatbotMessage(text, context);

      setPending(false);

      if (!result.ok) {
        const msg =
          result.code === 'CLIENT_THROTTLE'
            ? result.error ||
              'You are sending messages too quickly. Please wait a moment.'
            : result.error || 'Something went wrong, please try again.';
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            role: 'bot',
            text: msg,
          },
        ]);
        return;
      }

      setContext(result.context || {});
      setQuickReplies(result.quickReplies || []);

      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          role: 'bot',
          text: result.reply || '',
        },
      ]);

      const ctx = result.context || {};
      if (ctx.reservationUpdated === true) {
        try {
          window.dispatchEvent(new CustomEvent(PARKGO_RESERVATIONS_CHANGED));
        } catch {
          /* ignore */
        }
      }
    },
    [context, pending]
  );

  const onSubmit = (e) => {
    e.preventDefault();
    handleSend(input);
  };

  const suggestionChips =
    quickReplies.length > 0 ? quickReplies : DEFAULT_SUGGESTIONS;
  const suggestionLabel =
    quickReplies.length > 0 ? 'Quick replies' : 'Suggested questions';

  return (
    <>
      <button
        type="button"
        className="parkgo-chatbot-fab"
        aria-label="Open chat assistant"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '×' : '💬'}
      </button>

      {open ? (
        <section className="parkgo-chatbot-panel" aria-label="ParkGo assistant chat">
          <header className="parkgo-chatbot-panel__head">
            <span>ParkGo assistant</span>
            <button
              type="button"
              className="parkgo-chatbot-panel__close"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <MessageList
            messages={messages}
            typing={pending}
          />

          <div className="parkgo-chatbot-quick-wrap">
            <div className="parkgo-chatbot-quick__label">{suggestionLabel}</div>
            <div
              className="parkgo-chatbot-quick"
              role="group"
              aria-label="Suggested questions"
            >
              {suggestionChips.map((label) => (
                <button
                  key={label}
                  type="button"
                  disabled={pending}
                  onClick={() => handleSend(label)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <form className="parkgo-chatbot-inputrow" onSubmit={onSubmit}>
            <input
              type="text"
              maxLength={2000}
              placeholder="Ask about parking…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={pending}
              autoComplete="off"
            />
            <button type="submit" disabled={pending || !input.trim()}>
              Send
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
