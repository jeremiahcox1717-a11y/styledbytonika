/**
 * Text reminders for Styled by Tonika bookings.
 * Sends the client a text 3 hours before their appointment.
 *
 * Deploy (one-time):
 *   npx wrangler deploy
 *   npx wrangler secret put TWILIO_ACCOUNT_SID
 *   npx wrangler secret put TWILIO_AUTH_TOKEN
 *   npx wrangler secret put TWILIO_MESSAGING_SERVICE_SID
 *
 * Then paste the worker URL into content.json as smsWebhook and Publish.
 */
const TZ = "America/New_York";
const ALLOWED = new Set([
  "https://styledbytonika.ca",
  "https://www.styledbytonika.ca",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

function corsHeaders(origin) {
  const allow = ALLOWED.has(origin) ? origin : "https://styledbytonika.ca";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    if (req.method !== "POST") return json(origin, { error: "POST only" }, 405);

    let payload;
    try {
      payload = await req.json();
    } catch {
      return json(origin, { error: "Invalid JSON" }, 400);
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
