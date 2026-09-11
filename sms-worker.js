/**
 * Booked-slot calendar + text reminders for Styled by Tonika.
 *
 * Deploy:
 *   npx wrangler deploy
 *   npx wrangler secret put TWILIO_ACCOUNT_SID
 *   npx wrangler secret put TWILIO_AUTH_TOKEN
 *   npx wrangler secret put TWILIO_MESSAGING_SERVICE_SID
 *
 * GET  ?slots=1          → { taken: ["2026-09-12|09:00"] }
 * GET  /booking/:id      → HTML recap with photos
 * GET  /media/:id        → current-hair / inspiration image
 * POST { action:"claim", date, time, name }   → hold a start time
 * POST { action:"release", date, time } → free a start time if the email failed
 * POST { action:"cancel", name } → free slots booked under that name
 * POST { action:"notify", ...photos } → send the owner a booking email
 * POST { name, phone, date, time }      → schedule the SMS reminder
 */
const TZ = "America/Vancouver";
const SLOT_START = 8;
const SLOT_END = 21;
const ALLOWED = new Set([
  "https://styledbytonika.ca",
  "https://www.styledbytonika.ca",
  "https://jeremiahcox1717-a11y.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

function allowOrigin(origin) {
  if (ALLOWED.has(origin)) return origin;
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return origin;
  } catch {
    /* keep default */
  }
  return "https://styledbytonika.ca";
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": allowOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function toE164(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

function parseClock(value) {
  const ampm = String(value || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = Number(ampm[2]);
    const mer = ampm[3].toUpperCase();
    if (mer === "PM" && h < 12) h += 12;
    if (mer === "AM" && h === 12) h = 0;
    return { h, min };
  }
  const hm = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return { h: Number(hm[1]), min: Number(hm[2]) };
  return null;
}

function tzOffsetMs(timeZone, date) {
  const tz = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value || "GMT+0";
  const m = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] || 0)) * 60 * 1000;
}

function appointmentUtc(dateStr, h, min) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  if (!y || !mo || !d) return null;
  let utc = Date.UTC(y, mo - 1, d, h, min, 0);
  const off = tzOffsetMs(TZ, new Date(utc));
  utc = Date.UTC(y, mo - 1, d, h, min, 0) - off;
  const off2 = tzOffsetMs(TZ, new Date(utc));
  if (off2 !== off) utc = Date.UTC(y, mo - 1, d, h, min, 0) - off2;
  return utc;
}

function cleanName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} .'-]/gu, "")
    .trim()
    .slice(0, 40);
}

function slotKey(dateStr, timeValue) {
  const clock = parseClock(timeValue);
  if (!clock) return "";
  return `${dateStr}|${String(clock.h).padStart(2, "0")}:${String(clock.min).padStart(2, "0")}`;
}

function isValidSlot(dateStr, timeValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const weekday = new Date(`${dateStr}T12:00:00`).getDay();
  if (weekday !== 0 && weekday !== 6) return false;
  const clock = parseClock(timeValue);
  if (!clock || clock.min !== 0) return false;
  if (clock.h < SLOT_START || clock.h >= SLOT_END) return false;
  return true;
}

function todayStamp() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function calendarStub(env) {
  if (!env.CALENDAR) return null;
  return env.CALENDAR.get(env.CALENDAR.idFromName("bookings"));
}

function isSlotStorageKey(key) {
  return /^\d{4}-\d{2}-\d{2}\|\d{2}:\d{2}$/.test(String(key || ""));
}

