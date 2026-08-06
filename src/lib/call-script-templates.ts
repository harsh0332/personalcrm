/**
 * CallDesk Per-Lead Spoken Hinglish Call Script Templates
 *
 * FORBIDDEN PHRASES (DO NOT ADD THESE - THEY INVITE IMMEDIATE HANG-UPS):
 * - "aapko abhi time hai kya" or "time hai kya"
 * - "did I catch you at a bad time" or "bad time"
 * - "ek minute" or "do minute" or "minute" (Ask ONLY for "30 second")
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
  // A. OPENER (Must be 3 lines or fewer, ask for 30 second only, 0 pitch)
  const opener: ScriptBlockA = {
    line1: "Namaste! Mai Harsh bol raha hoon CallDesk se.",
    line2: `Google pe aapka business listing "${lead.name}" dekha.`,
    line3: "Kya mai 30 second baat kar sakta hoon?",
  };

  // B. WHY THEM (Compliment based STRICTLY on real numbers. If null, return null)
  let whyThem: ScriptBlockB | null = null;
  if (lead.review_count !== null && lead.review_count > 0) {
    const areaText = lead.area ? ` ${lead.area} me` : "";
    const categoryText = lead.category ? ` ${lead.category}` : " business";
    const ratingText = lead.rating ? ` aur ${lead.rating.toFixed(1)} rating` : "";

    whyThem = {
      text: `Aap${areaText}${ratingText} ke sath ${lead.review_count} Google reviews wale top${categoryText} me se ek hain.`,
    };
  }

  // C. THE OBSERVATION (Gap as a curious question, not an accusation)
  let observationQuestion = "Aapki Google profile me website optimization missing dikha — kya local search se regular clients mil rahe hain?";
  const gaps = lead.gap_reasons || [];

  if (gaps.some((g) => g.toLowerCase().includes("no website"))) {
    observationQuestion = "Google listing pe aapki website link nahi dikhi — kya aap intentionally website nahi rakhte?";
  } else if (gaps.some((g) => g.toLowerCase().includes("social"))) {
    observationQuestion = "Website link ki jagah social media page ka link hai — kya lagta hai clients social page se direct convert hote hain?";
  } else if (gaps.some((g) => g.toLowerCase().includes("policy") || g.toLowerCase().includes("violates"))) {
    observationQuestion = "Listing name me extra keywords dikhe — kya Google se warning ya search penalty ka issue aaya hai?";
  }

  const observation: ScriptBlockC = {
    question: observationQuestion,
  };

  // D. WHAT IT IS COSTING THEM (Problem language, not feature pitch)
  const costOfProblem: ScriptBlockD = {
    problemStatement:
      "Har mahine hundreds of searchers aapki listing dekhte hain, par proper website na hone se direct competitor ko call kar lete hain. Ye daily client loss hai.",
  };

  // E. IF THEY SAY... (Common objections & proven replies)
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
