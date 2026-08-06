-- Add duplicates_in_file column to public.imports table
ALTER TABLE public.imports
ADD COLUMN IF NOT EXISTS duplicates_in_file INT NOT NULL DEFAULT 0;
