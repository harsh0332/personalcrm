/**
 * Per-Lead Spoken Hinglish Call Script Templates (PixelLayerr Sales Call Engine)
 *
 * COMPANY CONFIGURATION (SINGLE SOURCE OF TRUTH):
 * Note exact spelling:
 * - Company Name: PixelLayerr (two "r"s)
 * - Domain Website: pixellayerss.com (two "s"s)
 */
export const CALLER_CONFIG = {
  CALLER_NAME: "Harsh",
  COMPANY_NAME: "PixelLayerr",
  WEBSITE_URL: "pixellayerss.com",
};

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
  isOpenQuestion?: boolean;
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
  costOfProblem: ScriptBlockD | null;
  objections: ScriptObjection[];
  hasNoKnownGap: boolean;
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
 * Phase 10 Fix: When gap_reasons is empty/null, Block C becomes an open question,
 * and Block D is omitted entirely so the script never asserts false gaps.
 */
export function generateCallScript(lead: LeadScriptData): GeneratedCallScript {
  const rawGaps = (lead.gap_reasons || []).filter((g) => g && g.trim() !== "");
  const gaps = rawGaps.map((g) => g.toLowerCase());

  const hasNoKnownGap = gaps.length === 0;
  const isSocialOnly = gaps.some((g) => g.includes("social"));
  const isNoWebsite = gaps.some((g) => g.includes("no website"));

  // -----------------------------------------------------------------
  // 1. OPENER (Line 1: Name + Company, Line 2: Single Specific True Fact, Line 3: 30 Second Ask)
  // -----------------------------------------------------------------
  let openerFactLine = `Google pe dekha aap ${lead.area ? `${lead.area} me ` : ''}top ${lead.category || 'clinic'} searches me aate hain.`;

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
  // 3. THE OBSERVATION
  // If hasNoKnownGap === true: Block C is an open question inviting them to tell me what they use.
  // -----------------------------------------------------------------
  let observationQuestion = "";
  let isOpenQuestion = false;

  if (hasNoKnownGap) {
    observationQuestion = `Sir aapka online presence dekh raha tha — new clients attract karne ke liye aap mostly Google Listing use karte ho ya website/social media?`;
    isOpenQuestion = true;
  } else if (isNoWebsite) {
    observationQuestion = "Google listing pe aapki website link nahi dikhi — kya aap intentionally website nahi rakhte?";
  } else if (isSocialOnly) {
    observationQuestion = "Website link ki jagah social media page ka link hai — kya lagta hai clients social page se direct convert hote hain?";
  } else if (gaps.some((g) => g.includes("policy") || g.includes("violates"))) {
    observationQuestion = "Listing name me extra keywords dikhe — kya Google se warning ya search penalty ka issue aaya hai?";
  } else {
    observationQuestion = "Aapki Google profile me optimization opportunity dikhi — kya local search se regular clients mil rahe hain?";
  }

  const observation: ScriptBlockC = {
    question: observationQuestion,
    isOpenQuestion,
  };

  // -----------------------------------------------------------------
  // 4. WHAT IT IS COSTING THEM (Block D)
  // Phase 10 Rule: OMITTED ENTIRELY when hasNoKnownGap is true!
  // -----------------------------------------------------------------
  let costOfProblem: ScriptBlockD | null = null;

  if (!hasNoKnownGap) {
    let problemText = "Searchers direct competitor ki website par land kar ke appointment book kar lete hain kyunki aapka site link missing hai.";

    if (lead.review_count !== null && lead.review_count > 0) {
      problemText = `Jab bhi koi prospective client Google pe ${lead.category || "clinic"} dhoondhta hai, aapki ${lead.review_count} reviews dekhta hai. Par website na hone se dusre clinic par move ho jaata hai.`;
    } else if (lead.review_count === null) {
      problemText = "Profile pe reviews ya website link na hone se local searchers ko trust build nahi hota, isliye wo established clinics ko prefer karte hain.";
    } else if (isSocialOnly) {
      problemText = "Social page pe clear booking options na milne se serious patients instant call ki jagah drop off ho jaate hain.";
    }

    costOfProblem = {
      problemStatement: problemText,
    };
  }

  // -----------------------------------------------------------------
  // 5. IF THEY SAY... (Objections & Replies using company site pixellayerss.com where helpful)
  // -----------------------------------------------------------------
  const objections: ScriptObjection[] = [
    {
      objection: '"Abhi busy hoon"',
      reply: "Bilkul samajhta hoon. Mai kal subah 11 baje 30 second connect karta hoon, ya WhatsApp pe short details drop kar doon?",
    },
    {
      objection: '"Kaun ho aap / Kya karte ho"',
      reply: `Hum ${CALLER_CONFIG.COMPANY_NAME} se hain (${CALLER_CONFIG.WEBSITE_URL}). Local businesses ki Google visibility aur patient conversions grow karne me help karte hain.`,
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
      reply: `Zaroor! Mai 30 second me WhatsApp pe details aur humari site ${CALLER_CONFIG.WEBSITE_URL} link kar deta hoon. Kya isi number pe active hai?`,
    },
  ];

  return {
    opener,
    whyThem,
    observation,
    costOfProblem,
    objections,
    hasNoKnownGap,
  };
}