function namesMatch(stored, needle) {
  const a = cleanName(stored).toLowerCase();
  const b = cleanName(needle).toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export class BookingCalendar {
  constructor(state) {
    this.state = state;
  }

  async fetch(req) {
    let payload = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }
    const action = String(payload.action || "list");
    const today = todayStamp();

    if (action === "list") {
      const taken = [];
      const all = await this.state.storage.list();
      for (const [key, value] of all) {
        if (!isSlotStorageKey(key)) continue;
        const date = String(key).split("|")[0];
        if (date < today) {
          await this.state.storage.delete(key);
          continue;
        }
        taken.push(typeof value === "object" && value?.name ? { key, name: value.name } : key);
      }
      return Response.json({
        ok: true,
        taken: taken.map((item) => (typeof item === "string" ? item : item.key)),
        bookings: taken,
      });
    }

    if (action === "get-media") {
      const media = await this.state.storage.get(`m:${payload.id}`);
      if (!media) return Response.json({ ok: false, error: "missing" }, { status: 404 });
      return Response.json({ ok: true, media });
    }

    if (action === "get-booking") {
      const booking = await this.state.storage.get(`b:${payload.id}`);
      if (!booking) return Response.json({ ok: false, error: "missing" }, { status: 404 });
      return Response.json({ ok: true, booking });
    }

    if (action === "save-booking") {
      const booking = payload.booking || {};
      const id = String(booking.id || "").slice(0, 80);
      if (!id) return Response.json({ ok: false, error: "Need booking id" }, { status: 400 });
      if (payload.hair) await this.state.storage.put(`m:${id}-hair`, payload.hair);
      if (payload.inspo) await this.state.storage.put(`m:${id}-inspo`, payload.inspo);
      await this.state.storage.put(`b:${id}`, booking);
      const key = slotKey(booking.date, booking.time);
      if (key) {
        const existing = (await this.state.storage.get(key)) || {};
        await this.state.storage.put(key, {
          ...existing,
          at: existing.at || Date.now(),
          name: cleanName(booking.name),
          phone: String(booking.phone || "").slice(0, 24),
          email: String(booking.email || "").slice(0, 80),
          service: String(booking.service || "").slice(0, 80),
          bookingId: id,
        });
      }
      return Response.json({ ok: true, id });
    }

    if (action === "cancel") {
      const needle = cleanName(payload.name);
      const released = [];
      if (!needle) return Response.json({ ok: false, error: "Need a name" }, { status: 400 });
      const all = await this.state.storage.list();
      for (const [key, value] of all) {
        if (!isSlotStorageKey(key)) continue;
        const storedName = value?.name || "";
        if (namesMatch(storedName, needle)) {
          await this.state.storage.delete(key);
          released.push(key);
        }
      }
      return Response.json({ ok: true, released });
    }

    const key = slotKey(payload.date, payload.time);
    if (!key || !isValidSlot(payload.date, payload.time)) {
      return Response.json({ ok: false, error: "That is not an open booking time." }, { status: 400 });
    }

    if (action === "claim") {
      const existing = await this.state.storage.get(key);
      if (existing) {
        return Response.json({ ok: false, error: "taken" }, { status: 409 });
      }
      await this.state.storage.put(key, {
        at: Date.now(),
        name: cleanName(payload.name),
        phone: String(payload.phone || "").slice(0, 24),
        email: String(payload.email || "").slice(0, 80),
        service: String(payload.service || "").slice(0, 80),
      });
      return Response.json({ ok: true, key });
    }

    if (action === "release") {
      await this.state.storage.delete(key);
      return Response.json({ ok: true, key });
    }

    return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }
}

async function cacheCalendar(payload) {
  const cache = caches.default;
  const cacheKey = new Request("https://styledbytonika.internal/calendar");
  const action = String(payload.action || "list");
  const today = todayStamp();
  let data = { taken: [] };
  const hit = await cache.match(cacheKey);
  if (hit) data = await hit.json().catch(() => ({ taken: [] }));
  data.taken = (data.taken || []).filter((key) => String(key).split("|")[0] >= today);

  async function save() {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", "Cache-Control": "max-age=31536000" },
      })
    );
  }

  if (action === "list") return { ok: true, taken: data.taken, bookings: data.taken, status: 200 };
  if (action === "get-media" || action === "get-booking" || action === "save-booking") {
    return { ok: false, error: "Calendar storage is not ready.", status: 503 };
  }
  if (action === "cancel") {
    return { ok: true, released: [], status: 200 };
  }

  const key = slotKey(payload.date, payload.time);
  if (!key || !isValidSlot(payload.date, payload.time)) {
    return { ok: false, error: "That is not an open booking time.", status: 400 };
  }

  if (action === "claim") {
    if (data.taken.includes(key)) return { ok: false, error: "taken", status: 409 };
    data.taken.push(key);
    await save();
    return { ok: true, key, status: 200 };
  }

  if (action === "release") {
    data.taken = data.taken.filter((item) => item !== key);
    await save();
    return { ok: true, key, status: 200 };
  }

  return { ok: false, error: "Unknown action", status: 400 };
}

