-- 1. Create leads table
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cid TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    phone_e164 TEXT,
    address TEXT,
    area TEXT,
    area_source TEXT,
    query_area TEXT,
    city TEXT,
    category TEXT,
    website TEXT,
    gap_score INT,
    gap_reasons TEXT[],
    demand_score INT,
    review_count INT,
    rating NUMERIC(3, 2),
    tier TEXT,
    source_run_id TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    do_not_call BOOLEAN NOT NULL DEFAULT false,
    attempts INT NOT NULL DEFAULT 0,
    last_called_at TIMESTAMPTZ,
    next_action_at TIMESTAMPTZ,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT leads_owner_cid_key UNIQUE (owner, cid)
);

-- 2. Create activities table (append-only history)
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    owner UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('call', 'whatsapp', 'note', 'status_change')),
    disposition TEXT,
    note TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration_sec INT
);

-- 3. Create followups table
CREATE TABLE IF NOT EXISTS public.followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    owner UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    due_at TIMESTAMPTZ NOT NULL,
    reason TEXT,
    done_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create imports table
CREATE TABLE IF NOT EXISTS public.imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    run_id TEXT,
    total_rows INT NOT NULL DEFAULT 0,
    inserted INT NOT NULL DEFAULT 0,
    duplicates INT NOT NULL DEFAULT 0,
    skipped INT NOT NULL DEFAULT 0,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create dispositions table (seeded)
CREATE TABLE IF NOT EXISTS public.dispositions (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    next_status TEXT,
    follow_up_days INT,
    ends_pursuit BOOLEAN NOT NULL DEFAULT false,
    sets_dnc BOOLEAN NOT NULL DEFAULT false
);

-- Seed dispositions table with 10 default codes
INSERT INTO public.dispositions (code, label, next_status, follow_up_days, ends_pursuit, sets_dnc)
VALUES
    ('no_answer', 'No answer', NULL, 2, false, false),
    ('busy_callback', 'Call back later', NULL, NULL, false, false),
    ('interested', 'Interested', 'interested', 3, false, false),
    ('meeting_fixed', 'Meeting fixed', 'meeting_fixed', NULL, false, false),
    ('quote_sent', 'Quote sent', 'quote_sent', 4, false, false),
    ('converted', 'Converted', 'won', NULL, true, false),
    ('not_interested', 'Not interested', 'lost', NULL, true, false),
    ('already_has', 'Already has one', 'lost', NULL, true, false),
    ('wrong_number', 'Wrong number', 'invalid', NULL, true, false),
    ('do_not_call', 'Do not call again', NULL, NULL, true, true)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    next_status = EXCLUDED.next_status,
    follow_up_days = EXCLUDED.follow_up_days,
    ends_pursuit = EXCLUDED.ends_pursuit,
    sets_dnc = EXCLUDED.sets_dnc;

-- 6. Indexes for query optimization
-- Serves querying upcoming call queue ordered by scheduled action time
CREATE INDEX IF NOT EXISTS idx_leads_owner_next_action_at ON public.leads (owner, next_action_at);

-- Serves filtering leads by stage (e.g., 'new', 'interested', 'won', 'lost')
CREATE INDEX IF NOT EXISTS idx_leads_owner_status ON public.leads (owner, status);

-- Serves sorting and filtering lead list queues by priority tier
CREATE INDEX IF NOT EXISTS idx_leads_owner_tier ON public.leads (owner, tier);

-- Serves filtering lead list queues by target geographic territory/area
CREATE INDEX IF NOT EXISTS idx_leads_owner_area ON public.leads (owner, area);

-- Serves fetching activity history for a specific lead chronologically
CREATE INDEX IF NOT EXISTS idx_activities_owner_lead_occurred ON public.activities (owner, lead_id, occurred_at DESC);

-- Serves querying scheduled follow-up reminders due for current user
CREATE INDEX IF NOT EXISTS idx_followups_owner_due_at ON public.followups (owner, due_at);

-- 7. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositions ENABLE ROW LEVEL SECURITY;

-- 8. Row Level Security Policies

-- Dispositions: Readable by everyone (authenticated & anon)
CREATE POLICY "Allow public read access to dispositions"
    ON public.dispositions FOR SELECT
    USING (true);

-- Leads: Accessible only by owner
CREATE POLICY "Users can manage own leads"
    ON public.leads
    USING (auth.uid() = owner)
    WITH CHECK (auth.uid() = owner);

-- Activities: Accessible only by owner
CREATE POLICY "Users can manage own activities"
    ON public.activities
    USING (auth.uid() = owner)
    WITH CHECK (auth.uid() = owner);

-- Followups: Accessible only by owner
CREATE POLICY "Users can manage own followups"
    ON public.followups
    USING (auth.uid() = owner)
    WITH CHECK (auth.uid() = owner);

-- Imports: Accessible only by owner
CREATE POLICY "Users can manage own imports"
    ON public.imports
    USING (auth.uid() = owner)
    WITH CHECK (auth.uid() = owner);
