-- Rename stool category to toilet and add subType field to existing events
UPDATE "Event" SET
  category = 'toilet',
  details = COALESCE(details, '{}')::jsonb || '{"subType": "stool"}'
WHERE category = 'stool';
