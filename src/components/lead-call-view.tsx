"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateCallScript } from "@/lib/call-script-templates";
import { ChevronDown } from "lucide-react";
import {
  DEFAULT_WHATSAPP_MESSAGE,
  getSuggestedOpener,
  isOutsideTRAIWindow,
  getWhatsAppUrl,
} from "@/lib/call-utils";
import { DispositionSheet } from "@/components/disposition-sheet";
import {
  Phone,
  MessageSquare,
  Star,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Undo2,
  CheckCircle2,
  X,
  MapPin,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ActiveLeadCallData {
  id: string;
  cid: string;
  name: string;
  phone: string | null;
  phone_e164: string | null;
  area: string | null;
  category: string | null;
  tier: string | null;
  rating: number | null;
  review_count: number | null;
  gap_reasons: string[] | null;
  demand_score: number | null;
  status: string;
  do_not_call: boolean;
  attempts: number;
  area_source: string | null;
}

interface LeadCallViewProps {
  lead: ActiveLeadCallData;
  onNextLead?: () => void;
  onPrevLead?: () => void;
  onClose: () => void;
  totalInQueue?: number;
  currentIndex?: number;
}

export function LeadCallView({
  lead,
  onNextLead,
  onPrevLead,
  onClose,
  totalInQueue = 1,
  currentIndex = 1,
}: LeadCallViewProps) {
  const [showDispSheet, setShowDispSheet] = useState<boolean>(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [awaitingReturn, setAwaitingReturn] = useState<boolean>(false);

  const [undoNotice, setUndoNotice] = useState<string | null>(null);
  const [waMessage, setWaMessage] = useState<string>(DEFAULT_WHATSAPP_MESSAGE);

  const traiWarning = isOutsideTRAIWindow();
  const suggestedOpener = getSuggestedOpener(lead.gap_reasons);
  const dialablePhone = lead.phone_e164 || lead.phone;
  const whatsappUrl = getWhatsAppUrl(lead.phone, lead.phone_e164, waMessage);

  const awaitingReturnRef = useRef<boolean>(false);
  awaitingReturnRef.current = awaitingReturn;

  const callStartTimeRef = useRef<number | null>(null);
  callStartTimeRef.current = callStartTime;

  // Handle Tab Return via visibilitychange and pageshow (iOS Safari compatible)
  const handleTabReturn = useCallback(() => {
    if (awaitingReturnRef.current && callStartTimeRef.current) {
      const elapsed = Math.round((Date.now() - callStartTimeRef.current) / 1000);
      setDurationSec(elapsed > 0 ? elapsed : 0);
      setShowDispSheet(true);
      setAwaitingReturn(false);
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleTabReturn();
      }
    };

    const onPageShow = (e: Event) => {
      if ((e as PageTransitionEvent).persisted || document.visibilityState === "visible") {
        handleTabReturn();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [handleTabReturn]);

  const handleCallClick = () => {
    if (!dialablePhone) return;
    setCallStartTime(Date.now());
    setAwaitingReturn(true);
  };

  const handleDispositionSuccess = (
    updatedStatus: string,
    isParked: boolean
  ) => {
    setShowDispSheet(false);

    if (isParked) {
      setUndoNotice("Lead parked after 3 unanswered attempts.");
    } else {
      setUndoNotice(`Outcome saved (${updatedStatus}). Advancing...`);
    }

    setTimeout(() => {
      setUndoNotice(null);
    }, 5000);

    // Advance directly to next lead in current queue
    if (onNextLead) {
      onNextLead();
    }
  };

  const isAreaFromQuery = lead.area_source?.toLowerCase() === "query";

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col justify-between p-4 max-w-md mx-auto w-full text-zinc-100 overflow-y-auto">
      {/* TOP BAR: BACK & QUEUE COUNT */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-xs text-zinc-400 hover:text-zinc-100 p-0 h-8"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to List
        </Button>

        <span className="text-xs text-zinc-500 font-mono">
          Lead {currentIndex} of {totalInQueue}
        </span>
      </div>

      {/* FLOATING UNDO NOTICE */}
      {undoNotice && (
        <div className="p-3 bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs rounded-xl flex items-center justify-between shadow-lg my-2">
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {undoNotice}
          </span>
          <button
            onClick={() => setUndoNotice(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ABOVE THE FOLD (ZERO SCROLL NEEDED WHILE PHONE RINGS) */}
      <div className="flex-1 space-y-4 my-auto py-2">
        {/* Business Name */}
        <div>
          <span className="px-2 py-0.5 text-[10px] uppercase rounded-full border bg-emerald-950/80 text-emerald-300 border-emerald-800/80 font-mono font-bold">
            {lead.tier || "Tier U"}
          </span>
          <h1 className="text-xl font-extrabold text-zinc-50 leading-tight mt-1.5 break-words">
            {lead.name}
          </h1>
        </div>

        {/* Sub-line: Area & Category */}
        <div className="text-xs text-zinc-400 flex items-center flex-wrap gap-x-2 gap-y-1">
          {lead.area && <span className="font-semibold text-zinc-200">{lead.area}</span>}
          {lead.area && lead.category && <span className="text-zinc-600">•</span>}
          {lead.category && <span>{lead.category}</span>}
        </div>

        {/* Warning if Area is from Search Query */}
        {isAreaFromQuery && (
          <div className="p-2 bg-amber-950/50 border border-amber-800/70 rounded-lg text-amber-300 text-[11px] flex items-center space-x-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>Area label &quot;{lead.area}&quot; came from search query (unconfirmed address).</span>
          </div>
        )}

        {/* Rating & Review Count */}
        <div className="flex items-center space-x-3 text-xs text-zinc-300">
          {lead.rating !== null && (
            <span className="flex items-center space-x-1 text-amber-400 font-bold">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span>{lead.rating.toFixed(1)}</span>
            </span>
          )}
          {lead.review_count !== null && (
            <span className="text-zinc-400 font-mono">({lead.review_count} reviews)</span>
          )}
          {lead.attempts > 0 && (
            <span className="text-zinc-500 font-mono">Attempts: {lead.attempts}</span>
          )}
        </div>

        {/* GAP REASONS CHIPS OR THIN SCRIPT BADGE */}
        {lead.gap_reasons && lead.gap_reasons.filter((g) => g && g.trim()).length > 0 ? (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono font-bold block">
              Gap Reasons (Opening Pitch)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {lead.gap_reasons.map((r, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 text-xs bg-zinc-900 text-emerald-400 border border-zinc-800 rounded-lg font-medium"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="pt-1">
            <span className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg bg-amber-950/80 text-amber-300 border border-amber-800/80 inline-flex items-center gap-1">
              ⚡ Thin Script — No Known Gap Recorded
            </span>
          </div>
        )}

        {/* 5-BLOCK PER-LEAD CALL SCRIPT */}
        {(() => {
          const script = generateCallScript({
            name: lead.name,
            area: lead.area,
            category: lead.category,
            rating: lead.rating,
            review_count: lead.review_count,
            gap_reasons: lead.gap_reasons,
          });

          return (
            <div className="space-y-3 pt-1">
              {/* BLOCK A: OPENER (ABOVE THE FOLD - 3 SHORT LINES MAX, NO PITCH) */}
              <div className="p-3 bg-zinc-900 border border-emerald-800/80 rounded-xl space-y-1 text-xs">
                <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider block">
                  Block A — Opener (15 Seconds)
                </span>
                <p className="text-zinc-100 font-medium leading-tight">{script.opener.line1}</p>
                <p className="text-zinc-200 leading-tight">{script.opener.line2}</p>
                <p className="text-emerald-300 font-bold leading-tight pt-0.5">{script.opener.line3}</p>
              </div>

              {/* BLOCKS B-E: COLLAPSIBLE SCRIPT DETAILS BELOW THE FOLD */}
              <details className="group bg-zinc-900/90 border border-zinc-800 rounded-xl overflow-hidden text-xs">
                <summary className="p-3 font-bold text-zinc-300 flex items-center justify-between cursor-pointer list-none select-none hover:bg-zinc-800/50">
                  <span className="text-[11px] text-zinc-300 uppercase font-mono tracking-wider">
                    Full Script & Objection Playbook {script.costOfProblem ? "(B–E)" : "(B, C, E)"}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono group-open:rotate-180 transition-transform">
                    ▼
                  </span>
                </summary>

                <div className="p-3 pt-0 space-y-3 border-t border-zinc-800/60 mt-1">
                  {/* BLOCK B: WHY THEM (TRUE NUMBERS ONLY) */}
                  {script.whyThem && (
                    <div className="space-y-0.5 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                      <span className="text-[10px] text-zinc-400 font-mono font-bold uppercase block">
                        Block B — Why Them (Compliment)
                      </span>
                      <p className="text-zinc-200 leading-relaxed italic">{script.whyThem.text}</p>
                    </div>
                  )}

                  {/* BLOCK C: THE OBSERVATION (OPEN QUESTION IF NO GAP) */}
                  <div className="space-y-0.5 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                    <span className="text-[10px] text-amber-400 font-mono font-bold uppercase block">
                      Block C — {script.observation.isOpenQuestion ? "Open Discovery Question (No Known Gap)" : "The Observation (Question)"}
                    </span>
                    <p className="text-zinc-200 leading-relaxed font-medium">&quot;{script.observation.question}&quot;</p>
                  </div>

                  {/* BLOCK D: WHAT IT IS COSTING THEM (OMITTED ENTIRELY WHEN NO KNOWN GAP) */}
                  {script.costOfProblem && (
                    <div className="space-y-0.5 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                      <span className="text-[10px] text-rose-400 font-mono font-bold uppercase block">
                        Block D — What It Is Costing Them
                      </span>
                      <p className="text-zinc-300 leading-relaxed">{script.costOfProblem.problemStatement}</p>
                    </div>
                  )}

                  {/* BLOCK E: IF THEY SAY... (OBJECTIONS) */}
                  <div className="space-y-2 pt-1">
                    <span className="text-[10px] text-sky-400 font-mono font-bold uppercase block">
                      Block E — If They Say... (Objections)
                    </span>
                    <div className="space-y-1.5">
                      {script.objections.map((obj, i) => (
                        <div key={i} className="p-2 bg-zinc-950 rounded-lg border border-zinc-800 space-y-1">
                          <span className="text-[11px] font-bold text-zinc-200 block">{obj.objection}</span>
                          <p className="text-[11px] text-emerald-300 leading-relaxed">{obj.reply}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          );
        })()}
      </div>

      {/* LOWER HALF: CALL ACTIONS & TRAI WARNING (1-THUMB OPERABLE) */}
      <div className="space-y-3 pt-3 border-t border-zinc-800 shrink-0">
        {/* TRAI Commercial Calling Window Warning */}
        {traiWarning.outside && traiWarning.message && (
          <div className="p-2.5 bg-amber-950/70 border border-amber-800 rounded-xl text-amber-300 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="leading-tight text-[11px] font-medium">
              {traiWarning.message}
            </span>
          </div>
        )}

        {/* LARGE CALL & WHATSAPP BUTTONS */}
        <div className="space-y-2">
          {dialablePhone ? (
            <a
              href={`tel:${dialablePhone}`}
              onClick={handleCallClick}
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-zinc-950 font-extrabold text-base rounded-2xl flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
            >
              <Phone className="w-5 h-5 fill-zinc-950" />
              <span>CALL {dialablePhone}</span>
            </a>
          ) : (
            <Button
              disabled
              className="w-full h-14 bg-zinc-800 text-zinc-500 font-bold text-xs rounded-2xl"
            >
              No dialable phone number available
            </Button>
          )}

          <div className="flex gap-2">
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 h-12 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-emerald-400 font-semibold text-xs rounded-xl flex items-center justify-center space-x-2 active:scale-95 transition-all"
              >
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span>WhatsApp</span>
              </a>
            ) : (
              <Button
                disabled
                className="flex-1 h-12 bg-zinc-900 border border-zinc-800 text-zinc-600 text-xs rounded-xl"
              >
                No WhatsApp
              </Button>
            )}

            <Button
              onClick={() => {
                setDurationSec(0);
                setShowDispSheet(true);
              }}
              variant="outline"
              className="flex-1 h-12 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-semibold text-xs rounded-xl"
            >
              Record Disposition
            </Button>
          </div>
        </div>

        {/* PREV / NEXT LEAD NAV BAR */}
        <div className="flex items-center justify-between pt-1 text-xs text-zinc-400">
          <button
            onClick={onPrevLead}
            disabled={!onPrevLead || currentIndex <= 1}
            className="flex items-center space-x-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <button
            onClick={onNextLead}
            disabled={!onNextLead || currentIndex >= totalInQueue}
            className="flex items-center space-x-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none font-semibold"
          >
            Next Lead <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* DISPOSITION SHEET MODAL */}
      <DispositionSheet
        isOpen={showDispSheet}
        onClose={() => setShowDispSheet(false)}
        leadId={lead.id}
        leadName={lead.name}
        currentAttempts={lead.attempts || 0}
        initialDurationSec={durationSec}
        onSuccess={handleDispositionSuccess}
        onEscapeDidNotCall={() => setShowDispSheet(false)}
      />
    </div>
  );
}
