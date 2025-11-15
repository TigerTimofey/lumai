import React, { useMemo } from 'react';
import type { User } from 'firebase/auth';

import SideNav from '../../navigation/SideNav';
import UserSettingBar from '../dashboard/user-settings/userSettingBar';
import './CaloriesPage.css';
import recipesData from './receipts/recipes_with_ingredients.json';

type RecipeFromJson = {
  recipe_id: number | string;
  name: string;
  cuisine: string;
  course: string;
  servings: number;
  ingredients: Array<{
    ingredient_id: number | string;
    name: string;
  }>;
};

const typedRecipes = recipesData as RecipeFromJson[];

const CaloriesPage: React.FC<{ user: User }> = ({ user }) => {
  const displayName = user.displayName ?? user.email ?? 'friend';

  const stats = useMemo(() => {
    const ingredients = new Set<string>();
    typedRecipes.forEach((recipe) => {
      recipe.ingredients.forEach((ingredient) => {
        if (ingredient?.name) {
          ingredients.add(ingredient.name);
        }
      });
    });
    return {
      recipes: typedRecipes.length,
      ingredients: ingredients.size
    };
  }, []);

  const handleGoToNutrition = () => {
    window.history.pushState({}, '', '/nutrition');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="dashboard-shell">
      <SideNav activeKey="nutrition" />
      <div className="dashboard-canvas">
        <main className="dashboard-main calories-main" role="main">
          <UserSettingBar name={displayName} photoURL={user.photoURL ?? null} />

          <section className="calories-hero">
            <div>
              <p className="calories-eyebrow">Nutrition companion</p>
              <h1 className="calories-title">Meal planning hub</h1>
              <p className="calories-subtitle">
                Explore our recipe knowledge base and prepare for AI-powered meal plans tailored to your health profile.
              </p>
              <button type="button" className="calories-cta" onClick={handleGoToNutrition}>
                Open nutrition workspace
              </button>
            </div>
            <div className="calories-stats">
              <article>
                <p className="calories-stat-label">Recipe library</p>
                <p className="calories-stat-value">{stats.recipes.toLocaleString()}</p>
                <p className="calories-stat-meta">Standardized with macros & micros</p>
              </article>
              <article>
                <p className="calories-stat-label">Unique ingredients</p>
                <p className="calories-stat-value">{stats.ingredients.toLocaleString()}</p>
                <p className="calories-stat-meta">Ready for shopping lists</p>
              </article>
            </div>
          </section>

          <section className="calories-features" aria-label="Nutrition features overview">
            <article className="calories-card">
              <h2>AI meal plans</h2>
              <p>Daily & weekly plans tuned to your goals, dietary rules, and timezone.</p>
            </article>
            <article className="calories-card">
              <h2>RAG-powered recipes</h2>
              <p>Retrieval-augmented generation keeps every recipe grounded in real nutritional data.</p>
            </article>
            <article className="calories-card">
              <h2>Shopping lists</h2>
              <p>Automatic ingredient grouping with quantities, categories, and quick adjustments.</p>
            </article>
            <article className="calories-card">
              <h2>Micronutrient tracking</h2>
              <p>Monitor vitamins & minerals alongside macros for a complete health snapshot.</p>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
};

export default CaloriesPage;
