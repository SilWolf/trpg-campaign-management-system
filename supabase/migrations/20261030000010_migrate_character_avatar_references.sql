BEGIN;

UPDATE public.characters
SET avatar = 'avatar:default'
WHERE avatar IS NULL
   OR (
       avatar <> 'avatar:default'
       AND avatar !~* '^storage:user-uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/avatars/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/256[.]webp$'
   );

COMMIT;
