"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateNextActionAt } from "@/lib/call-utils";
import { X, Calendar, Clock, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  // Update duration when sheet opens with new calculated time away
  useEffect(() => {
    if (isOpen) {
      setDurationSec(initialDurationSec);
      setErrorMsg(null);
      setSelectedDispCode(null);
    }
  }, [isOpen, initialDurationSec]);

  // Fetch dispositions table from Supabase
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

      // Check if custom date is required for busy_callback / meeting_fixed
      const needsDatePicker = disp.follow_up_days === null && (disp.code === "busy_callback" || disp.code === "meeting_fixed");
      if (needsDatePicker && !customDate) {
        // Default custom date to Tomorrow
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

      // Calculate next_action_at
      let targetFollowUpDate: Date | null = null;
      if (customDate) {
        targetFollowUpDate = new Date(customDate);
      }
      const nextActionAt = calculateNextActionAt(disp.follow_up_days, targetFollowUpDate);

      // 1. Check previous no_answer activity count on this lead
      let noAnswerCount = 0;
      if (disp.code === "no_answer") {
        const { data: noAnsActs } = await supabase
          .from("activities")
          .select("id")
          .eq("lead_id", leadId)
          .eq("disposition", "no_answer");

        noAnswerCount = (noAnsActs?.length || 0) + 1; // including current one
      }

      // Check 3 No-Answer Parked Guardrail
      const shouldPark = disp.code === "no_answer" && noAnswerCount >= 3;
      const finalNextStatus = shouldPark ? "parked" : disp.next_status;

      // 2. INSERT into activities (APPEND-ONLY, NO UPDATE/DELETE)
      const { error: actErr } = await supabase.from("activities").insert({
        owner: ownerId,
        lead_id: leadId,
        kind: "call",
        disposition: disp.code,
        duration_sec: durationSec || 0,
        note: note.trim() || null,
        occurred_at: nowIso,
      });

      if (actErr) {
        setErrorMsg(`Failed to record call activity: ${actErr.message}`);
        setSaving(false);
        return;
      }

      // 3. UPDATE leads table
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

      // 4. INSERT into followups table if nextActionAt is set
      if (nextActionAt) {
        const { error: fllwErr } = await supabase.from("followups").insert({
          owner: ownerId,
          lead_id: leadId,
          due_at: nextActionAt,
          status: "pending",
          note: note.trim() || null,
        });

        if (fllwErr) {
          console.error("Followup record insert warning:", fllwErr.message);
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-xl max-h-[92vh] overflow-y-auto p-5 space-y-5 text-zinc-200 shadow-2xl animate-in slide-in-from-bottom-5 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <span className="text-[10px] text-emerald-400 font-mono uppercase font-bold tracking-wider block">
              Log Call Outcome
            </span>
            <h2 className="text-base font-bold text-zinc-50 truncate max-w-[260px]">
              {leadName}
            </h2>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onEscapeDidNotCall}
            className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/60"
          >
            I did not call
          </Button>
        </div>

        {/* LOUD ERROR FAILURE BANNER (Input Preserved!) */}
        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border-2 border-rose-800 rounded-xl text-rose-200 text-xs space-y-2">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-mono text-[11px] leading-relaxed">{errorMsg}</div>
            </div>
            {activeDisp && (
              <Button
                onClick={() => executeRecord(activeDisp)}
                disabled={saving}
                className="w-full bg-rose-800 hover:bg-rose-700 text-zinc-100 text-xs font-semibold h-8"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${saving ? "animate-spin" : ""}`} /> Retry Save
              </Button>
            )}
          </div>
        )}

        {/* Editable Approximate Duration & Note Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <label className="text-zinc-400 font-medium flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-emerald-400" /> Approx. Call Duration
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">(sec away)</span>
            </label>
            <input
              type="number"
              value={durationSec}
              onChange={(e) => setDurationSec(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg font-mono text-zinc-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-zinc-400 font-medium">Optional Note</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Call back after 4 PM"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Date Picker for Callback / Meeting Fixed */}
        {activeDisp && activeDisp.follow_up_days === null && (activeDisp.code === "busy_callback" || activeDisp.code === "meeting_fixed") && (
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between text-zinc-300 font-medium">
              <span className="flex items-center gap-1 text-emerald-400">
                <Calendar className="w-4 h-4" /> Pick Follow-up Date for {activeDisp.label}
              </span>
            </div>

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
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs mt-2"
            >
              Confirm Date & Save {activeDisp.label}
            </Button>
          </div>
        )}

        {/* Dynamic Disposition Buttons Grid */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
            Select Call Disposition (One Tap)
          </label>

          <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-0.5">
            {dispositions.map((disp) => {
              const isSelected = selectedDispCode === disp.code;
              let btnStyle = "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-200";

              if (disp.code === "interested" || disp.code === "meeting_fixed" || disp.code === "converted") {
                btnStyle = "bg-emerald-950/60 hover:bg-emerald-900/80 border-emerald-800/80 text-emerald-300 font-bold";
              } else if (disp.code === "not_interested" || disp.code === "wrong_number" || disp.code === "do_not_call") {
                btnStyle = "bg-rose-950/40 hover:bg-rose-900/60 border-rose-800/60 text-rose-300";
              } else if (disp.code === "busy_callback" || disp.code === "quote_sent") {
                btnStyle = "bg-sky-950/40 hover:bg-sky-900/60 border-sky-800/60 text-sky-300";
              }

              return (
                <button
                  key={disp.code}
                  disabled={saving}
                  onClick={() => handleSelectDisposition(disp)}
                  className={`p-3 text-left rounded-xl border text-xs min-h-[48px] flex items-center justify-between transition-all active:scale-95 ${btnStyle} ${
                    isSelected ? "ring-2 ring-emerald-400" : ""
                  }`}
                >
                  <span className="font-semibold leading-tight">{disp.label}</span>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
