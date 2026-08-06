"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateNextActionAt } from "@/lib/call-utils";
import { Clock, Calendar, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enqueueOfflineDisposition } from "@/lib/offline-queue";

export interface DispositionItem {
  code: string;
  label: string;
  next_status: string | null;
  follow_up_days: number | null;
  sets_dnc: boolean;
}

interface DispositionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
  currentAttempts: number;
  initialDurationSec: number;
  onSuccess: (updatedLeadStatus: string, isParked: boolean) => void;
  onEscapeDidNotCall: () => void;
}

export function DispositionSheet({
  isOpen,
  onClose,
  leadId,
  leadName,
  currentAttempts,
  initialDurationSec,
  onSuccess,
  onEscapeDidNotCall,
}: DispositionSheetProps) {
  const [dispositions, setDispositions] = useState<DispositionItem[]>([]);
  const [durationSec, setDurationSec] = useState<number>(initialDurationSec);
  const [note, setNote] = useState<string>("");
  const [selectedDispCode, setSelectedDispCode] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (isOpen) {
      setDurationSec(initialDurationSec);
      setErrorMsg(null);
      setSelectedDispCode(null);
    }
  }, [isOpen, initialDurationSec]);

  useEffect(() => {
    async function loadDispositions() {
      const { data, error } = await supabase
        .from("dispositions")
        .select("code, label, next_status, follow_up_days, sets_dnc");

      if (!error && data) {
        setDispositions(data as DispositionItem[]);
      }
    }
    if (isOpen && dispositions.length === 0) {
      loadDispositions();
    }
  }, [isOpen, dispositions.length, supabase]);

  const handleSelectDisposition = useCallback(
    async (disp: DispositionItem) => {
      setSelectedDispCode(disp.code);
      setErrorMsg(null);

      const needsDatePicker =
        disp.follow_up_days === null &&
        (disp.code === "busy_callback" || disp.code === "meeting_fixed");
      if (needsDatePicker && !customDate) {
        const tmr = new Date();
        tmr.setDate(tmr.getDate() + 1);
        setCustomDate(tmr.toISOString().split("T")[0]);
        return;
      }

      executeRecord(disp);
    },
    [customDate]
  );

  const executeRecord = async (disp: DispositionItem) => {
    setSaving(true);
    setErrorMsg(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const ownerId = user?.id;
      const nowIso = new Date().toISOString();

      let targetFollowUpDate: Date | null = null;
      if (customDate) {
        targetFollowUpDate = new Date(customDate);
      }
      const nextActionAt = calculateNextActionAt(disp.follow_up_days, targetFollowUpDate);

      // Check 3 No-Answer Parked Guardrail
      let noAnswerCount = 0;
      if (disp.code === "no_answer") {
        const { data: noAnsActs } = await supabase
          .from("activities")
          .select("id")
          .eq("lead_id", leadId)
          .eq("disposition", "no_answer");

        noAnswerCount = (noAnsActs?.length || 0) + 1;
      }

      const shouldPark = disp.code === "no_answer" && noAnswerCount >= 3;
      const finalNextStatus = shouldPark ? "parked" : disp.next_status;

      // OFFLINE QUEUE CHECK: If offline, queue in IndexedDB immediately without throwing network errors
      if (typeof window !== "undefined" && !navigator.onLine) {
        await enqueueOfflineDisposition({
          lead_id: leadId,
          lead_name: leadName,
          owner: ownerId || "offline_owner",
          disposition: disp.code,
          note: note.trim() || null,
          followup_due_at: nextActionAt,
          followup_reason: note.trim() || `Followup for ${disp.label}`,
          rating: null,
          call_duration_seconds: durationSec || 0,
        });

        setSaving(false);
        onSuccess(finalNextStatus || "updated", shouldPark);
        return;
      }

      // 1. INSERT into activities (kind, disposition, duration_sec, note, occurred_at, performed_by)
      const { error: actErr } = await supabase.from("activities").insert({
        owner: ownerId,
        lead_id: leadId,
        kind: "call",
        disposition: disp.code,
        duration_sec: durationSec || 0,
        note: note.trim() || null,
        occurred_at: nowIso,
        performed_by: ownerId,
      });

      if (actErr) {
        // Fallback: If error is due to network loss, enqueue to offline queue
        if (typeof window !== "undefined" && !navigator.onLine) {
          await enqueueOfflineDisposition({
            lead_id: leadId,
            lead_name: leadName,
            owner: ownerId || "offline_owner",
            disposition: disp.code,
            note: note.trim() || null,
            followup_due_at: nextActionAt,
            followup_reason: note.trim() || `Followup for ${disp.label}`,
            rating: null,
            call_duration_seconds: durationSec || 0,
          });
          setSaving(false);
          onSuccess(finalNextStatus || "updated", shouldPark);
          return;
        }

        setErrorMsg(`Failed to record call activity: ${actErr.message}`);
        setSaving(false);
        return;
      }

      // 1.5. CLOSE EXISTING OPEN FOLLOW-UPS FOR THIS LEAD (done_at = now)
      const { error: closeFllwErr } = await supabase
        .from("followups")
        .update({ done_at: nowIso })
        .eq("lead_id", leadId)
        .is("done_at", null);

      if (closeFllwErr) {
        console.error("Warning closing open followups:", closeFllwErr.message);
      }

      // 2. UPDATE leads table (attempts, last_called_at, status, do_not_call, next_action_at, updated_at)
      const leadUpdatePayload: Record<string, any> = {
        attempts: currentAttempts + 1,
        last_called_at: nowIso,
        updated_at: nowIso,
      };

      if (finalNextStatus) {
        leadUpdatePayload.status = finalNextStatus;
      }
      if (disp.sets_dnc) {
        leadUpdatePayload.do_not_call = true;
      }
      if (nextActionAt) {
        leadUpdatePayload.next_action_at = nextActionAt;
      }

      const { error: leadErr } = await supabase
        .from("leads")
        .update(leadUpdatePayload)
        .eq("id", leadId);

      if (leadErr) {
        setErrorMsg(`Call activity saved, but updating lead failed: ${leadErr.message}`);
        setSaving(false);
        return;
      }

      // 3. INSERT into followups table (due_at, reason)
      if (nextActionAt) {
        const followupReason = note.trim() || `Followup for ${disp.label}`;
        const { error: fllwErr } = await supabase.from("followups").insert({
          owner: ownerId,
          lead_id: leadId,
          due_at: nextActionAt,
          reason: followupReason,
        });

        if (fllwErr) {
          setErrorMsg(
            `Activity & lead state saved, but creating follow-up commitment failed: ${fllwErr.message}`
          );
          setSaving(false);
          return;
        }
      }

      setSaving(false);
      onSuccess(finalNextStatus || "updated", shouldPark);
    } catch (err: any) {
      setErrorMsg(`Save failed: ${err.message}. Your input is preserved.`);
      setSaving(false);
    }
  };

  const handleQuickDateSelect = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setCustomDate(d.toISOString().split("T")[0]);
  };

  if (!isOpen) return null;

  const activeDisp = dispositions.find((d) => d.code === selectedDispCode);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-xl max-h-[90vh] max-h-[90dvh] flex flex-col justify-between p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-zinc-200 shadow-2xl animate-in slide-in-from-bottom-5 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* PART 1: FIXED HEADER (TOP) */}
        <div className="shrink-0 space-y-2 border-b border-zinc-800 pb-2.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <span className="text-[10px] text-emerald-400 font-mono uppercase font-bold tracking-wider block">
                Log Call Outcome
              </span>
              <h2 className="text-sm font-bold text-zinc-50 truncate">
                {leadName}
              </h2>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={onEscapeDidNotCall}
              className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/60 shrink-0 h-7 px-2"
            >
              I did not call
            </Button>
          </div>

          {/* Compact Duration Line */}
          <div className="flex items-center justify-between text-xs bg-zinc-900/80 px-2.5 py-1.5 rounded-lg border border-zinc-800">
            <span className="text-zinc-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-emerald-400" /> Approx. Call Duration
            </span>
            <div className="flex items-center gap-1 font-mono">
              <input
                type="number"
                value={durationSec}
                onChange={(e) => setDurationSec(parseInt(e.target.value, 10) || 0)}
                className="w-16 px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-center text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-zinc-500 text-[10px]">sec</span>
            </div>
          </div>
        </div>

        {/* PART 2: SINGLE SCROLLING BODY (MIDDLE) */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 py-2 pr-0.5">
          {/* LOUD ERROR FAILURE BANNER */}
          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border-2 border-rose-800 rounded-xl text-rose-200 text-xs space-y-2">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 font-mono text-[11px] leading-relaxed">{errorMsg}</div>
              </div>
              {activeDisp && (
                <Button
                  onClick={() => executeRecord(activeDisp)}
                  disabled={saving}
                  className="w-full bg-rose-800 hover:bg-rose-700 text-zinc-100 text-xs font-semibold h-7"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${saving ? "animate-spin" : ""}`} /> Retry Save
                </Button>
              )}
            </div>
          )}

          {/* Optional Note Field */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium block">
              Optional Note (never blocks recording)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Interested in SEO, call next Tuesday"
              className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Date Picker (shown only when busy_callback or meeting_fixed selected) */}
          {activeDisp &&
            activeDisp.follow_up_days === null &&
            (activeDisp.code === "busy_callback" || activeDisp.code === "meeting_fixed") && (
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2 text-xs">
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Calendar className="w-4 h-4" /> Pick Follow-up Date for {activeDisp.label}
                </span>

                <div className="flex gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleQuickDateSelect(1)}
                    className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px]"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDateSelect(3)}
                    className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px]"
                  >
                    In 3 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDateSelect(7)}
                    className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px]"
                  >
                    Next Week
                  </button>
                </div>

                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-200 focus:outline-none"
                />

                <Button
                  onClick={() => executeRecord(activeDisp)}
                  disabled={saving}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs mt-1 h-8"
                >
                  Confirm Date & Save {activeDisp.label}
                </Button>
              </div>
            )}
        </div>

        {/* PART 3: FIXED FOOTER WITH COMPACT DISPOSITION BUTTONS (THUMB REACH) */}
        <div className="shrink-0 space-y-1.5 pt-2 border-t border-zinc-800 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block px-0.5">
            Select Call Disposition (One Tap)
          </label>

          {/* COMPACT 2-COLUMN GRID (NO INNER SCROLL! ALL 10 FIT IN THUMB REACH) */}
          <div className="grid grid-cols-2 gap-1.5">
            {dispositions.map((disp) => {
              const isSelected = selectedDispCode === disp.code;
              let btnStyle = "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-200";

              if (
                disp.code === "interested" ||
                disp.code === "meeting_fixed" ||
                disp.code === "converted"
              ) {
                btnStyle =
                  "bg-emerald-950/70 hover:bg-emerald-900/90 border-emerald-800/90 text-emerald-300 font-bold";
              } else if (
                disp.code === "not_interested" ||
                disp.code === "wrong_number" ||
                disp.code === "do_not_call"
              ) {
                btnStyle =
                  "bg-rose-950/50 hover:bg-rose-900/70 border-rose-800/70 text-rose-300 font-medium";
              } else if (disp.code === "busy_callback" || disp.code === "quote_sent") {
                btnStyle =
                  "bg-sky-950/50 hover:bg-sky-900/70 border-sky-800/70 text-sky-300 font-medium";
              }

              return (
                <button
                  key={disp.code}
                  disabled={saving}
                  onClick={() => handleSelectDisposition(disp)}
                  className={`p-2.5 text-left rounded-lg border text-xs min-h-[44px] flex items-center justify-between transition-all active:scale-95 ${btnStyle} ${
                    isSelected ? "ring-2 ring-emerald-400" : ""
                  }`}
                >
                  <span className="font-medium leading-tight truncate">{disp.label}</span>
                  {isSelected && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
