import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";

// Ensure public/icons directory exists
const iconsDir = path.join(process.cwd(), "public", "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

/**
 * Creates a CallDesk PWA Icon with a dark theme gradient background (#09090b to #18181b),
 * an emerald glow (#10b981), and a phone/dial icon graphic.
 */
function generateIcon(size, isMaskable = false, isApple = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#09090b");
  gradient.addColorStop(1, "#18181b");
  ctx.fillStyle = gradient;

  if (isApple) {
    // Apple Touch Icon: Filled square (iOS applies rounded corners automatically)
    ctx.fillRect(0, 0, size, size);
  } else if (!isMaskable) {
    // Standard icon: Rounded rectangle
    const cornerRadius = size * 0.22;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, cornerRadius);
    ctx.fill();
  } else {
    // Maskable icon: Full canvas fill for Android adaptive icon safe zone
    ctx.fillRect(0, 0, size, size);
  }

  // Safe area padding for maskable icons (inner 80%)
  const scale = isMaskable ? 0.75 : 0.85;
  const centerX = size / 2;
  const centerY = size / 2;

  // Outer Emerald Glow Ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, size * 0.32 * scale, 0, Math.PI * 2);
  ctx.strokeStyle = "#059669";
  ctx.lineWidth = size * 0.04 * scale;
  ctx.stroke();
  ctx.restore();

  // Inner Emerald Circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, size * 0.26 * scale, 0, Math.PI * 2);
  ctx.fillStyle = "#10b981";
  ctx.fill();
  ctx.restore();

  // Phone Handle Symbol (White)
  ctx.save();
  ctx.fillStyle = "#09090b";
  ctx.translate(centerX, centerY);

  // Phone receiver shape
  const iconScale = size * 0.003 * scale;
  ctx.beginPath();
  ctx.arc(-8 * iconScale, -10 * iconScale, 6 * iconScale, 0, Math.PI * 2);
  ctx.arc(10 * iconScale, 8 * iconScale, 6 * iconScale, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-10 * iconScale, -6 * iconScale);
  ctx.quadraticCurveTo(0, -12 * iconScale, 6 * iconScale, -10 * iconScale);
  ctx.lineTo(10 * iconScale, 6 * iconScale);
  ctx.quadraticCurveTo(12 * iconScale, 0, -6 * iconScale, 10 * iconScale);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.restore();

  return canvas.toBuffer("image/png");
}

console.log("Generating PWA Icons for CallDesk...");

try {
  fs.writeFileSync(path.join(iconsDir, "icon-192x192.png"), generateIcon(192));
  fs.writeFileSync(path.join(iconsDir, "icon-512x512.png"), generateIcon(512));
  fs.writeFileSync(path.join(iconsDir, "icon-maskable-192x192.png"), generateIcon(192, true));
  fs.writeFileSync(path.join(iconsDir, "icon-maskable-512x512.png"), generateIcon(512, true));
  fs.writeFileSync(path.join(iconsDir, "apple-touch-icon.png"), generateIcon(180, false, true));
  console.log("[SUCCESS] Generated 5 PWA icons in public/icons/");
} catch (err) {
  console.error("Canvas icon generation error:", err.message);
  // Fallback: Write SVG-based static PNG or check canvas availability
}
