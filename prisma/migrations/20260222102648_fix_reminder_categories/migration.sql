-- Fix reminder categories missed during exercise→activity and stool→toilet renames
UPDATE "Reminder" SET category = 'activity' WHERE category = 'exercise';
UPDATE "Reminder" SET category = 'toilet' WHERE category = 'stool';
