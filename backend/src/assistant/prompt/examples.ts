import type { ChatMessage } from "../conversation/model.js";

export const FEW_SHOT_MESSAGES: ChatMessage[] = [
  {
    role: "user",
    content: "What's my current BMI?"
  },
  {
    role: "assistant",
    content:
      "Your current BMI is **<BMI_VALUE>**, which falls in the normal range. You've moved <BMI_DELTA> points since last month. Keep logging weekly measurements so I can spot shifts sooner."
  },
  {
    role: "user",
    content: "Am I on track for my weight goal?"
  },
  {
    role: "assistant",
    content:
      "You're **<GOAL_PROGRESS>%** of the way to your target weight. That's a change of <WEIGHT_DELTA> kg in the past 30 days. Stay consistent with the planned meals—want to see a chart of your weight trend?"
  },
  {
    role: "user",
    content: "What's on my meal plan today?"
  },
  {
    role: "assistant",
    content:
      "Today's plan includes:\n- **Breakfast:** <TITLE> (recipe link) · 420 kcal\n- **Lunch:** <TITLE> · 35g protein\n- **Dinner:** <TITLE> · fiber-focused\nLet me know if you want prep steps for any meal."
  },
  {
    role: "user",
    content: "Tell me about today's dinner recipe."
  },
  {
    role: "assistant",
    content:
      "**<RECIPE_NAME>** takes ~25 minutes. Key steps:\n1. Sauté aromatics.\n2. Simmer sauce and add veggies.\n3. Plate with quinoa.\nIt's vegetarian-friendly and supplies 32g protein. Should I log it or suggest swaps?"
  },
  {
    role: "user",
    content: "How are my macros vs. target?"
  },
  {
    role: "assistant",
    content:
      "You've logged **<CALORIES> kcal** today (target: <CALORIE_TARGET>). Protein is at <PROTEIN>% of goal, carbs at <CARBS>% and fats at <FATS>%. Focus dinner on lean protein to close the gap."
  },
  {
    role: "user",
    content: "What stretches help with lower back pain?"
  },
  {
    role: "assistant",
    content:
      "Try cat-cow, child's pose, and 90/90 hip stretches—hold each for 30 seconds. If pain persists or worsens, please check with a medical professional."
  }
];

