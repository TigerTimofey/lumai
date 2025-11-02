import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../../utils/api';

interface HealthSummaryMetrics {
  averageWeight: number | null;
  averageBmi: number | null;
  averageWellnessScore: number | null;
  averageSleepHours: number | null;
  averageWaterIntake: number | null;
  totalWorkouts: number;
  averageWorkoutDuration: number | null;
  mostActiveDay: string | null;
  consistencyScore: number;
}

interface HealthProgress {
  weightChange: number | null;
  bmiChange: number | null;
  wellnessScoreChange: number | null;
  sleepImprovement: number | null;
  waterIntakeImprovement: number | null;
  activityIncrease: number | null;
}

interface HealthSummary {
  period: 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  metrics: HealthSummaryMetrics;
  progress: HealthProgress;
  keyInsights: string[];
  recommendations: string[];
  generatedAt: string;
  aiInsights?: string;
  aiGeneratedAt?: string;
}

interface HealthSummaryWidgetProps {
  uid: string;
}

const HealthSummaryWidget: React.FC<HealthSummaryWidgetProps> = ({ uid }) => {
  const [weeklySummary, setWeeklySummary] = useState<HealthSummary | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly');

  useEffect(() => {
    const fetchSummaries = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch both summaries in parallel
        const [weeklyResponse, monthlyResponse] = await Promise.all([
          apiFetch('/health-summary/weekly?ai=true'),
          apiFetch('/health-summary/monthly?ai=true')
        ]);

        setWeeklySummary(weeklyResponse as HealthSummary);
        setMonthlySummary(monthlyResponse as HealthSummary);
      } catch (err) {
        console.error('Failed to fetch health summaries:', err);
        setError(err instanceof Error ? err.message : 'Failed to load health summaries');
      } finally {
        setLoading(false);
      }
    };

    fetchSummaries();
  }, [uid]);

  const currentSummary = activeTab === 'weekly' ? weeklySummary : monthlySummary;

  const formatChange = (value: number | null, unit: string = '', showSign: boolean = true) => {
    if (value === null) return '—';
    const sign = showSign && value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}${unit}`;
  };

  const formatNumber = (value: number | null, digits: number = 1, unit = '') => {
    if (value === null || value === undefined) return '—';
    return `${value.toFixed(digits)}${unit}`;
  };

  const formatWholeNumber = (value: number | null, unit = '') => {
    if (value === null || value === undefined) return '—';
    return `${Math.round(value)}${unit}`;
  };

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateRange = (start: string, end: string) => {
    return `${formatDate(start)} → ${formatDate(end)}`;
  };

  const formatMostActiveDay = (value: string | null) => {
    if (!value) return '—';
    return value;
  };

  const metricValue = (value: number | null | undefined) => (value === null || value === undefined ? '—' : value);

  const progressItems = currentSummary
    ? [
        {
          label: 'Weight change',
          value: formatChange(currentSummary.progress.weightChange, ' kg')
        },
        {
          label: 'BMI change',
          value: formatChange(currentSummary.progress.bmiChange, '')
        },
        {
          label: 'Wellness score change',
          value: formatChange(currentSummary.progress.wellnessScoreChange, ' pts')
        },
        {
          label: 'Sleep improvement',
          value: formatChange(currentSummary.progress.sleepImprovement, ' h')
        },
        {
          label: 'Water intake change',
          value: formatChange(currentSummary.progress.waterIntakeImprovement, ' L')
        },
        {
          label: 'Activity increase',
          value: currentSummary.progress.activityIncrease === null
            ? '—'
            : `${currentSummary.progress.activityIncrease > 0 ? '+' : ''}${currentSummary.progress.activityIncrease.toFixed(1)}%`
        }
      ]
    : [];

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'var(--color-gray-400)';
    if (score >= 80) return 'var(--color-success)';
    if (score >= 60) return 'var(--color-warning)';
    return 'var(--color-error)';
  };

  const getChangeColor = (change: number | null) => {
    if (change === null) return 'var(--color-gray-400)';
    if (change > 0) return 'var(--color-success)';
    if (change < 0) return 'var(--color-error)';
    return 'var(--color-gray-500)';
  };

  if (loading) {
    return (
      <section className="dashboard-widget" aria-labelledby="health-summary-title">
        <h3 id="health-summary-title" className="dashboard-widget-title">Health Summary</h3>
        <div className="dashboard-widget-body">
          <p>Loading health summaries...</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="dashboard-widget" aria-labelledby="health-summary-title">
        <h3 id="health-summary-title" className="dashboard-widget-title">Health Summary</h3>
        <div className="dashboard-widget-body">
          <p role="alert" style={{ color: 'var(--color-error)', margin: 0 }}>
            {error}
          </p>
        </div>
      </section>
    );
  }

  if (!currentSummary) {
    return (
      <section className="dashboard-widget" aria-labelledby="health-summary-title">
        <h3 id="health-summary-title" className="dashboard-widget-title">Health Summary</h3>
        <div className="dashboard-widget-body">
          <p>No health data available yet. Start tracking your wellness metrics!</p>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-widget" aria-labelledby="health-summary-title">
      <h3 id="health-summary-title" className="dashboard-widget-title">Health Summary</h3>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setActiveTab('weekly')}
          style={{
            padding: '6px 12px',
            border: '1px solid var(--color-gray-300)',
            borderRadius: 6,
            background: activeTab === 'weekly' ? 'var(--color-primary)' : 'var(--color-white)',
            color: activeTab === 'weekly' ? 'var(--color-white)' : 'var(--color-gray-700)',
            fontSize: '0.85rem',
            cursor: 'pointer',
            fontWeight: activeTab === 'weekly' ? 600 : 400
          }}
        >
          This Week
        </button>
        <button
          onClick={() => setActiveTab('monthly')}
          style={{
            padding: '6px 12px',
            border: '1px solid var(--color-gray-300)',
            borderRadius: 6,
            background: activeTab === 'monthly' ? 'var(--color-primary)' : 'var(--color-white)',
            color: activeTab === 'monthly' ? 'var(--color-white)' : 'var(--color-gray-700)',
            fontSize: '0.85rem',
            cursor: 'pointer',
            fontWeight: activeTab === 'monthly' ? 600 : 400
          }}
        >
          This Month
        </button>
      </div>

      <div className="dashboard-widget-body" style={{ display: 'grid', gap: 16 }}>
        {/* Key Metrics */}
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-gray-600)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Period: {formatDateRange(currentSummary.startDate, currentSummary.endDate)}</span>
            <span>Updated: {formatDate(currentSummary.generatedAt)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-gray-600)', marginBottom: 4 }}>
                Wellness Score
              </div>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: 600,
                color: getScoreColor(currentSummary.metrics.averageWellnessScore)
              }}>
                {currentSummary.metrics.averageWellnessScore == null
                  ? '—'
                  : formatWholeNumber(currentSummary.metrics.averageWellnessScore)}
              </div>
              {currentSummary.progress.wellnessScoreChange !== null && (
                <div style={{
                  fontSize: '0.8rem',
                  color: getChangeColor(currentSummary.progress.wellnessScoreChange),
                  marginTop: 2
                }}>
                  {formatChange(currentSummary.progress.wellnessScoreChange, ' pts')}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-gray-600)', marginBottom: 4 }}>
                Weight
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                {formatNumber(currentSummary.metrics.averageWeight, 1, ' kg')}
              </div>
              {currentSummary.progress.weightChange !== null && (
                <div style={{
                  fontSize: '0.8rem',
                  color: getChangeColor(currentSummary.progress.weightChange),
                  marginTop: 2
                }}>
                  {formatChange(currentSummary.progress.weightChange, ' kg')}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-gray-600)' }}>BMI</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>
                {formatNumber(currentSummary.metrics.averageBmi)}
              </div>
              {currentSummary.progress.bmiChange !== null && (
                <div style={{
                  fontSize: '0.75rem',
                  marginTop: 2,
                  color: getChangeColor(currentSummary.progress.bmiChange)
                }}>
                  {formatChange(currentSummary.progress.bmiChange)}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-gray-600)' }}>Sleep</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>
                {formatNumber(currentSummary.metrics.averageSleepHours, 1, ' h')}
              </div>
              {currentSummary.progress.sleepImprovement !== null && (
                <div style={{
                  fontSize: '0.75rem',
                  marginTop: 2,
                  color: getChangeColor(currentSummary.progress.sleepImprovement)
                }}>
                  {formatChange(currentSummary.progress.sleepImprovement, ' h')}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-gray-600)' }}>Hydration</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>
                {formatNumber(currentSummary.metrics.averageWaterIntake, 1, ' L')}
              </div>
              {currentSummary.progress.waterIntakeImprovement !== null && (
                <div style={{
                  fontSize: '0.75rem',
                  marginTop: 2,
                  color: getChangeColor(currentSummary.progress.waterIntakeImprovement)
                }}>
                  {formatChange(currentSummary.progress.waterIntakeImprovement, ' L')}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-gray-600)' }}>Total workouts</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>
                {metricValue(currentSummary.metrics.totalWorkouts)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-gray-600)' }}>Avg workout duration</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>
                {formatWholeNumber(currentSummary.metrics.averageWorkoutDuration, ' min')}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-gray-600)' }}>Most active day</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>
                {formatMostActiveDay(currentSummary.metrics.mostActiveDay)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-gray-600)' }}>Consistency</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>
                {currentSummary.metrics.consistencyScore != null ? `${currentSummary.metrics.consistencyScore}%` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Key Insights */}
        {currentSummary.keyInsights.length > 0 && (
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-gray-700)', marginBottom: 8 }}>
              Key Insights
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.85rem', lineHeight: 1.4 }}>
              {currentSummary.keyInsights.map((insight, index) => (
                <li key={index} style={{ marginBottom: 4, color: 'var(--color-gray-600)' }}>
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Progress */}
        {progressItems.length > 0 && (
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-gray-700)', marginBottom: 8 }}>
              Progress vs. period start
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {progressItems.map((item) => (
                <div key={item.label} style={{ padding: 12, border: '1px solid var(--color-gray-200)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-gray-600)', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Insights (if available) */}
        {currentSummary.aiInsights && (
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)', marginBottom: 8 }}>
              AI Insights
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.4, color: 'var(--color-gray-600)', whiteSpace: 'pre-line' }}>
              {currentSummary.aiInsights}
            </p>
            {currentSummary.aiGeneratedAt && (
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                Generated: {formatDate(currentSummary.aiGeneratedAt)}
              </p>
            )}
          </div>
        )}

        {/* Recommendations */}
        {currentSummary.recommendations.length > 0 && (
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-gray-700)', marginBottom: 8 }}>
              Recommendations
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.85rem', lineHeight: 1.4 }}>
              {currentSummary.recommendations.map((recommendation, index) => (
                <li key={index} style={{ marginBottom: 4, color: 'var(--color-gray-600)' }}>
                  {recommendation}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
};

export default HealthSummaryWidget;