async function writeGithubBookings(env, taken) {
  const token = env.GITHUB_TOKEN;
  if (!token) return;
  const owner = env.GITHUB_OWNER || "jeremiahcox1717-a11y";
  const repo = env.GITHUB_REPO || "styledbytonika";
  const branch = env.GITHUB_BRANCH || "main";
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/bookings.json`;
  try {
    const current = await fetch(`${api}?ref=${branch}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!current.ok) return;
    const meta = await current.json();
    const body = `${JSON.stringify({ taken }, null, 2)}\n`;
    await fetch(api, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Update booked appointment slots",
        content: btoa(unescape(encodeURIComponent(body))),
        sha: meta.sha,
        branch,
      }),
    });
  } catch {
    /* calendar still holds the slot */
  }
}

async function githubTaken() {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/jeremiahcox1717-a11y/styledbytonika/main/bookings.json?ts=${Date.now()}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.taken || [];
  } catch {
    return [];
  }
}

async function calendarAction(env, payload) {
  let out = null;
  if (env.CALENDAR) {
    try {
      const stub = env.CALENDAR.get(env.CALENDAR.idFromName("bookings"));
      const res = await stub.fetch("https://calendar/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      out = { ...(await res.json().catch(() => ({}))), status: res.status };
    } catch {
      out = null;
    }
  }
  if (!out || out.status === 503) out = await cacheCalendar(payload);
  if ((payload.action || "list") === "list") {
    if (payload.skipGithub) return { ok: true, taken: out.taken || [], status: 200 };
    const extra = await githubTaken();
    const taken = [...new Set([...(out.taken || []), ...extra])];
    return { ok: true, taken, status: 200 };
  }
  if (out?.ok && (payload.action === "claim" || payload.action === "release" || payload.action === "cancel")) {
    const listed = await calendarAction(env, { action: "list", skipGithub: true });
    await writeGithubBookings(env, listed.taken || []);
  }
  return out;
}

function workerOrigin(req) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function idFor(bookingId, kind) {
  return `${bookingId}-${kind}`;
}

function bookingEmailHtml({ booking, origin, hairCid, inspoCid }) {
  const hairSrc = hairCid ? `cid:${hairCid}` : booking.hairUrl;
  const inspoSrc = inspoCid ? `cid:${inspoCid}` : booking.inspoUrl;
  const recap = `${origin}/booking/${encodeURIComponent(booking.id)}`;
  const hairCaption = booking.hairKind === "video" ? "Current hair (video preview)" : "Current hair";
  const inspoCaption = booking.inspoKind === "video" ? "Inspiration (video preview)" : "Inspiration";
  const photoCell = (src, caption) =>
    src
      ? `<td style="width:50%;padding:6px;vertical-align:top;">
          <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#ff4ec8;font-weight:700;">${esc(caption)}</p>
          <img src="${esc(src)}" alt="${esc(caption)}" width="240" style="display:block;width:100%;max-width:240px;height:auto;border-radius:12px;border:1px solid #3a3a3a;background:#111;">
        </td>`
      : `<td style="width:50%;padding:6px;vertical-align:top;">
          <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#ff4ec8;font-weight:700;">${esc(caption)}</p>
          <p style="margin:0;font-family:Georgia,serif;color:#bbb;font-size:14px;">No photo sent</p>
        </td>`;
  const row = (label, value) =>
    value
      ? `<tr>
          <td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#ff4ec8;width:34%;">${esc(label)}</td>
          <td style="padding:8px 0;font-family:Georgia,serif;font-size:16px;color:#f7f7f7;">${esc(value)}</td>
        </tr>`
      : "";
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0b0b0b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#141414;border:1px solid #2a2a2a;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 18px;border-bottom:1px solid #2a2a2a;">
              <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#ff4ec8;">Styled by Tonika</p>
              <h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:28px;line-height:1.2;color:#ffffff;">New booking</h1>
              <p style="margin:10px 0 0;font-family:Georgia,serif;font-size:18px;color:#ffb7e6;">${esc(booking.day)} at ${esc(booking.timeLabel)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${row("Client", booking.name)}${row("Service", booking.service)}${row("Phone", booking.phone)}${row("Email", booking.email)}${row("Instagram", booking.instagram)}${row("Address", booking.address)}${row("Inspiration link", booking.inspoUrlText)}${row("Notes", booking.notes)}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 22px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${photoCell(hairSrc, hairCaption)}
                  ${photoCell(inspoSrc, inspoCaption)}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;">
              <a href="${esc(recap)}" style="display:inline-block;background:#ff4ec8;color:#111;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:12px 18px;border-radius:999px;">Open booking with photos</a>
              <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888;">Photos are included above. If they don’t load in this inbox, tap the button.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function bookingEmailText(booking, origin) {
  return [
    "New Styled by Tonika booking",
    "",
    `When: ${booking.day} at ${booking.timeLabel}`,
    `Client: ${booking.name}`,
    `Service: ${booking.service}`,
    `Phone: ${booking.phone}`,
    `Email: ${booking.email}`,
    `Instagram: ${booking.instagram || "(none)"}`,
    `Address: ${booking.address || "(none)"}`,
    `Current hair: ${booking.hairUrl || "(none)"}`,
    `Inspiration: ${booking.inspoUrl || booking.inspoUrlText || "(none)"}`,
    `Notes: ${booking.notes || "(none)"}`,
    "",
    `Open with photos: ${origin}/booking/${booking.id}`,
  ].join("\n");
}

function recapPageHtml(booking, origin) {
  const hair = booking.hairUrl || "";
  const inspo = booking.inspoUrl || "";
  const img = (src, caption) =>
    src
      ? `<figure><p class="cap">${esc(caption)}</p><img src="${esc(src)}" alt="${esc(caption)}"></figure>`
      : `<figure><p class="cap">${esc(caption)}</p><p class="empty">No photo sent</p></figure>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Booking · ${esc(booking.name)}</title>
  <style>
    body{margin:0;background:#050505;color:#fff;font-family:Georgia,serif;}
    main{max-width:720px;margin:0 auto;padding:28px 18px 48px;}
    .brand{font-family:Arial,Helvetica,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#ff4ec8;font-size:12px;}
    h1{font-weight:400;font-size:32px;margin:8px 0 0;}
    .when{color:#ffb7e6;font-size:20px;margin:8px 0 24px;}
    dl{display:grid;grid-template-columns:140px 1fr;gap:10px 16px;margin:0 0 28px;}
    dt{font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#ff4ec8;}
    dd{margin:0;font-size:17px;}
    .photos{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
    img{width:100%;border-radius:14px;border:1px solid #333;background:#111;}
    .cap{font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#ff4ec8;}
    .empty{color:#999;}
    a{color:#ff4ec8;}
    @media (max-width:640px){ .photos, dl{grid-template-columns:1fr;} }
  </style>
</head>
<body>
  <main>
    <p class="brand">Styled by Tonika</p>
    <h1>${esc(booking.name)}</h1>
    <p class="when">${esc(booking.day)} at ${esc(booking.timeLabel)}</p>
    <dl>
      <dt>Service</dt><dd>${esc(booking.service)}</dd>
      <dt>Phone</dt><dd>${esc(booking.phone)}</dd>
      <dt>Email</dt><dd>${esc(booking.email)}</dd>
      ${booking.instagram ? `<dt>Instagram</dt><dd>${esc(booking.instagram)}</dd>` : ""}
      ${booking.address ? `<dt>Address</dt><dd>${esc(booking.address)}</dd>` : ""}
      ${booking.inspoUrlText ? `<dt>Link</dt><dd><a href="${esc(booking.inspoUrlText)}">${esc(booking.inspoUrlText)}</a></dd>` : ""}
      ${booking.notes ? `<dt>Notes</dt><dd>${esc(booking.notes)}</dd>` : ""}
    </dl>
    <div class="photos">
      ${img(hair, booking.hairKind === "video" ? "Current hair (video preview)" : "Current hair")}
      ${img(inspo, booking.inspoKind === "video" ? "Inspiration (video preview)" : "Inspiration")}
    </div>
  </main>
</body>
</html>`;
}

function blobFromBase64(b64, type) {
  const bin = atob(String(b64 || ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || "image/jpeg" });
}

async function sendViaCloudflareEmail(env, inbox, booking, origin, hair, inspo) {
  if (!env.EMAIL || typeof env.EMAIL.send !== "function") return false;
  const htmlWithCid = bookingEmailHtml({
    booking,
    origin,
    hairCid: hair ? "hair-photo" : "",
    inspoCid: inspo ? "inspo-photo" : "",
  });
  const htmlWithUrls = bookingEmailHtml({
    booking,
    origin,
    hairCid: "",
    inspoCid: "",
  });
  const text = bookingEmailText(booking, origin);
  const attachments = [];
  if (hair) {
    attachments.push({
      content: hair.b64,
      filename: hair.filename || "current-hair.jpg",
      type: hair.type || "image/jpeg",
      disposition: "inline",
      contentId: "hair-photo",
    });
  }
  if (inspo) {
    attachments.push({
      content: inspo.b64,
      filename: inspo.filename || "inspiration.jpg",
      type: inspo.type || "image/jpeg",
      disposition: "inline",
      contentId: "inspo-photo",
    });
  }
  const from = { email: "bookings@styledbytonika.ca", name: "Styled by Tonika" };
  try {
    await env.EMAIL.send({
      to: inbox,
      from,
      replyTo: booking.email,
      subject: booking.subject,
      html: htmlWithCid,
      text,
      attachments,
    });
    return true;
  } catch {
    try {
      await env.EMAIL.send({
        to: inbox,
        from: "bookings@styledbytonika.ca",
        subject: booking.subject,
        html: htmlWithUrls,
        text,
      });
      return true;
    } catch {
      return false;
    }
  }
}

async function sendViaResend(env, inbox, booking, origin, hair, inspo) {
  if (!env.RESEND_API_KEY) return false;
  const html = bookingEmailHtml({
    booking,
    origin,
    hairCid: hair ? "hair-photo" : "",
    inspoCid: inspo ? "inspo-photo" : "",
  });
  const attachments = [];
  if (hair) attachments.push({ filename: hair.filename || "current-hair.jpg", content: hair.b64, content_id: "hair-photo" });
  if (inspo) attachments.push({ filename: inspo.filename || "inspiration.jpg", content: inspo.b64, content_id: "inspo-photo" });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Styled by Tonika <bookings@styledbytonika.ca>",
      to: [inbox],
      reply_to: booking.email,
      subject: booking.subject,
      html,
      text: bookingEmailText(booking, origin),
      attachments,
    }),
  });
  return res.ok;
}

