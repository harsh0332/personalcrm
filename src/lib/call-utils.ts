export const DEFAULT_WHATSAPP_MESSAGE =
  "Hi, I noticed your business listing on Google and wanted to quickly connect regarding your online presence.";

export const SUGGESTED_OPENERS: Record<string, string> = {
  "no website":
    "Aapki Google listing dekh raha tha, usme website ka link nahi hai",
  "social/directory only":
    "Aapke listing pe Instagram to hai par website nahi, isliye call kiya",
  "listing name violation":
    "Aapka listing ka naam Google ki naming policy ke against hai, suspend ho sakta hai",
  "wrong primary category":
    "Aapki listing galat category me hai, isliye search me neeche aa rahi hai",
  "low reviews":
    "Aapke rating aur reviews dekh raha tha, thoda improve karke top me aa sakte hain",
  "missing ssl":
    "Aapki website pe security SSL certificate missing hai, Chrome warn karta hai",
};

export function getSuggestedOpener(gapReasons: string[] | null | undefined): string {
  if (!gapReasons || gapReasons.length === 0) {
    return "Aapki Google business listing dekh raha tha, online presence improve karne ke silsile me call kiya.";
  }

  for (const reason of gapReasons) {
    const rLower = reason.toLowerCase().trim();
    for (const [key, opener] of Object.entries(SUGGESTED_OPENERS)) {
      if (rLower.includes(key)) {
        return opener;
      }
    }
  }

  // Generic fallback based on first gap reason
  return `Aapki listing me ${gapReasons[0]} notice kiya, is silsile me baat karni thi.`;
}

/**
 * Checks if current local time is outside TRAI commercial calling window (9:00 AM - 9:00 PM).
 */
export function isOutsideTRAIWindow(date: Date = new Date()): {
  outside: boolean;
  message: string | null;
} {
  const hours = date.getHours();
  const minutes = date.getMinutes();

  // Outside 9 AM (9:00) to 9 PM (21:00)
  if (hours < 9 || hours >= 21) {
    const formattedTime = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      outside: true,
      message: `⚠️ Current time is ${formattedTime}. TRAI permits commercial calls only between 9:00 AM and 9:00 PM. Dial at your discretion.`,
    };
  }

  return { outside: false, message: null };
}

/**
 * Formats WhatsApp wa.me URL
 */
export function getWhatsAppUrl(
  phone: string | null | undefined,
  phoneE164: string | null | undefined,
  message: string = DEFAULT_WHATSAPP_MESSAGE
): string | null {
  const raw = phoneE164 || phone;
  if (!raw) return null;

  const digitsOnly = raw.replace(/[^\d]/g, "");
  if (!digitsOnly) return null;

  // Ensure Indian 10-digit gets 91 country code prefix
  let formattedPhone = digitsOnly;
  if (digitsOnly.length === 10) {
    formattedPhone = `91${digitsOnly}`;
  }

  const encodedMsg = encodeURIComponent(message);
  return `https://wa.me/${formattedPhone}?text=${encodedMsg}`;
}

/**
 * Calculates next_action_at timestamp based on follow_up_days or chosen date
 */
export function calculateNextActionAt(
  followUpDays: number | null | undefined,
  customDate?: Date | null
): string | null {
  if (customDate) {
    return customDate.toISOString();
  }
  if (followUpDays !== null && followUpDays !== undefined && followUpDays > 0) {
    const target = new Date();
    target.setDate(target.getDate() + followUpDays);
    return target.toISOString();
  }
  return null;
}
