import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../../utils/api';

type NutritionSnapshot = {
  date: string;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
  goalComparison?: {
    calorieDelta: number;
  };
};

const formatDeltaLabel = (value: number | null | undefined) => {
  if (value === null || typeof value !== 'number') return 'Waiting for logs';
  if (Math.abs(value) < 10) return 'On target';
  const rounded = Math.round(Math.abs(value));
  return value > 0 ? `${rounded} kcal surplus` : `${rounded} kcal deficit`;
};

const DailyNutritionWidget: React.FC = () => {
  const [snapshot, setSnapshot] = useState<NutritionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadSnapshot = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch<{ snapshots: NutritionSnapshot[] }>('/nutrition/snapshots?limit=1');
        if (!active) return;
        setSnapshot(response.snapshots?.[0] ?? null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to fetch nutrition data');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadSnapshot();
    return () => {
      active = false;
    };
  }, []);

  const macroEntries = useMemo(() => {
    if (!snapshot) return [];
    return (['protein', 'carbs', 'fats'] as const).map((macro) => ({
      label: macro.charAt(0).toUpperCase() + macro.slice(1),
      value: Math.round(snapshot.totals[macro])
    }));
  }, [snapshot]);

  const calorieDelta = snapshot?.goalComparison?.calorieDelta ?? null;
  const deltaClass =
    calorieDelta === null
      ? ''
      : calorieDelta > 0
        ? 'is-surplus'
        : calorieDelta < 0
          ? 'is-deficit'
          : 'is-balanced';

  return (
    <section className="dashboard-widget dashboard-nutrition-widget" aria-live="polite">
      <header>
        <p className="dashboard-widget-subtitle">Daily tracking</p>
        <h2>Nutrition snapshot</h2>
      </header>
      {loading ? (
        <p className="dashboard-widget-body">Loading latest intake…</p>
      ) : error ? (
        <p className="dashboard-widget-body" role="alert">
          {error}
        </p>
      ) : snapshot ? (
        <>
          <div className="nutrition-kcal">
            <span className="nutrition-kcal-value">{Math.round(snapshot.totals.calories)} kcal</span>
            <span className={`nutrition-kcal-delta ${deltaClass}`}>{formatDeltaLabel(calorieDelta)}</span>
          </div>
          <ul className="nutrition-macro-list">
            {macroEntries.map((macro) => (
              <li key={macro.label}>
                <span>{macro.label}</span>
                <strong>{macro.value} g</strong>
              </li>
            ))}
          </ul>
          <p className="dashboard-widget-footnote">
            Based on today&apos;s logged meals. Visit the Nutrition workspace to adjust targets.
          </p>
        </>
      ) : (
        <p className="dashboard-widget-body">Log your first meal to unlock daily tracking.</p>
      )}
    </section>
  );
};

export default DailyNutritionWidget;
