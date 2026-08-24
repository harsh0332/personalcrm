"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateNextActionAt } from "@/lib/call-utils";
import {
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  X,
  Sparkles,
} from "lucide-react";
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
  const [savingLabel, setSavingLabel] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (isOpen) {
      setDurationSec(initialDurationSec);
      setErrorMsg(null);
      setSelectedDispCode(null);
      setSaving(false);
      setSavingLabel("");
    }
  }, [isOpen, initialDurationSec]);

  useEffect(() => {
    async function loadDispositions() {
      const { data, error } = await supabase
        .from("dispositions")
        .select("code, label, next_status, follow_up_days, sets_dnc");

      if (!error && data && data.length > 0) {
        setDispositions(data as DispositionItem[]);
      } else {
        // Fallback default dispositions if offline or network delay
        setDispositions([
          { code: "no_answer", label: "No answer", next_status: null, follow_up_days: 2, sets_dnc: false },
          { code: "busy_callback", label: "Call back later", next_status: null, follow_up_days: null, sets_dnc: false },
          { code: "interested", label: "Interested", next_status: "interested", follow_up_days: 3, sets_dnc: false },
          { code: "meeting_fixed", label: "Meeting fixed", next_status: "meeting_fixed", follow_up_days: null, sets_dnc: false },
          { code: "quote_sent", label: "Quote sent", next_status: "quote_sent", follow_up_days: 4, sets_dnc: false },
          { code: "converted", label: "Converted", next_status: "won", follow_up_days: null, sets_dnc: false },
          { code: "not_interested", label: "Not interested", next_status: "lost", follow_up_days: null, sets_dnc: false },
          { code: "already_has", label: "Already has one", next_status: "lost", follow_up_days: null, sets_dnc: false },
          { code: "wrong_number", label: "Wrong number", next_status: "invalid", follow_up_days: null, sets_dnc: false },
          { code: "do_not_call", label: "Do not call again", next_status: null, follow_up_days: null, sets_dnc: true },
        ]);
      }
    }
    if (isOpen && dispositions.length === 0) {
      loadDispositions();
    }
  }, [isOpen, dispositions.length, supabase]);

  const executeRecord = async (disp: DispositionItem) => {
    setSaving(true);
    setSavingLabel(disp.label);
    setErrorMsg(null);

    try {
      const {
        data: { user },
        error: userErr,
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

      // EXPIRED SESSION OR OFFLINE SAFETY: Save input safely into Phase 8 IndexedDB queue
      if (!user || userErr || (typeof window !== "undefined" && !navigator.onLine)) {
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
      await supabase
        .from("followups")
        .update({ done_at: nowIso })
        .eq("lead_id", leadId)
        .is("done_at", null);

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
        setErrorMsg(`Call saved, but lead update failed: ${leadErr.message}`);
        setSaving(false);
        return;
      }

      // 3. INSERT into followups table (due_at, reason)
      if (nextActionAt) {
        const followupReason = note.trim() || `Followup for ${disp.label}`;
        await supabase.from("followups").insert({
          owner: ownerId,
          lead_id: leadId,
          due_at: nextActionAt,
          reason: followupReason,
        });
      }

      setSaving(false);
      onSuccess(finalNextStatus || "updated", shouldPark);
    } catch (err: any) {
      setErrorMsg(`Save failed: ${err.message}. Your input is preserved.`);
      setSaving(false);
    }
  };

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

  const handleQuickDateSelect = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setCustomDate(d.toISOString().split("T")[0]);
  };

  if (!isOpen) return null;

  const activeDisp = dispositions.find((d) => d.code === selectedDispCode);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* MODAL SHEET CONTAINER (FULL MOBILE VIEWPORT HEIGHT WITH SAFE SCROLL) */}
      <div
        className="w-full max-w-lg bg-zinc-950 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-2xl h-[92vh] h-[92dvh] sm:h-auto sm:max-h-[90vh] flex flex-col text-zinc-100 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* PART 1: TOP STICKY HEADER */}
        <div className="shrink-0 p-4 pb-3 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-emerald-400 font-mono uppercase font-bold tracking-wider block">
                LOG CALL OUTCOME
              </span>
              <h2 className="text-base font-extrabold text-zinc-50 truncate leading-tight">
                {leadName}
              </h2>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onEscapeDidNotCall}
              className="text-xs text-rose-300 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/60 border-rose-800/70 shrink-0 h-8 px-3 rounded-lg font-semibold"
            >
              I did not call
            </Button>
          </div>

          {/* Approx Duration Row */}
          <div className="flex items-center justify-between text-xs bg-zinc-900/90 px-3 py-2 rounded-xl border border-zinc-800">
            <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
              <Clock className="w-4 h-4 text-emerald-400" /> Approx. Call Duration
            </span>
            <div className="flex items-center gap-1.5 font-mono">
              <input
                type="number"
                value={durationSec}
                onChange={(e) => setDurationSec(parseInt(e.target.value, 10) || 0)}
                className="w-16 px-2 py-1 bg-zinc-950 border border-zinc-700 rounded-lg text-center text-xs text-zinc-100 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-zinc-400 text-xs font-sans">sec</span>
            </div>
          </div>
        </div>

        {/* PART 2: UNIFIED SCROLLABLE BODY (NOTES + DATE PICKER + ALL 10 DISPOSITION BUTTONS) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-28">
          {/* LOUD ERROR BANNER IF ANY */}
          {errorMsg && (
            <div className="p-3 bg-rose-950/90 border-2 border-rose-800 rounded-xl text-rose-200 text-xs space-y-2">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 font-mono text-[11px] leading-relaxed">{errorMsg}</div>
              </div>
              {activeDisp && (
                <Button
                  onClick={() => executeRecord(activeDisp)}
                  disabled={saving}
                  className="w-full bg-rose-800 hover:bg-rose-700 text-zinc-100 text-xs font-semibold h-8"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${saving ? "animate-spin" : ""}`} /> Retry Save
                </Button>
              )}
            </div>
          )}

          {/* ACTIVE SAVING INDICATOR BANNER */}
          {saving && (
            <div className="p-3 bg-emerald-950 border border-emerald-700 rounded-xl text-emerald-200 text-xs flex items-center space-x-2.5 animate-pulse shadow-lg">
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
              <span className="font-semibold">
                Saving outcome "{savingLabel}" and advancing to next lead...
              </span>
            </div>
          )}

          {/* Optional Note Field */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-300 font-medium flex items-center justify-between">
              <span>Call Notes (Optional)</span>
              <span className="text-[10px] text-zinc-500 font-mono">never blocks save</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Interested in SEO, follow up next Tuesday..."
              className="w-full px-3.5 py-2.5 bg-zinc-900/90 border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-600 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Date Picker (shown only when busy_callback or meeting_fixed selected) */}
          {activeDisp &&
            activeDisp.follow_up_days === null &&
            (activeDisp.code === "busy_callback" || activeDisp.code === "meeting_fixed") && (
              <div className="p-3.5 bg-emerald-950/30 border border-emerald-800/80 rounded-2xl space-y-2.5 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
                  <Calendar className="w-4 h-4 text-emerald-400" /> Pick Follow-up Date for {activeDisp.label}
                </span>

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleQuickDateSelect(1)}
                    className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDateSelect(3)}
                    className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
                  >
                    In 3 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDateSelect(7)}
                    className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
                  >
                    Next Week
                  </button>
                </div>

                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />

                <Button
                  onClick={() => executeRecord(activeDisp)}
                  disabled={saving}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-extrabold text-xs h-10 rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-1.5"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Confirm Date & Save {activeDisp.label}</span>
                </Button>
              </div>
            )}

          {/* DISPOSITION BUTTONS SECTION */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-emerald-400 block">
                Tap Disposition to Save & Advance
              </label>
              <span className="text-[10px] text-zinc-500 font-mono">1-tap instant action</span>
            </div>

            {/* 2-COLUMN GRID WITH COMFORTABLE 48PX BUTTON HEIGHT */}
            <div className="grid grid-cols-2 gap-2">
              {dispositions.map((disp) => {
                const isSelected = selectedDispCode === disp.code;
                let btnStyle = "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-200";

                if (
                  disp.code === "interested" ||
                  disp.code === "meeting_fixed" ||
                  disp.code === "converted"
                ) {
                  btnStyle =
                    "bg-emerald-950/80 hover:bg-emerald-900 border-emerald-700/80 text-emerald-200 font-bold shadow-sm";
                } else if (
                  disp.code === "not_interested" ||
                  disp.code === "wrong_number" ||
                  disp.code === "do_not_call"
                ) {
                  btnStyle =
                    "bg-rose-950/60 hover:bg-rose-900/80 border-rose-800/70 text-rose-200 font-semibold";
                } else if (disp.code === "busy_callback" || disp.code === "quote_sent") {
                  btnStyle =
                    "bg-sky-950/60 hover:bg-sky-900/80 border-sky-800/70 text-sky-200 font-semibold";
                }

                return (
                  <button
                    key={disp.code}
                    disabled={saving}
                    onClick={() => handleSelectDisposition(disp)}
                    className={`p-3 text-left rounded-xl border text-xs min-h-[48px] flex items-center justify-between transition-all active:scale-95 touch-manipulation ${btnStyle} ${
                      isSelected ? "ring-2 ring-emerald-400 border-transparent" : ""
                    }`}
                  >
                    <span className="leading-snug">{disp.label}</span>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 ml-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
