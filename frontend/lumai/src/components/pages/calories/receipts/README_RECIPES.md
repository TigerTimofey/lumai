# Recipe Data Files

## Current State
- **recipes.csv**: 12 recipes (header + 12 data rows)
- **recipe_ingredients.csv**: 85 ingredient entries for recipes 1-12
- **recipes_with_ingredients.json**: 12 complete recipes with all ingredients

## Full Dataset Backup
The full dataset (500 recipes) has been backed up to:
- `recipes_with_ingredients.json.backup` (30,743 lines)

## To Restore Full Dataset
To restore the full 500 recipes:
```bash
cp recipes_with_ingredients.json.backup recipes_with_ingredients.json
# Then regenerate the CSV files or restore from your git history
```

## Why Reduced?
The dataset was reduced from 500 to 12 recipes to:
- Speed up development and testing
- Reduce memory usage
- Make the application more responsive
- Easy to expand later when needed

Last updated: November 16, 2025
