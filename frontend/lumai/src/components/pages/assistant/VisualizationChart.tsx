import { memo, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';
import type { VisualizationPayload } from '../../../types/assistant';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend);

interface VisualizationChartProps {
  visualization: VisualizationPayload;
}

const VisualizationChart = ({ visualization }: VisualizationChartProps) => {
  const chartContent = useMemo(() => {
    switch (visualization.type) {
      case 'weight_trend':
        return renderWeightTrend(visualization);
      case 'protein_vs_target':
        return renderProteinComparison(visualization);
      case 'macro_breakdown':
        return renderMacroBreakdown(visualization);
      case 'sleep_vs_target':
        return renderSleepComparison(visualization);
      default:
        return null;
    }
  }, [visualization]);

  if (!chartContent) {
    return null;
  }

  return (
    <div className="assistant-chart-card">
      <h4>{visualization.title}</h4>
      <p>{visualization.description}</p>
      <p className="assistant-chart-meta">{visualization.timePeriod}</p>
      <div className="assistant-chart-canvas">
        {chartContent}
      </div>
    </div>
  );
};

const renderWeightTrend = (
  visualization: Extract<VisualizationPayload, { type: 'weight_trend' }>
) => {
  if (!visualization.data.series.length) {
    return <div className="assistant-chart-empty">No weight entries logged yet.</div>;
  }
  const labels = visualization.data.series.map((point) => formatDate(point.date));
  const dataset = visualization.data.series.map((point) => point.value ?? null);
  const data = {
    labels,
    datasets: [
      {
        label: 'Weight (kg)',
        data: dataset,
        borderColor: '#5c6ac4',
        backgroundColor: 'rgba(92, 106, 196, 0.15)',
        tension: 0.35,
        fill: true,
        spanGaps: true
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: { ticks: { maxRotation: 0, autoSkip: true } },
      y: {
        ticks: { callback: (value: number | string) => `${value} kg` }
      }
    }
  };
  return <Line data={data} options={options} />;
};

const renderProteinComparison = (
  visualization: Extract<VisualizationPayload, { type: 'protein_vs_target' }>
) => {
  if (!visualization.data.series.length) {
    return <div className="assistant-chart-empty">No protein data available.</div>;
  }
  const labels = visualization.data.series.map((entry) => formatDate(entry.date));
  const actual = visualization.data.series.map((entry) => entry.actual);
  const target = visualization.data.series.map((entry) => entry.target);
  const data = {
    labels,
    datasets: [
      {
        label: 'Actual',
        data: actual,
        backgroundColor: '#5c6ac4',
        borderRadius: 6
      },
      {
        label: 'Target',
        data: target,
        backgroundColor: '#cbd5f5',
        borderRadius: 6
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const
      }
    },
    scales: {
      y: {
        ticks: {
          callback: (value: number | string) =>
            visualization.data.unit ? `${value} ${visualization.data.unit}` : value
        }
      }
    }
  };
  return <Bar data={data} options={options} />;
};

const renderMacroBreakdown = (
  visualization: Extract<VisualizationPayload, { type: 'macro_breakdown' }>
) => {
  if (!visualization.data.labels.length || !visualization.data.values.length) {
    return <div className="assistant-chart-empty">No macro breakdown recorded.</div>;
  }
  const data = {
    labels: visualization.data.labels,
    datasets: [
      {
        data: visualization.data.values,
        backgroundColor: ['#5c6ac4', '#34d399', '#fbbf24'],
        borderWidth: 2,
        borderColor: '#fff'
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const
      }
    }
  };
  return <Pie data={data} options={options} />;
};

const renderSleepComparison = (
  visualization: Extract<VisualizationPayload, { type: 'sleep_vs_target' }>
) => {
  if (!visualization.data.series.length) {
    return <div className="assistant-chart-empty">No sleep data available.</div>;
  }
  const labels = visualization.data.series.map((entry) => formatDate(entry.date));
  const actual = visualization.data.series.map((entry) => entry.actual);
  const target = visualization.data.series.map((entry) => entry.target);
  const data = {
    labels,
    datasets: [
      {
        label: 'Actual sleep',
        data: actual,
        borderColor: '#5c6ac4',
        backgroundColor: 'rgba(92, 106, 196, 0.15)',
        tension: 0.4,
        fill: true
      },
      {
        label: 'Target',
        data: target,
        borderColor: '#94a3b8',
        borderDash: [6, 6],
        fill: false,
        tension: 0
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const
      }
    },
    scales: {
      y: {
        ticks: {
          callback: (value: number | string) => `${value} h`
        },
        title: {
          display: true,
          text: 'Hours'
        }
      }
    }
  };
  return <Line data={data} options={options} />;
};

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric'
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export default memo(VisualizationChart);