async function sendViaFormSubmit(inbox, booking, origin, hair, inspo) {
  const fd = new FormData();
  fd.append("_subject", booking.subject);
  fd.append("_template", "box");
  fd.append("_replyto", booking.email || inbox);
  fd.append("Open this booking", `${origin}/booking/${booking.id}`);
  fd.append("Client", booking.name);
  fd.append("Service", booking.service);
  fd.append("When", `${booking.day} at ${booking.timeLabel}`);
  fd.append("Phone", booking.phone);
  fd.append("Client email", booking.email);
  if (booking.instagram) fd.append("Instagram", booking.instagram);
  if (booking.address) fd.append("Address", booking.address);
  if (booking.notes) fd.append("Notes", booking.notes);
  if (booking.inspoUrlText) fd.append("Inspiration link", booking.inspoUrlText);
  if (hair) fd.append("Current hair photo", `${origin}/media/${idFor(booking.id, "hair")}`);
  if (inspo) fd.append("Inspiration photo", `${origin}/media/${idFor(booking.id, "inspo")}`);
  if (hair) fd.append("attachment", blobFromBase64(hair.b64, hair.type), hair.filename || "current-hair.jpg");
  if (inspo) fd.append("inspiration", blobFromBase64(inspo.b64, inspo.type), inspo.filename || "inspiration.jpg");
  const res = await fetch(`https://formsubmit.co/ajax/${inbox}`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: fd,
  });
  const out = await res.json().catch(() => ({}));
  return String(out.success) === "true";
}

