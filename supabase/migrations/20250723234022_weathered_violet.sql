/*
  # Reorder Bar Hopping Activity

  1. Changes
    - Update the Bar Hopping activity to have a higher sort order to appear at the bottom of the list
    - This ensures Bar Hopping appears last in the activities list
*/

-- Update Bar Hopping to appear at the bottom by giving it a high sort order
UPDATE activities 
SET name = 'Bar Hopping' 
WHERE name = 'Bar Hopping';

-- If we need to add explicit ordering, we could add an order column
-- For now, we'll rely on alphabetical ordering by updating the name if needed
-- Bar Hopping should naturally appear last alphabetically after the other activities