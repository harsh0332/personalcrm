/**
 * Per-Lead Spoken Hinglish Call Script Templates (KliqCraft Sales Call Engine)
 *
 * CALLER CONFIGURATION (SINGLE SOURCE OF TRUTH):
 */
export const CALLER_CONFIG = {
  CALLER_NAME: "Harsh",
  COMPANY_NAME: "KliqCraft",
};

/**
 * FORBIDDEN PHRASES (DO NOT ADD THESE - THEY INVITE IMMEDIATE HANG-UPS):
 * - "aapko abhi time hai kya" or "time hai kya"
 * - "did I catch you at a bad time" or "bad time"
 * - "ek minute" or "do minute" or "minute" (Ask ONLY for "30 second")
 * - Internal tool name "CallDesk" must NEVER be spoken to a customer.
 */

export interface ScriptBlockA {
  line1: string;
  line2: string;
  line3: string;
}

export interface ScriptBlockB {
  text: string;
}

export interface ScriptBlockC {
  question: string;
}

export interface ScriptBlockD {
  problemStatement: string;
}

export interface ScriptObjection {
  objection: string;
  reply: string;
}

export interface GeneratedCallScript {
  opener: ScriptBlockA;
  whyThem: ScriptBlockB | null;
  observation: ScriptBlockC;
  costOfProblem: ScriptBlockD;
  objections: ScriptObjection[];
}

export interface LeadScriptData {
  name: string;
  area: string | null;
  category: string | null;
  rating: number | null;
  review_count: number | null;
  gap_reasons: string[] | null;
}

/**
 * Generates a per-lead call script instantly without any network or AI calls.
 */
export function generateCallScript(lead: LeadScriptData): GeneratedCallScript {
  const gaps = (lead.gap_reasons || []).map((g) => g.toLowerCase());
  const isSocialOnly = gaps.some((g) => g.includes("social"));
  const isNoWebsite = gaps.some((g) => g.includes("no website"));

  // -----------------------------------------------------------------
  // 1. OPENER (Line 1: Name + Company, Line 2: Single Specific True Fact, Line 3: 30 Second Ask)
  // -----------------------------------------------------------------
  let openerFactLine = `Google pe dekha aap ${lead.area ? `${lead.area} me ` : ''}top ${lead.category || 'business'} searches me aate hain.`;

  if (lead.review_count !== null && lead.review_count > 0) {
    const ratingStr = lead.rating ? ` aur ${lead.rating.toFixed(1)} rating` : "";
    openerFactLine = `Google pe dekha aapke ${lead.review_count} reviews${ratingStr} hain.`;
  } else if (isSocialOnly) {
    openerFactLine = "Google listing pe dekha website ki jagah sirf social media page link hai.";
  } else if (isNoWebsite) {
    openerFactLine = "Google listing pe dekha website ka link missing hai.";
  }

  const opener: ScriptBlockA = {
    line1: `Namaste! Mai ${CALLER_CONFIG.CALLER_NAME} bol raha hoon ${CALLER_CONFIG.COMPANY_NAME} se.`,
    line2: openerFactLine,
    line3: "Kya mai 30 second baat kar sakta hoon?",
  };

  // -----------------------------------------------------------------
  // 2. WHY THEM (Compliment — Short complete Hinglish sentences, 0 filler if review_count is null)
  // -----------------------------------------------------------------
  let whyThem: ScriptBlockB | null = null;

  if (lead.review_count !== null && lead.review_count > 0) {
    const sentence1 = `Google pe aapki profile kaafi solid hai — ${lead.review_count} reviews hain${
      lead.rating ? ` aur ${lead.rating.toFixed(1)} rating` : ""
    }.`;

    let sentence2 = "Aapke sector me aapki kaafi achi online reputation hai.";
    if (lead.area && lead.category) {
      sentence2 = `Aap ${lead.area} ke sabse active ${lead.category}s me se ek hain.`;
    } else if (lead.area) {
      sentence2 = `Aap ${lead.area} me kafi popular hain.`;
    }

    whyThem = {
      text: `${sentence1} ${sentence2}`,
    };
  }

  // -----------------------------------------------------------------
  // 3. THE OBSERVATION (Gap phrased as a curious question)
  // -----------------------------------------------------------------
  let observationQuestion = "Aapki Google profile me website optimization missing dikha — kya local search se regular clients mil rahe hain?";

  if (isNoWebsite) {
    observationQuestion = "Google listing pe aapki website link nahi dikhi — kya aap intentionally website nahi rakhte?";
  } else if (isSocialOnly) {
    observationQuestion = "Website link ki jagah social media page ka link hai — kya lagta hai clients social page se direct convert hote hain?";
  } else if (gaps.some((g) => g.includes("policy") || g.includes("violates"))) {
    observationQuestion = "Listing name me extra keywords dikhe — kya Google se warning ya search penalty ka issue aaya hai?";
  }

  const observation: ScriptBlockC = {
    question: observationQuestion,
  };

  // -----------------------------------------------------------------
  // 4. WHAT IT IS COSTING THEM (Problem language, not feature pitch)
  // -----------------------------------------------------------------
  const costOfProblem: ScriptBlockD = {
    problemStatement:
      "Har mahine hundreds of searchers aapki listing dekhte hain, par proper website na hone se direct competitor ko call kar lete hain. Ye daily client loss hai.",
  };

  // -----------------------------------------------------------------
  // 5. IF THEY SAY... (Objections & Replies)
  // -----------------------------------------------------------------
  const objections: ScriptObjection[] = [
    {
      objection: '"Abhi busy hoon"',
      reply: "Bilkul samajhta hoon. Mai kal subah 11 baje 30 second connect karta hoon, ya WhatsApp pe short details drop kar doon?",
    },
    {
      objection: '"Hai humari website"',
      reply: "Aapka Facebook/Instagram handle hai ya proper domain website? Google listing pe direct website link open nahi ho raha tha, isliye verify kar raha tha.",
    },
    {
      objection: '"Paisa nahi hai abhi"',
      reply: "Ye koi bada naya kharcha nahi hai sir, balki har roz miss hone wale high-value clients ko capture karne ke liye chota setup hai.",
    },
    {
      objection: '"WhatsApp pe bhej do"',
      reply: "Zaroor bhejta hoon! Mai 30 second me info text bhej raha hoon. Kya isi number pe WhatsApp active hai?",
    },
  ];

  return {
    opener,
    whyThem,
    observation,
    costOfProblem,
    objections,
  };
}
