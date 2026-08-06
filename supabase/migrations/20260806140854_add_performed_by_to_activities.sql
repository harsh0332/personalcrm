-- Add performed_by column to public.activities table
ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
