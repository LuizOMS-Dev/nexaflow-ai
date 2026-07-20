UPDATE "User"
SET preferences = (preferences::jsonb - 'platformTour')
WHERE preferences IS NOT NULL
  AND preferences::jsonb ? 'platformTour';
