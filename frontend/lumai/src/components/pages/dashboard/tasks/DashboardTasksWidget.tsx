import React, { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../../../utils/api';
import { dispatchLogWorkoutEvent } from '../events';

interface LatestInsightResponse {
  insight?: {
    version: number;
    content: string | null;
    status: 'success' | 'errored';
    createdAt?: string;
  } | null;
}

const extractTasks = (content: string | null) => {
  if (!content) return [];

  const focusRegex = /\*\*Daily focus tasks\*\*([\s\S]*?)(?:\n{2,}|\*\*|$)/i;
  const recommendationsRegex = /\*\*Three actionable recommendations\*\*([\s\S]*?)(?:\n{2,}|\*\*|$)/i;

  const sectionMatch = content.match(focusRegex) ?? content.match(recommendationsRegex);
  if (!sectionMatch) return [];

  const section = sectionMatch[1] ?? '';
  const listRegex = /(?:^|\n)(?:-|\d+\.)\s*(.+)/g;
  const tasks: string[] = [];
  let match = listRegex.exec(section);
  while (match) {
    const text = match[1].trim();
    if (text.length > 0) {
      tasks.push(text.replace(/\*\*/g, ''));
    }
    match = listRegex.exec(section);
  }
  return tasks.slice(0, 3);
};

const DashboardTasksWidget: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<string[]>([]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<LatestInsightResponse>('/ai/insights/latest');
      const insight = data.insight;
      if (!insight || insight.status !== 'success') {
        setTasks([]);
      } else {
        setTasks(extractTasks(insight.content));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  if (loading) {
    return (
      <div className="dashboard-widget" aria-busy="true">
        <h3 className="dashboard-widget-title">Today Tasks</h3>
        <div className="dashboard-widget-body">
          <p>Loading tasks…</p>
        </div>
      </div>
    );
  }

  if (error || tasks.length === 0) {
    return null;
  }

  return (
    <div className="dashboard-widget" aria-labelledby="dashboard-tasks-title">
      <h3 id="dashboard-tasks-title" className="dashboard-widget-title">Today Tasks</h3>
      <div className="dashboard-widget-body" style={{ display: 'grid', gap: 12 }}>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          {tasks.map((task, index) => (
            <li key={index} style={{ lineHeight: 1.4 }}>{task}</li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="dashboard-hero-action" style={{ fontSize: 13 }} href="/ai-insights">
            Review full insight
          </a>
          <button
            type="button"
            className="dashboard-hero-action"
            style={{ fontSize: 13 }}
            onClick={dispatchLogWorkoutEvent}
          >
            Log workout
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardTasksWidget;