function readInlineMedia(payload, key) {
  const item = payload[key];
  if (!item || !item.b64) return null;
  return {
    b64: String(item.b64).replace(/^data:[^;]+;base64,/, ""),
    type: String(item.type || "image/jpeg").slice(0, 80),
    filename: String(item.filename || `${key}.jpg`).slice(0, 80),
    kind: String(item.kind || "photo").slice(0, 16),
  };
}

async function persistBooking(env, booking, hair, inspo) {
  if (!env.CALENDAR) return;
  const stub = calendarStub(env);
  await stub.fetch("https://calendar/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "save-booking",
      booking,
      hair: hair ? { ...hair, id: idFor(booking.id, "hair") } : null,
      inspo: inspo ? { ...inspo, id: idFor(booking.id, "inspo") } : null,
    }),
  });
}

async function loadStored(env, action, payload) {
  if (!env.CALENDAR) return null;
  const stub = calendarStub(env);
  const res = await stub.fetch("https://calendar/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  return res.json().catch(() => null);
}

function mediaResponse(media) {
  if (!media?.b64) return new Response("Missing", { status: 404 });
  const body = blobFromBase64(media.b64, media.type);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": media.type || "image/jpeg",
      "Cache-Control": "public, max-age=604800",
    },
  });
}

async function notifyOwner(req, env, payload) {
  const origin = workerOrigin(req);
  const inbox = String(env.OWNER_EMAIL || payload.inbox || "styledbytonika@gmail.com")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inbox)) {
    return { ok: false, error: "Bad inbox", status: 400 };
  }
  const id = String(payload.id || crypto.randomUUID());
  const hair = readInlineMedia(payload, "hair");
  const inspo = readInlineMedia(payload, "inspo");
  const booking = {
    id,
    name: cleanName(payload.name),
    phone: String(payload.phone || "").slice(0, 32),
    email: String(payload.email || "").slice(0, 80),
    instagram: String(payload.instagram || "").slice(0, 80),
    service: String(payload.service || "").slice(0, 80),
    date: String(payload.date || "").slice(0, 10),
    time: String(payload.time || payload.slotTime || "").slice(0, 16),
    day: String(payload.day || "").slice(0, 80),
    timeLabel: String(payload.timeLabel || "").slice(0, 40),
    address: String(payload.address || "").slice(0, 200),
    notes: String(payload.notes || "").slice(0, 500),
    inspoUrlText: String(payload.inspoLink || "").slice(0, 300),
    hairKind: hair?.kind || "",
    inspoKind: inspo?.kind || "",
    hairUrl: hair ? `${origin}/media/${idFor(id, "hair")}` : "",
    inspoUrl: inspo ? `${origin}/media/${idFor(id, "inspo")}` : "",
    subject: String(payload.subject || `New booking: ${payload.service} — ${payload.day} at ${payload.timeLabel}`).slice(0, 140),
  };
  if (!booking.name) return { ok: false, error: "Need a name", status: 400 };
  await persistBooking(env, booking, hair, inspo);
  let via = "";
  if (await sendViaCloudflareEmail(env, inbox, booking, origin, hair, inspo)) via = "cloudflare";
  else if (await sendViaResend(env, inbox, booking, origin, hair, inspo)) via = "resend";
  else if (await sendViaFormSubmit(inbox, booking, origin, hair, inspo)) via = "formsubmit";
  if (!via) return { ok: false, error: "Could not send booking email", status: 502, recapUrl: `${origin}/booking/${id}`, hairUrl: booking.hairUrl, inspoUrl: booking.inspoUrl };
  return {
    ok: true,
    via,
    id,
    recapUrl: `${origin}/booking/${id}`,
    hairUrl: booking.hairUrl,
    inspoUrl: booking.inspoUrl,
    status: 200,
  };
}

