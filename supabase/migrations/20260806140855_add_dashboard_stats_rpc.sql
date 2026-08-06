-- Update PostgreSQL RPC function for server-side Dashboard stats aggregation (Phase 6.1 Fixes)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL,
    p_caller_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_owner UUID := COALESCE(auth.uid(), p_caller_id);
    v_total_leads INT;
    v_dialled INT;
    v_connected INT;
    v_conversations INT;
    v_interested INT;
    v_meeting_fixed INT;
    v_quote_sent INT;
    v_won INT;

    v_hourly_stats JSONB;
    v_gap_stats JSONB;
    v_review_stats JSONB;
    v_callers_count INT;
BEGIN
    -- 1. Total Leads Count in DB
    SELECT COUNT(*) INTO v_total_leads
    FROM public.leads
    WHERE (v_owner IS NULL OR owner = v_owner);

    -- 2. Base Activity Counts (kind = 'call')
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE disposition NOT IN ('no_answer', 'wrong_number')),
        COUNT(*) FILTER (WHERE disposition NOT IN ('no_answer', 'wrong_number') AND duration_sec >= 30),
        COUNT(*) FILTER (WHERE disposition = 'interested'),
        COUNT(*) FILTER (WHERE disposition = 'meeting_fixed'),
        COUNT(*) FILTER (WHERE disposition = 'quote_sent'),
        COUNT(*) FILTER (WHERE disposition = 'converted')
    INTO
        v_dialled,
        v_connected,
        v_conversations,
        v_interested,
        v_meeting_fixed,
        v_quote_sent,
        v_won
    FROM public.activities
    WHERE (v_owner IS NULL OR owner = v_owner)
      AND kind = 'call'
      AND (p_start_time IS NULL OR occurred_at >= p_start_time)
      AND (p_end_time IS NULL OR occurred_at <= p_end_time);

    -- 3. Connect Rate by Hour (0 to 23 local hours in Asia/Kolkata)
    SELECT COALESCE(jsonb_agg(h_row), '[]'::jsonb) INTO v_hourly_stats
    FROM (
        SELECT
            EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'Asia/Kolkata')::INT AS hour,
            COUNT(*) AS dialled,
            COUNT(*) FILTER (WHERE disposition NOT IN ('no_answer', 'wrong_number')) AS connected
        FROM public.activities
        WHERE (v_owner IS NULL OR owner = v_owner)
          AND kind = 'call'
          AND (p_start_time IS NULL OR occurred_at >= p_start_time)
          AND (p_end_time IS NULL OR occurred_at <= p_end_time)
        GROUP BY 1
        ORDER BY 1 ASC
    ) h_row;

    -- 4. Gap Reasons Breakdown (Phase 6.1 Fix: LEFT JOIN LATERAL & 'no gap reason recorded')
    SELECT COALESCE(jsonb_agg(g_row), '[]'::jsonb) INTO v_gap_stats
    FROM (
        SELECT
            COALESCE(g.reason, 'no gap reason recorded') AS reason,
            COUNT(DISTINCT a.id) AS dialled,
            COUNT(DISTINCT a.id) FILTER (WHERE a.disposition NOT IN ('no_answer', 'wrong_number')) AS connected,
            COUNT(DISTINCT a.id) FILTER (WHERE a.disposition = 'interested') AS interested,
            COUNT(DISTINCT a.id) FILTER (WHERE a.disposition = 'converted') AS won
        FROM public.activities a
        JOIN public.leads l ON a.lead_id = l.id
        LEFT JOIN LATERAL unnest(l.gap_reasons) WITH ORDINALITY AS g(reason, ord) ON true
        WHERE (v_owner IS NULL OR a.owner = v_owner)
          AND a.kind = 'call'
          AND (p_start_time IS NULL OR a.occurred_at >= p_start_time)
          AND (p_end_time IS NULL OR a.occurred_at <= p_end_time)
        GROUP BY COALESCE(g.reason, 'no gap reason recorded')
        ORDER BY dialled DESC
    ) g_row;

    -- 5. Review Bands Breakdown (Phase 6.1 Fix: Separate 'Not recorded' band for NULL review_count)
    SELECT COALESCE(jsonb_agg(r_row), '[]'::jsonb) INTO v_review_stats
    FROM (
        SELECT
            CASE
                WHEN l.review_count IS NULL THEN 'Not recorded'
                WHEN l.review_count < 50 THEN 'Under 50'
                WHEN l.review_count BETWEEN 50 AND 150 THEN '50 - 150'
                WHEN l.review_count BETWEEN 151 AND 300 THEN '151 - 300'
                ELSE '300+'
            END AS band,
            COUNT(DISTINCT a.id) AS dialled,
            COUNT(DISTINCT a.id) FILTER (WHERE a.disposition NOT IN ('no_answer', 'wrong_number')) AS connected,
            COUNT(DISTINCT a.id) FILTER (WHERE a.disposition = 'interested') AS interested,
            COUNT(DISTINCT a.id) FILTER (WHERE a.disposition = 'converted') AS won
        FROM public.activities a
        JOIN public.leads l ON a.lead_id = l.id
        WHERE (v_owner IS NULL OR a.owner = v_owner)
          AND a.kind = 'call'
          AND (p_start_time IS NULL OR a.occurred_at >= p_start_time)
          AND (p_end_time IS NULL OR a.occurred_at <= p_end_time)
        GROUP BY 1
        ORDER BY dialled DESC
    ) r_row;

    -- 6. Distinct Callers Count
    SELECT COUNT(DISTINCT performed_by) INTO v_callers_count
    FROM public.activities
    WHERE (v_owner IS NULL OR owner = v_owner) AND kind = 'call';

    -- Return JSON payload
    RETURN jsonb_build_object(
        'total_leads', v_total_leads,
        'dialled', v_dialled,
        'connected', v_connected,
        'conversations', v_conversations,
        'interested', v_interested,
        'meeting_fixed', v_meeting_fixed,
        'quote_sent', v_quote_sent,
        'won', v_won,
        'hourly_stats', v_hourly_stats,
        'gap_stats', v_gap_stats,
        'review_stats', v_review_stats,
        'distinct_callers_count', v_callers_count
    );
END;
$$;
