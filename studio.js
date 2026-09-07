if (!window.__STUDIO_OK) {
  window.location.replace("owner.html");
} else {
initStudio();
}

function initStudio() {
const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const publishBtn = document.querySelector("#publish-btn");
const publishStatus = document.querySelector("#publish-status");
const geminiInput = document.querySelector("#gemini-key");
const githubInput = document.querySelector("#github-token");
const smsWebhookInput = document.querySelector("#sms-webhook");

let siteContent = null;

geminiInput.value = sessionStorage.getItem(GEMINI_KEY) || "";
githubInput.value = sessionStorage.getItem(GITHUB_KEY) || "";

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

async function loadContent() {
  const res = await fetch(`content.json?ts=${Date.now()}`);
  siteContent = await res.json();
  if (smsWebhookInput) smsWebhookInput.value = siteContent.smsWebhook || "";
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
  const address = message.match(/address[:\s]+(.+)/i);
  if (address && /address|location|travel/.test(text)) {
    next.addressNote = address[1].trim();
    changed = true;
  }
  const webhook = message.match(/https?:\/\/\S+/i);
  if (webhook && /sms|webhook|reminder|twilio/.test(text)) {
    next.smsWebhook = webhook[0].replace(/[.,)]+$/, "");
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

addBot("You're in. Tell me what to change on the booking site, then hit Publish to live site.");
loadContent();

document.querySelector("#lock-btn").addEventListener("click", () => {
  lockStudio();
  window.location.replace("owner.html");
});

geminiInput.addEventListener("change", () => {
  sessionStorage.setItem(GEMINI_KEY, geminiInput.value.trim());
});
githubInput.addEventListener("change", () => {
  sessionStorage.setItem(GITHUB_KEY, githubInput.value.trim());
});
smsWebhookInput?.addEventListener("change", () => {
  if (!siteContent) return;
  siteContent.smsWebhook = smsWebhookInput.value.trim();
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
  if (smsWebhookInput) siteContent.smsWebhook = smsWebhookInput.value.trim();
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
}
