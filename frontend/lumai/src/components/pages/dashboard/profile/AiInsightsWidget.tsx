import React, { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../../../utils/api';

type InsightVersion = {
  version: number;
  content: string | null;
  model: string | null;
  createdAt?: string;
  status: 'success' | 'errored';
};

const AiInsightsWidget: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ insight?: InsightVersion | null }>('/ai/insights/latest');
      const insight = data.insight ?? null;
      if (insight && insight.status === 'success') {
        setContent(insight.content ?? null);
        setModel(insight.model ?? null);
      } else {
        setContent(null);
        setModel(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Failed to load AI insight');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await apiFetch<{ content: string; model?: string | null; version?: number; createdAt?: string }>(
        '/ai/insights',
        {
          method: 'POST'
        }
      );
      setContent(data.content ?? null);
      setModel(data.model ?? null);
      // setTimestamp(data.createdAt ?? new Date().toISOString());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Failed to generate insight. Enable AI consent in Privacy settings and try again.');
    } finally {
      setGenerating(false);
    }
  };

  // Extract only the Motivational note from the response
  const getMotivationalNote = (text: string | null) => {
    if (!text) return null;
    const match = text.match(/\*\*Motivational note\*\*[\s\n]*([\s\S]*)/i);
    return match ? match[1].trim() : null;
  };

  const motivationalNote = getMotivationalNote(content);

  return (
    <section className="dashboard-widget" aria-labelledby="ai-insights-title" aria-busy={loading}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 id="ai-insights-title" className="dashboard-widget-title">AI insights</h3>
        <button
          type="button"
          className="dashboard-hero-action"
          style={{ padding: '8px 16px', fontSize: 13 }}
          onClick={generate}
          disabled={generating || loading}
        >
          {generating ? 'Thinking…' : 'Refresh insight'}
        </button>
      </div>
      <div className="dashboard-widget-body" style={{ display: 'grid', gap: 12 }}>
        {loading ? (
          <p>Gathering your latest insight…</p>
        ) : error ? (
          <p role="alert" style={{ color: 'crimson', margin: 0 }}>{error}</p>
        ) : motivationalNote ? (
          <>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-primary)' }}>Motivational note</p>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                color: 'var(--color-gray-600)'
              }}
            >{motivationalNote}</pre>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-gray-400)' }}>
              {model ? `Model: ${model} · ` : ''}
            </p>
          </>
        ) : (
          <p style={{ margin: 0 }}>No motivational note yet. Generate a new insight above.</p>
        )}
        <a
          href="/ai-insights"
          className="dashboard-hero-action"
          style={{ justifyContent: 'center', fontSize: 13 }}
        >
          View full insight history
        </a>
      </div>
    </section>
  );
};

export default AiInsightsWidget;
