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
  if (!Array.isArray(siteContent.blocked)) siteContent.blocked = [];
  if (smsWebhookInput) smsWebhookInput.value = siteContent.smsWebhook || "";
  renderSchedule();
}

function clockFace(hour) {
  const d = new Date(`2026-01-01T${String(hour).padStart(2, "0")}:00:00`);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function renderSchedule() {
  const el = document.querySelector("#owner-schedule");
  if (!el) return;
  const blocks = Array.isArray(siteContent?.blocked) ? siteContent.blocked : [];
  if (!blocks.length) {
    el.innerHTML = `<p class="owner-schedule-empty">No extra holds yet. A new booking already keeps two hours from the start. After you confirm the style, tell me the real window.</p>`;
    return;
  }
  el.innerHTML = blocks
    .map((block) => {
      const when = block.date
        ? new Date(`${block.date}T12:00:00`).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
        : block.weekday
          ? `${String(block.weekday)[0].toUpperCase()}${String(block.weekday).slice(1)}s`
          : "Hold";
      const label = block.label || `${clockFace(block.start)} – ${clockFace(block.end)}`;
      return `<article class="owner-hold"><p class="owner-hold-day">${when}</p><p class="owner-hold-time">${label}</p></article>`;
    })
    .join("");
}

function cloneContent(data) {
  return JSON.parse(JSON.stringify(data));
}

function applyLocalEdit(message, content) {
  const next = cloneContent(content);
  const text = message.toLowerCase();
  let changed = false;
  const timeMatch = message.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  const isBlockCmd = /\b(remove|block|close|hold|unavailable|take off|take out)\b/.test(text);
  const isUnblockCmd = /\b(unblock|un-block|put back|restore|reopen|open back|available again)\b/.test(text);

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

  function hourFrom(h, min, ap, otherHour, isEnd) {
    let hour = Number(h);
    const mer = (ap || "").toUpperCase();
    if (mer === "PM" && hour < 12) hour += 12;
    else if (mer === "AM" && hour === 12) hour = 0;
    else if (!mer && isEnd && hour > 0 && hour < 12 && hour <= Number(otherHour)) hour += 12;
    return hour;
  }

  function weekdayFrom(raw) {
    if (/saturday|sat\b/.test(raw)) return "saturday";
    if (/sunday|sun\b/.test(raw)) return "sunday";
    return "";
  }

  function nextDateFor(weekday) {
    const want = weekday === "sunday" ? 0 : 6;
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Vancouver" }));
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    for (let i = 0; i < 16; i += 1) {
      if (cursor.getDay() === want) {
        const month = String(cursor.getMonth() + 1).padStart(2, "0");
        const day = String(cursor.getDate()).padStart(2, "0");
        return `${cursor.getFullYear()}-${month}-${day}`;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return "";
  }

  function dateFromMessage(raw) {
    const iso = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) return iso[1];
    const named = raw.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s*(20\d{2}))?\b/i);
    if (named) {
      const months = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      };
      const year = Number(named[3] || new Date().getFullYear());
      const d = new Date(year, months[named[1].toLowerCase()], Number(named[2]), 12);
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${month}-${day}`;
    }
    if (/\bthis saturday\b|\bnext saturday\b/.test(raw)) return nextDateFor("saturday");
    if (/\bthis sunday\b|\bnext sunday\b/.test(raw)) return nextDateFor("sunday");
    return "";
  }

  function clockLabel(hour) {
    const d = new Date(`2026-01-01T${String(hour).padStart(2, "0")}:00:00`);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function addOrUpdateBlock(startHour, endHour, weekday, date) {
    if (!Array.isArray(next.blocked)) next.blocked = [];
    if (!entryValid(date, weekday, startHour, endHour)) return;
    next.blocked = next.blocked.filter((block) => {
      if (date) return block.date !== date || Number(block.start) !== startHour;
      return String(block.weekday || "") !== weekday || Number(block.start) !== startHour;
    });
    const entry = {
      start: startHour,
      end: endHour,
      label: `${clockLabel(startHour)} – ${clockLabel(endHour)}`,
    };
    if (date) entry.date = date;
    else if (weekday) entry.weekday = weekday;
    next.blocked.push(entry);
    changed = true;
  }

  function entryValid(date, weekday, startHour, endHour) {
    return (date || weekday) && Number.isFinite(startHour) && Number.isFinite(endHour) && endHour > startHour;
  }

  const weekday = weekdayFrom(text);
  const date = dateFromMessage(text) || (!/\bevery\b/.test(text) && weekday ? nextDateFor(weekday) : "");
  const isOpenHours = /\bhours\b/.test(text) && /open|saturday hours|sunday hours|hours (are|to|from)/.test(text);
  const spanIsVisit = (startHour, endHour) => {
    const span = endHour - startHour;
    return span >= 2 && span <= 6;
  };

  if (timeMatch && (isUnblockCmd || isBlockCmd || spanIsVisit(
    hourFrom(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4], false),
    hourFrom(timeMatch[4], timeMatch[5], timeMatch[6], timeMatch[1], true)
  ))) {
    const startHour = hourFrom(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4], false);
    const endHour = hourFrom(timeMatch[4], timeMatch[5], timeMatch[6], timeMatch[1], true);
    if (isUnblockCmd) {
      if (!Array.isArray(next.blocked)) next.blocked = [];
      const before = next.blocked.length;
      next.blocked = next.blocked.filter((block) => {
        if (date) return !(block.date === date && Number(block.start) === startHour);
        return !(String(block.weekday || "") === weekday && Number(block.start) === startHour);
      });
      if (next.blocked.length !== before) changed = true;
    } else if (!isOpenHours) {
      addOrUpdateBlock(startHour, endHour, weekday, date);
    }
  }

  const durationMatch = text.match(/\b(\d)\s*hours?\b/);
  if (!timeMatch && durationMatch && weekday) {
    const startTok = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    const length = Number(durationMatch[1]);
    if (startTok && length >= 2 && length <= 6) {
      const startHour = hourFrom(startTok[1], startTok[2], startTok[3], String(Number(startTok[1]) + length), false);
      addOrUpdateBlock(startHour, startHour + length, weekday, date);
    }
  }

  if (timeMatch && /saturday|sat\b/.test(text) && !isBlockCmd && !isUnblockCmd && !spanIsVisit(
    hourFrom(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4], false),
    hourFrom(timeMatch[4], timeMatch[5], timeMatch[6], timeMatch[1], true)
  )) {
    const start = fmt(timeMatch[1], timeMatch[2], timeMatch[3] || "AM");
    const end = fmt(timeMatch[4], timeMatch[5], timeMatch[6] || "PM");
    next.hours.saturday.text = `${start.label} – ${end.label}`;
    next.hours.saturday.start = start.hour;
    next.hours.saturday.end = end.hour;
    changed = true;
  }
  if (timeMatch && /sunday|sun\b/.test(text) && !isBlockCmd && !isUnblockCmd && !spanIsVisit(
    hourFrom(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4], false),
    hourFrom(timeMatch[4], timeMatch[5], timeMatch[6], timeMatch[1], true)
  )) {
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
Appointments silently hold 2 hours from the start time. Clients should never be told that. Public copy (bookLede, timeHint) must not mention appointment length.
When the owner confirms the real length, UPDATE blocked for that date. Example: 9am booking already holds 9-11. “Saturday 9 to 1” → start 9, end 13.
blocked items: {"date":"YYYY-MM-DD","start":9,"end":13,"label":"9:00 AM – 1:00 PM"} or weekday if they say every Saturday.
Do not change hours.saturday / hours.sunday unless they clearly ask to change open hours (e.g. “Saturday hours 9 to 5”).
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

addBot("You’re in. A new booking already holds two hours. After you confirm the style, type Saturday 9 to 1, then Publish.");
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
        : "I could not tell what to change. Try “Saturday 9 to 1”, “Saturday hours 9 to 5”, or “add knotless braids”.";
    }
    pending.textContent = reply;
    if (next) {
      if (!Array.isArray(next.blocked)) next.blocked = [];
      siteContent = next;
      renderSchedule();
    }
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
