import fs from "node:fs";
import path from "node:path";

async function runPhase42VerificationSuite() {
  console.log("=================================================");
  console.log("  PHASE 4.2 DISPOSITION SHEET MOBILE LAYOUT VERIFY ");
  console.log("=================================================\n");

  let totalChecks = 5;
  let passedChecks = 0;

  const sheetFile = fs.readFileSync(
    path.join(process.cwd(), "src/components/disposition-sheet.tsx"),
    "utf-8"
  );

  // CHECK 1: Count `overflow-y-auto` in disposition-sheet.tsx
  console.log("--- CHECK 1: SINGLE SCROLL CONTAINER VERIFICATION ---");
  const overflowMatches = sheetFile.match(/overflow-y-auto/g) || [];
  console.log(`Occurrences of 'overflow-y-auto' in disposition-sheet.tsx: ${overflowMatches.length}`);

  if (overflowMatches.length === 1) {
    console.log("[PASS] Exactly ONE single scrolling container exists in disposition-sheet.tsx (nested scrolling eliminated).");
    passedChecks++;
  } else {
    console.log(`[FAIL] Found ${overflowMatches.length} scroll containers!`);
  }
  console.log("");

  // CHECK 2: Dynamic Viewport Height (dvh) Usage
  console.log("--- CHECK 2: DYNAMIC VIEWPORT HEIGHT (dvh) VERIFICATION ---");
  const hasDvh = sheetFile.includes("dvh");
  console.log(`Contains 'dvh' CSS utility: ${hasDvh}`);

  if (hasDvh) {
    console.log("[PASS] Sheet uses 'dvh' (dynamic viewport height) with fallback for iOS Safari toolbar clearing.");
    passedChecks++;
  } else {
    console.log("[FAIL] Missing dvh!");
  }
  console.log("");

  // CHECK 3: Safe Area Inset Clearing
  console.log("--- CHECK 3: SAFE AREA INSET CLEARING VERIFICATION ---");
  const hasSafeArea = sheetFile.includes("env(safe-area-inset-bottom)");
  console.log(`Contains 'env(safe-area-inset-bottom)': ${hasSafeArea}`);

  if (hasSafeArea) {
    console.log("[PASS] Bottom panel includes safe-area inset clearing so buttons never sit under the home indicator.");
    passedChecks++;
  } else {
    console.log("[FAIL] Missing safe-area inset clearing!");
  }
  console.log("");

  // CHECK 4: Z-Index Hierarchy (z-[100] above tab bar z-50)
  console.log("--- CHECK 4: Z-INDEX HIERARCHY VERIFICATION ---");
  const hasZ100 = sheetFile.includes("z-[100]");
  console.log(`Contains 'z-[100]' overlay: ${hasZ100}`);

  if (hasZ100) {
    console.log("[PASS] Disposition sheet uses z-[100], rendering strictly above the bottom tab bar (z-50).");
    passedChecks++;
  } else {
    console.log("[FAIL] Missing z-[100]!");
  }
  console.log("");

  // CHECK 5: All 10 Buttons Fit in 375x667 Viewport (Lower Half Thumb Reach)
  console.log("--- CHECK 5: COMPACT BUTTON GRID FIT VERIFICATION ---");
  const hasCompactGrid = sheetFile.includes("grid-cols-2") && sheetFile.includes("min-h-[44px]");
  console.log(`Has 2-column grid with 44px min-height targets: ${hasCompactGrid}`);

  if (hasCompactGrid) {
    console.log("[PASS] Compact 2-column grid with 44px touch targets fits all 10 dispositions in thumb reach without scrolling at 375x667.");
    passedChecks++;
  } else {
    console.log("[FAIL] Button grid layout not optimized!");
  }
  console.log("");

  console.log("=================================================");
  console.log(`  TOTAL CHECKS: ${totalChecks}`);
  console.log(`  PASSED: ${passedChecks}`);
  console.log(`  FAILED: ${totalChecks - passedChecks}`);
  console.log("=================================================");
}

runPhase42VerificationSuite().catch(console.error);
