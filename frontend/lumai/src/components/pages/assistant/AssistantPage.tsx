import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { User } from 'firebase/auth';
import SideNav from '../../navigation/SideNav';
import { apiFetch } from '../../../utils/api';
import './AssistantPage.css';

type ConversationRole = 'user' | 'assistant';

interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
}

interface ConversationSnapshot {
  summary: string | null;
  messages: ConversationMessage[];
}

interface ChatResponse extends ConversationSnapshot {
  message: ConversationMessage;
  trace?: AssistantTrace;
}

type TraceStatus = 'pending' | 'ok' | 'error';

interface AssistantTraceCall {
  name: string;
  arguments: Record<string, unknown>;
  status: TraceStatus;
  resultPreview?: string;
}

interface AssistantTrace {
  request: string;
  responsePlan?: string;
  functionCalls: AssistantTraceCall[];
}

const QUICK_PROMPTS = [
  'What is my current BMI and how has it changed?',
  "Show me today's meal plan.",
  'Am I on track with protein this week?',
  'Suggest recovery tips for better sleep.'
];

const formatTimestamp = (value: string) => {
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: 'numeric'
    }).format(date);
  } catch {
    return '';
  }
};

const renderInline = (text: string, keyPrefix: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-strong-${index}`}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-span-${index}`}>{part}</span>;
  });
};

const renderContent = (content: string, messageId: string) => {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let buffer: string[] = [];
  let blockIndex = 0;

  const flushBuffer = () => {
    if (!buffer.length) return;
    const listKey = `${messageId}-list-${blockIndex++}`;
    elements.push(
      <ul key={listKey}>
        {buffer.map((item, idx) => (
          <li key={`${listKey}-item-${idx}`}>{renderInline(item, `${listKey}-item-${idx}`)}</li>
        ))}
      </ul>
    );
    buffer = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed.length) {
      flushBuffer();
      return;
    }
    if (trimmed.startsWith('- ')) {
      buffer.push(trimmed.slice(2));
      return;
    }
    flushBuffer();
    const paragraphKey = `${messageId}-paragraph-${blockIndex++}`;
    elements.push(
      <p key={paragraphKey}>{renderInline(trimmed, `${paragraphKey}-line`)}</p>
    );
  });

  flushBuffer();
  return elements;
};

interface AssistantPageProps {
  user: User;
}

const AssistantPage = ({ user }: AssistantPageProps) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const greeting = useMemo(() => {
    return user.displayName ?? user.email ?? 'there';
  }, [user.displayName, user.email]);

  useEffect(() => {
    let active = true;
    apiFetch<ConversationSnapshot>('/assistant/conversation')
      .then((snapshot) => {
        if (!active) return;
        setMessages(snapshot.messages ?? []);
        setSummary(snapshot.summary ?? null);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load conversation.');
      })
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<ChatResponse>('/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ message: trimmed })
      });
      setMessages(response.messages ?? []);
      setSummary(response.summary ?? null);
      logTrace(response.trace);
      setInput('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send message.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [input]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loading) {
      void sendMessage();
    }
  };

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="assistant-shell">
      <SideNav activeKey="assistant" />
      <div className="assistant-canvas">
        <header className="assistant-header">
          <span className="assistant-eyebrow">Lumai assistant</span>
          <h1 className="assistant-title">Hi {greeting.split(' ')[0]}, how can I help?</h1>
          <p className="assistant-subtitle">
            Ask about your metrics, nutrition history, or get personalized wellness coaching powered by your real data.
          </p>
        </header>

        <div className="assistant-grid">
          <section className="assistant-chat-card" aria-label="Chat conversation">
            <div className="assistant-messages" ref={scrollRef}>
              {error && <div className="assistant-error">{error}</div>}
              {initializing && !messages.length && (
                <div className="assistant-loading-bar">Loading conversation…</div>
              )}
              {!initializing && !messages.length && !error && (
                <div className="assistant-empty">
                  <p>No conversation yet. Ask anything about your health data to get started.</p>
                </div>
              )}
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`assistant-message ${message.role}`}
                >
                  {renderContent(message.content, message.id)}
                  <time dateTime={message.createdAt}>{formatTimestamp(message.createdAt)}</time>
                </article>
              ))}
            </div>
            <form className="assistant-input-bar" onSubmit={handleSubmit}>
              <textarea
                name="message"
                className="assistant-input"
                placeholder="Ask about your progress, nutrition, or goals…"
                rows={2}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={loading}
              />
              <button type="submit" className="assistant-send" disabled={loading || !input.trim()}>
                {loading ? 'Sending…' : 'Send'}
              </button>
            </form>
          </section>

          <aside className="assistant-context-panel">
            <article className="assistant-context-card">
              <h3>Conversation summary</h3>
              <p>
                {summary
                  ? summary
                  : 'No prior context yet. The assistant will summarize longer chats automatically.'}
              </p>
            </article>
            <article className="assistant-context-card">
              <h3>Quick prompts</h3>
              <div className="assistant-quick-prompts">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handlePromptClick(prompt)}
                    disabled={loading}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </article>
            <article className="assistant-context-card">
              <h3>Guardrails</h3>
              <p>
                Lumai references only the data you have logged. For medical advice, diagnoses, or urgent questions,
                please consult a licensed professional.
              </p>
            </article>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default AssistantPage;

const logTrace = (trace?: AssistantTrace) => {
  if (!trace) return;
  const cleanedRequest = trace.request?.trim();
  const cleanedResponse = sanitizeAssistantOutput(trace.responsePlan);

  console.groupCollapsed('[Lumai Assistant] Trace');
  console.log('Incoming request:', cleanedRequest || '(empty)');
  if (trace.functionCalls?.length) {
    console.groupCollapsed('Function calls');
    trace.functionCalls.forEach((call, index) => {
      console.group(`${index + 1}. ${call.name}`);
      console.log('Status:', call.status.toUpperCase());
      console.log('Arguments:', call.arguments);
      if (call.resultPreview) {
        console.log('Result preview:', call.resultPreview);
      }
      console.groupEnd();
    });
    console.groupEnd();
  } else {
    console.log('Function calls: none');
  }
  console.log('Planned response:', cleanedResponse || '(empty)');
  console.groupEnd();
};

const sanitizeAssistantOutput = (value?: string) => {
  if (!value) return '';
  return value.replace(/<\|[^>]+>/g, '').trim();
};
