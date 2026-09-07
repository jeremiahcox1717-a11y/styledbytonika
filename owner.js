const SESSION_KEY = "sbt-owner-ok";
const HASH_KEY = "sbt-owner-hash";
const GEMINI_KEY = "sbt-gemini";
const GITHUB_KEY = "sbt-github";

const gate = document.querySelector("#gate");
const studio = document.querySelector("#studio");
const gateForm = document.querySelector("#gate-form");
const gateCopy = document.querySelector("#gate-copy");
const gateError = document.querySelector("#gate-error");
const gateSubmit = document.querySelector("#gate-submit");
const passInput = document.querySelector("#owner-pass");
const pass2 = document.querySelector("#owner-pass-2");
const passConfirmWrap = document.querySelector("#pass-confirm-wrap");
const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const publishBtn = document.querySelector("#publish-btn");
const publishStatus = document.querySelector("#publish-status");
const geminiInput = document.querySelector("#gemini-key");
const githubInput = document.querySelector("#github-token");
const passwordForm = document.querySelector("#password-form");
const passCurrent = document.querySelector("#pass-current");
const passNew = document.querySelector("#pass-new");
const passNew2 = document.querySelector("#pass-new-2");
const passStatus = document.querySelector("#pass-status");

let siteContent = null;
let setupMode = false;

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function storedHash() {
  return localStorage.getItem(HASH_KEY) || (window.OWNER_CONFIG && window.OWNER_CONFIG.passwordHash) || "";
}

function saveHash(hash) {
  localStorage.setItem(HASH_KEY, hash);
  if (window.OWNER_CONFIG) window.OWNER_CONFIG.passwordHash = hash;
}

function unlock() {
  sessionStorage.setItem(SESSION_KEY, "1");
  gate.hidden = true;
  studio.hidden = false;
  document.body.classList.add("owner-unlocked");
  geminiInput.value = sessionStorage.getItem(GEMINI_KEY) || "";
  githubInput.value = sessionStorage.getItem(GITHUB_KEY) || "";
  addBot("You're in. Tell me what to change on the booking site, then hit Publish to live site.");
  loadContent();
}

function lock() {
  sessionStorage.removeItem(SESSION_KEY);
  studio.hidden = true;
  gate.hidden = false;
  document.body.classList.remove("owner-unlocked");
  passInput.value = "";
  pass2.value = "";
  passConfirmWrap.hidden = true;
  pass2.required = false;
  gateSubmit.textContent = "Unlock";
  gateCopy.textContent = "Enter your owner password to open the studio and talk to the site bot.";
  gateError.hidden = true;
}

function showGateError(msg) {
  gateError.hidden = false;
  gateError.textContent = msg;
}

async function loadContent() {
  const res = await fetch(`content.json?ts=${Date.now()}`);
  siteContent = await res.json();
}

function addMsg(role, text) {
  const el = document.createElement("p");
  el.className = `owner-msg ${role}`;
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function addBot(text) {
  addMsg("bot", text);
}

function cloneContent(data) {
  return JSON.parse(JSON.stringify(data));
}

function applyLocalEdit(message, content) {
  const next = cloneContent(content);
  const text = message.toLowerCase();
  let changed = false;
  const timeMatch = message.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);

  function fmt(h, m, ap) {
    let hour = Number(h);
    const min = m || "00";
    const mer = (ap || "").toUpperCase();
    if (mer === "PM" && hour < 12) hour += 12;
    if (mer === "AM" && hour === 12) hour = 0;
    const d = new Date(`2026-01-01T${String(hour).padStart(2, "0")}:${min}:00`);
    return {
      hour,
      label: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };
  }

  if (timeMatch && /saturday|sat\b/.test(text)) {
    const start = fmt(timeMatch[1], timeMatch[2], timeMatch[3] || "AM");
    const end = fmt(timeMatch[4], timeMatch[5], timeMatch[6] || "PM");
    next.hours.saturday.text = `${start.label} – ${end.label}`;
    next.hours.saturday.start = start.hour;
    next.hours.saturday.end = end.hour;
    changed = true;
  }
  if (timeMatch && /sunday|sun\b/.test(text)) {
    const start = fmt(timeMatch[1], timeMatch[2], timeMatch[3] || "AM");
    const end = fmt(timeMatch[4], timeMatch[5], timeMatch[6] || "PM");
    next.hours.sunday.text = `${start.label} – ${end.label}`;
    next.hours.sunday.start = start.hour;
    next.hours.sunday.end = end.hour;
    changed = true;
  }

  const phone = message.match(/(\+?1?[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  if (phone && /phone|number|call|text/.test(text)) {
    next.phone = phone[0].trim();
    changed = true;
  }
  const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email && /email|mail/.test(text)) {
    next.email = email[0];
    changed = true;
  }
  const ig = message.match(/@[\w.-]+/);
  if (ig && /instagram|ig\b|handle/.test(text)) {
    next.instagram = ig[0];
    changed = true;
  }
  const addService = message.match(/add (?:service )?(.+)/i);
  if (addService) {
    const name = addService[1].replace(/to services\.?$/i, "").trim();
    const empty = next.services.findIndex((s) => !s);
    if (empty >= 0) next.services[empty] = name;
    else next.services.push(name);
    changed = true;
  }
  const bio = message.match(/bio[:\s]+([\s\S]+)/i);
  if (bio) {
    next.bio = bio[1].trim();
    changed = true;
  }

  return changed ? next : null;
}

async function askGemini(message, content) {
  const key = geminiInput.value.trim();
  if (!key) return null;
  const prompt = `You edit the Styled by Tonika booking website content.
Return ONLY JSON: {"reply":"short confirmation","content":{...full updated content object...}}
Keep the same keys. Do not remove keys. Do not invent photos.
Current content:
${JSON.stringify(content, null, 2)}
Owner request:
${message}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error: ${res.status} ${err.slice(0, 180)}`);
  }
  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
  const jsonText = raw.replace(/^```json\s*|\s*```$/g, "").trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("The bot did not return usable JSON.");
  return JSON.parse(jsonText.slice(start, end + 1));
}

