const SESSION_KEY = "sbt-owner-ok";
const HASH_KEY = "sbt-owner-hash";
const GEMINI_KEY = "sbt-gemini";
const GITHUB_KEY = "sbt-github";

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function storedHash() {
  return (window.OWNER_CONFIG && window.OWNER_CONFIG.passwordHash) || localStorage.getItem(HASH_KEY) || "";
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

function lockStudio() {
  sessionStorage.removeItem(SESSION_KEY);
}
