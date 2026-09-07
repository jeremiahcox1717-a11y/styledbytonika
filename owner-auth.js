const SESSION_KEY = "sbt-owner-ok";
const HASH_KEY = "sbt-owner-hash";
const GEMINI_KEY = "sbt-gemini";
const GITHUB_KEY = "sbt-github";

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function passVariants(typed) {
  const raw = String(typed ?? "");
  const trimmed = raw.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
  const lower = trimmed.toLowerCase();
  const noDot = lower.replace(/\.+$/, "");
  return [...new Set([raw, trimmed, lower, noDot, trimmed.replace(/\.+$/, "")].filter(Boolean))];
}

async function passwordMatches(typed) {
  const allowed = storedHash();
  if (!allowed) return false;
  const hashes = await Promise.all(passVariants(typed).map(sha256));
  return hashes.includes(allowed);
}

function storedHash() {
  const fromConfig = window.OWNER_CONFIG && window.OWNER_CONFIG.passwordHash;
  return String(fromConfig || localStorage.getItem(HASH_KEY) || "").trim().toLowerCase();
}

function saveHash(hash) {
  localStorage.setItem(HASH_KEY, hash);
  if (window.OWNER_CONFIG) window.OWNER_CONFIG.passwordHash = hash;
}

function isUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === "1" && Boolean(storedHash());
}

function markUnlocked() {
  sessionStorage.setItem(SESSION_KEY, "1");
}

function takeUnlockTicket() {
  if (sessionStorage.getItem(SESSION_KEY) !== "1" || !storedHash()) return false;
  sessionStorage.removeItem(SESSION_KEY);
  return true;
}

function lockStudio() {
  sessionStorage.removeItem(SESSION_KEY);
}