async function githubPut(path, text, message) {
  const token = githubInput.value.trim();
  const cfg = window.OWNER_CONFIG;
  if (!token) throw new Error("Add a GitHub token first.");
  const api = `https://api.github.com/repos/${cfg.githubOwner}/${cfg.githubRepo}/contents/${path}`;
  const current = await fetch(`${api}?ref=${cfg.githubBranch}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!current.ok) throw new Error("Could not read the file on GitHub. Check the token.");
  const meta = await current.json();
  const put = await fetch(api, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: btoa(unescape(encodeURIComponent(text))),
      sha: meta.sha,
      branch: cfg.githubBranch,
    }),
  });
  if (!put.ok) {
    const err = await put.text();
    throw new Error(`Publish failed: ${put.status} ${err.slice(0, 180)}`);
  }
}

if (!storedHash()) {
  setupMode = true;
  gateCopy.textContent = "Create an owner password. Only people with this password can open the studio.";
  passConfirmWrap.hidden = false;
  pass2.required = true;
  gateSubmit.textContent = "Create password";
}

if (sessionStorage.getItem(SESSION_KEY) === "1" && storedHash()) {
  unlock();
}

gateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  gateError.hidden = true;
  const value = passInput.value;
  try {
    if (setupMode) {
      if (value.length < 8) {
        showGateError("Use at least 8 characters.");
        return;
      }
      if (value !== pass2.value) {
        showGateError("Those passwords do not match.");
        return;
      }
      const hash = await sha256(value);
      saveHash(hash);
      setupMode = false;
      unlock();
      addBot("Password saved on this device. Add a GitHub token and publish if you also want this lock on your phone later.");
      return;
    }
    const hash = await sha256(value);
    if (hash !== storedHash()) {
      showGateError("Wrong password.");
      return;
    }
    unlock();
  } catch (err) {
    showGateError("Could not unlock. Try again, or use 8 or more characters.");
  }
});

document.querySelector("#lock-btn").addEventListener("click", lock);

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  passStatus.textContent = "";
  const current = passCurrent.value;
  const next = passNew.value;
  const confirm = passNew2.value;
  try {
    if (next.length < 8) {
      passStatus.textContent = "Use at least 8 characters.";
      return;
    }
    if (next !== confirm) {
      passStatus.textContent = "Those new passwords do not match.";
      return;
    }
    if ((await sha256(current)) !== storedHash()) {
      passStatus.textContent = "Current password is wrong.";
      return;
    }
    saveHash(await sha256(next));
    passCurrent.value = "";
    passNew.value = "";
    passNew2.value = "";
    passStatus.textContent = "Password saved on this device. Click Publish to live site if you also want this lock on your phone.";
  } catch (err) {
    passStatus.textContent = "Could not save the password. Try again.";
  }
});

geminiInput.addEventListener("change", () => {
  sessionStorage.setItem(GEMINI_KEY, geminiInput.value.trim());
});
githubInput.addEventListener("change", () => {
  sessionStorage.setItem(GITHUB_KEY, githubInput.value.trim());
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message || !siteContent) return;
  addMsg("user", message);
  chatInput.value = "";
  addBot("Working…");
  const pending = chatLog.lastChild;
  try {
    let reply = "";
    let next = null;
    try {
      const ai = await askGemini(message, siteContent);
      if (ai?.content) {
        next = ai.content;
        reply = ai.reply || "Updated.";
      }
    } catch (err) {
      reply = "";
      if (geminiInput.value.trim()) {
        pending.textContent = String(err.message || err);
      }
    }
    if (!next) {
      next = applyLocalEdit(message, siteContent);
      reply = next
        ? "Updated the draft. Click Publish to live site so customers see it."
        : "I could not tell what to change. Add a Gemini API key for fuller edits, or try “Saturday 9am to 5pm”, “phone (252) 555-0100”, or “add knotless braids”.";
    }
    pending.textContent = reply;
    if (next) siteContent = next;
  } catch (err) {
    pending.textContent = String(err.message || err);
  }
});

publishBtn.addEventListener("click", async () => {
  if (!siteContent) return;
  publishStatus.textContent = "Publishing…";
  try {
    await githubPut("content.json", `${JSON.stringify(siteContent, null, 2)}\n`, "Update site content from owner studio");
    const hash = storedHash();
    if (hash && window.OWNER_CONFIG) {
      const config = `window.OWNER_CONFIG = {\n  githubOwner: "${window.OWNER_CONFIG.githubOwner}",\n  githubRepo: "${window.OWNER_CONFIG.githubRepo}",\n  githubBranch: "${window.OWNER_CONFIG.githubBranch}",\n  passwordHash: "${hash}"\n};\n`;
      await githubPut("owner-config.js", config, "Save owner studio password lock");
    }
    publishStatus.textContent = "Published. The live site usually updates within a minute.";
  } catch (err) {
    publishStatus.textContent = String(err.message || err);
  }
});
