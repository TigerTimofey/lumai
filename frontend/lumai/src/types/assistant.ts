export type VisualizationType = 'weight_trend' | 'protein_vs_target' | 'macro_breakdown' | 'sleep_vs_target';

interface VisualizationBase {
  title: string;
  timePeriod: string;
  description: string;
}

export type VisualizationPayload =
  | (VisualizationBase & {
      type: 'weight_trend';
      data: {
        series: Array<{ date: string; value: number | null }>;
      };
    })
  | (VisualizationBase & {
      type: 'protein_vs_target';
      data: {
        series: Array<{ date: string; actual: number; target: number }>;
        unit?: string;
      };
    })
  | (VisualizationBase & {
      type: 'macro_breakdown';
      data: {
        labels: string[];
        values: number[];
        calories?: number;
      };
    })
  | (VisualizationBase & {
      type: 'sleep_vs_target';
      data: {
        series: Array<{ date: string; actual: number; target: number }>;
      };
    });

export interface ConversationMessageMetadata {
  visualizations?: VisualizationPayload[];
}
