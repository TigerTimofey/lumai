import React, { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../../../utils/api';

type InsightLog = {
  response?: {
    content?: string;
  } | null;
  createdAt?: string;
  model?: string;
};

const AiInsightsWidget: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ insights?: InsightLog[] }>('/ai/insights?limit=1');
      const insight = data.insights?.[0];
      setContent(insight?.response?.content ?? null);
      setTimestamp(insight?.createdAt ?? null);
      setModel(insight?.model ?? null);
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
      const data = await apiFetch<{ content: string; model?: string; createdAt?: string }>('/ai/insights', {
        method: 'POST'
      });
      setContent(data.content ?? null);
      setModel(data.model ?? null);
      setTimestamp(data.createdAt ?? new Date().toISOString());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Failed to generate insight. Enable AI consent in Privacy settings and try again.');
    } finally {
      setGenerating(false);
    }
  };

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
        ) : content ? (
          <>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                color: 'var(--color-gray-600)'
              }}
            >{content}</pre>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-gray-400)' }}>
              {model ? `Model: ${model} · ` : ''}
              {timestamp ? new Date(timestamp).toLocaleString() : 'Just now'}
            </p>
          </>
        ) : (
          <p style={{ margin: 0 }}>No insights yet. Generate the first recommendation above.</p>
        )}
      </div>
    </section>
  );
};

export default AiInsightsWidget;
