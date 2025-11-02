import React, { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

import SideNav from '../../navigation/SideNav';
import UserSettingBar from '../dashboard/user-settings/userSettingBar';
import { apiFetch } from '../../../utils/api';
import './AiInsightsPage.css';

type Timestampish = string | { seconds?: number; _seconds?: number; toDate?: () => Date };

type InsightResponse = {
  version: number;
  content: string | null;
  model: string | null;
  status: 'success' | 'errored';
  usage?: Record<string, unknown> | null;
  promptContext?: Record<string, unknown>;
  createdAt?: Timestampish;
};

type ListResponse = {
  insights?: InsightResponse[];
};

type GenerateResponse = {
  content: string;
  model?: string | null;
  version?: number;
  createdAt?: string;
};

const formatTimestamp = (value?: Timestampish) => {
  if (!value) return 'moments ago';
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      return value.toDate().toLocaleString();
    }
    const seconds = (value._seconds ?? value.seconds) ?? null;
    if (seconds != null) {
      return new Date(seconds * 1000).toLocaleString();
    }
  }
  return 'moments ago';
};

const renderBold = (text: string) => {
  // Replace **text** with <strong>text</strong>
  const parts = [] as React.ReactNode[];
  let lastIndex = 0;
  const regex = /\*\*([^*]+)\*\*/g;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={key++}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
};

const InsightCard: React.FC<{
  insight: InsightResponse;
  expanded: boolean;
  onToggle: () => void;
}> = ({ insight, expanded, onToggle }) => {
  const content = insight.status === 'success'
    ? insight.content ?? 'No content generated'
    : 'Insight generation failed. Please try again later.';

  return (
    <article
      className={`ai-insight-card ${expanded ? 'is-expanded' : 'is-collapsed'} ${
        insight.status !== 'success' ? 'ai-insight-card--error' : ''
      }`}
    >
      <header className="ai-insight-card__header">
        <span className="ai-insight-card__status" data-status={insight.status}>
          {insight.status === 'success' ? 'Generated insight' : 'Generation failed'}
        </span>
        <span className="ai-insight-card__meta">
          {`v${insight.version}`}
          {insight.model ? ` · ${insight.model}` : ''}
          {` · ${formatTimestamp(insight.createdAt)}`}
        </span>
        <button type="button" className="ai-insight-card__toggle" onClick={onToggle}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </header>
      {expanded ? (
        <pre className="ai-insight-card__body">{renderBold(content)}</pre>
      ) : (
        // <p className="ai-insight-card__preview">{(previewText)}</p>
        <></>
      )}
    </article>
  );
};

const AiInsightsPage: React.FC<{ user: User }> = ({ user }) => {
  const displayName = user.displayName ?? user.email ?? 'friend';
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightResponse[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ListResponse>('/ai/insights?limit=20');
      setInsights(data.insights ?? []);
      setExpandedIndex((data.insights ?? []).length > 0 ? 0 : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInsights();
  }, [fetchInsights]);

  const generateInsight = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      await apiFetch<GenerateResponse>('/ai/insights', { method: 'POST' });
      await fetchInsights();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Failed to generate new insight');
    } finally {
      setGenerating(false);
    }
  }, [fetchInsights]);

  // const latestInsight = useMemo(() => insights[0] ?? null, [insights]);

  return (
    <div className="dashboard-shell">
      <SideNav activeKey="ai-insights" />
      <div className="dashboard-canvas">
        <main className="dashboard-main ai-insights-main" role="main">
          <UserSettingBar name={displayName} photoURL={user.photoURL ?? null} />
          <div className="dashboard-left">
            <header className="dashboard-header ai-insights-header">
              <div>
                <p className="dashboard-subtitle">Personalized guidance</p>
                <h1 className="dashboard-title">AI insights</h1>
                <p className="dashboard-welcome">Actionable recommendations tailored to your latest wellness data.</p>
              </div>
              <button
                type="button"
                className="dashboard-hero-action"
                onClick={generateInsight}
                disabled={generating}
              >
                {generating ? 'Thinking...' : 'Request insight'}
              </button>
            </header>

            {error && (
              <p role="alert" className="ai-insights-error">{error}</p>
            )}

            {loading ? (
              <p className="ai-insights-loading">Loading your insights…</p>
            ) : insights.length === 0 ? (
              <div className="ai-insights-empty">
                <h2>No insights yet</h2>
                <p>Generate your first AI insight once you have completed your profile.</p>
                <button
                  type="button"
                  className="dashboard-hero-action"
                  onClick={generateInsight}
                  disabled={generating}
                >
                  {generating ? 'Thinking...' : 'Generate insight'}
                </button>
              </div>
        ) : (
          <section className="ai-insights-feed" aria-live="polite">
            {insights.map((insight, index) => (
              <InsightCard
                key={index}
                insight={insight}
                expanded={expandedIndex === index}
                onToggle={() =>
                  setExpandedIndex((prev) => (prev === index ? null : index))
                }
              />
            ))}
          </section>
        )}
      </div>
        </main>
      </div>
    </div>
  );
};

export default AiInsightsPage;