async function twilioSend(env, fields) {
  const params = new URLSearchParams(fields);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || `Twilio ${res.status}`);
  }
  return body;
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (req.method === "GET") {
      const url = new URL(req.url);
      const mediaId = url.searchParams.get("media") || url.pathname.match(/\/media\/([^/]+)$/)?.[1];
      const bookingId = url.searchParams.get("booking") || url.pathname.match(/\/booking\/([^/]+)$/)?.[1];
      if (mediaId) {
        const out = await loadStored(env, "get-media", { id: decodeURIComponent(mediaId) });
        if (!out?.ok) return new Response("Photo not found", { status: 404, headers: corsHeaders(origin) });
        const res = mediaResponse(out.media);
        Object.entries(corsHeaders(origin)).forEach(([key, value]) => res.headers.set(key, value));
        return res;
      }
      if (bookingId) {
        const out = await loadStored(env, "get-booking", { id: decodeURIComponent(bookingId) });
        if (!out?.ok) return new Response("Booking not found", { status: 404, headers: { "Content-Type": "text/plain", ...corsHeaders(origin) } });
        return new Response(recapPageHtml(out.booking, workerOrigin(req)), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders(origin) },
        });
      }
      if (url.searchParams.has("slots")) {
        const out = await calendarAction(env, { action: "list" });
        return json(origin, { ok: true, taken: out.taken || [] }, out.status && out.status !== 503 ? out.status : 200);
      }
      return json(origin, { error: "GET slots only" }, 400);
    }

    if (req.method !== "POST") return json(origin, { error: "POST only" }, 405);

    let payload;
    try {
      payload = await req.json();
    } catch {
      return json(origin, { error: "Invalid JSON" }, 400);
    }

    const action = String(payload.action || "");
    if (action === "notify") {
      const out = await notifyOwner(req, env, payload);
      const status = out.status || 200;
      const { status: _s, ...body } = out;
      return json(origin, body, status);
    }
    if (action === "claim" || action === "release" || action === "list" || action === "cancel") {
      const out = await calendarAction(env, payload);
      const status = out.status || 200;
      const { status: _s, ...body } = out;
      return json(origin, body, status);
    }

    const name = cleanName(payload.name);
    const phone = toE164(payload.phone);
    const dateStr = String(payload.date || "");
    const clock = parseClock(payload.time);
    const hours = Math.min(24, Math.max(1, Number(env.REMINDER_HOURS || payload.hours || 3)));

    if (!name || !phone || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !clock) {
      return json(origin, { error: "Need name, phone, date, and time" }, 400);
    }
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_MESSAGING_SERVICE_SID) {
      return json(origin, { error: "SMS is not configured" }, 500);
    }

    const startUtc = appointmentUtc(dateStr, clock.h, clock.min);
    if (!startUtc) return json(origin, { error: "Bad appointment time" }, 400);
    if (startUtc <= Date.now() + 10 * 60 * 1000) {
      return json(origin, { error: "That time is too soon to schedule a reminder" }, 400);
    }

    const sendAt = startUtc - hours * 60 * 60 * 1000;
    const day = new Date(startUtc).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: TZ,
    });
    const timeLabel = new Date(startUtc).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: TZ,
    });
    const body = `Hi ${name}, Styled by Tonika reminder: your appointment is ${day} at ${timeLabel}. See you soon!`;

    try {
      const fields = {
        To: phone,
        Body: body,
        MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
      };
      const fifteen = Date.now() + 15 * 60 * 1000;
      if (sendAt > fifteen) {
        fields.ScheduleType = "fixed";
        fields.SendAt = new Date(sendAt).toISOString();
      }
      await twilioSend(env, fields);
      const remindLabel = new Date(Math.max(sendAt, Date.now())).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: TZ,
      });
      return json(origin, { ok: true, sendAt: new Date(sendAt).toISOString(), remindLabel, day, timeLabel });
    } catch (err) {
      return json(origin, { error: String(err.message || err) }, 502);
    }
  },
};
