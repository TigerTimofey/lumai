import React from 'react';

type ImprovementData = {
  food: string[];
  timing: string[];
  portions: string[];
  ingredients: string[];
  plan: string[];
};

interface AiImprovementSectionProps {
  data: ImprovementData;
}

const sections: Array<{ key: keyof ImprovementData; title: string }> = [
  { key: 'food', title: 'Food ideas' },
  { key: 'timing', title: 'Meal timing' },
  { key: 'portions', title: 'Portion tweaks' },
  { key: 'ingredients', title: 'Ingredient swaps' },
  { key: 'plan', title: 'Plan optimization' }
];

export const AiImprovementSection: React.FC<AiImprovementSectionProps> = ({ data }) => {
  return (
    <section className="ai-improvement-section">
      <header>
        <p className="calories-section-label">Improvement playbook</p>
        <h3>AI-driven recommendations</h3>
      </header>
      <div className="ai-improvement-grid">
        {sections.map((section) => (
          <article key={section.key} className="ai-improvement-card">
            <h4>{section.title}</h4>
            <ul>
              {data[section.key].map((item) => (
                <li key={`${section.key}-${item}`}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
};

export type { ImprovementData };
