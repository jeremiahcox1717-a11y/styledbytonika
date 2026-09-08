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
 * POST { action:"claim", date, time }   → hold a 3-hour block
 * POST { action:"release", date, time } → free a block if the email failed
 * POST { name, phone, date, time }      → schedule the SMS reminder
 */
const TZ = "America/Vancouver";
const SLOT_HOURS = 3;
const SLOT_START = 9;
const SLOT_END = 17;
const ALLOWED = new Set([
  "https://styledbytonika.ca",
  "https://www.styledbytonika.ca",
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
  return (clock.h - SLOT_START) % SLOT_HOURS === 0;
}

function todayStamp() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function calendarStub(env) {
  if (!env.CALENDAR) return null;
  return env.CALENDAR.get(env.CALENDAR.idFromName("bookings"));
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
      for (const key of all.keys()) {
        const date = String(key).split("|")[0];
        if (date < today) {
          await this.state.storage.delete(key);
          continue;
        }
        taken.push(key);
      }
      return Response.json({ ok: true, taken });
    }

    const key = slotKey(payload.date, payload.time);
    if (!key || !isValidSlot(payload.date, payload.time)) {
      return Response.json({ ok: false, error: "That is not an open 3-hour time." }, { status: 400 });
    }

    if (action === "claim") {
      const existing = await this.state.storage.get(key);
      if (existing) {
        return Response.json({ ok: false, error: "taken" }, { status: 409 });
      }
      await this.state.storage.put(key, { at: Date.now() });
      return Response.json({ ok: true, key });
    }

    if (action === "release") {
      await this.state.storage.delete(key);
      return Response.json({ ok: true, key });
    }

    return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }
}

async function calendarAction(env, payload) {
  const stub = calendarStub(env);
  if (!stub) return { ok: false, error: "Calendar is not configured", status: 503 };
  const res = await stub.fetch("https://calendar/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const out = await res.json().catch(() => ({}));
  return { ...out, status: res.status };
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
      if (url.searchParams.has("slots")) {
        const out = await calendarAction(env, { action: "list" });
        if (out.status === 503) return json(origin, { ok: true, taken: [] });
        return json(origin, { ok: true, taken: out.taken || [] }, out.status || 200);
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
    if (action === "claim" || action === "release" || action === "list") {
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
