const dateInput = document.querySelector("#date");
const timeSelect = document.querySelector("#time");
const form = document.querySelector("#booking-form");
const formError = document.querySelector("#form-error");
const modal = document.querySelector("#success-modal");
const successCopy = document.querySelector("#success-copy");

if (dateInput && timeSelect && form) {
  const today = new Date();
  const iso = (d) => {
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  };

  dateInput.min = iso(today);
  dateInput.max = iso(new Date(today.getFullYear(), today.getMonth() + 4, today.getDate()));

  function hoursFor(dateStr) {
    const day = new Date(`${dateStr}T12:00:00`).getDay();
    const site = window.__SITE__;
    if (day === 6) {
      if (site?.hours?.saturday) return { start: site.hours.saturday.start, end: site.hours.saturday.end };
      return { start: 8, end: 17 };
    }
    if (day === 0) {
      if (site?.hours?.sunday) return { start: site.hours.sunday.start, end: site.hours.sunday.end };
      return { start: 9, end: 15 };
    }
    return null;
  }

  function fillTimes() {
    const hours = hoursFor(dateInput.value);
    if (!dateInput.value) {
      timeSelect.innerHTML = `<option value="" disabled selected>Select a date first</option>`;
      return;
    }
    if (!hours) {
      timeSelect.innerHTML = `<option value="" disabled selected>Closed weekdays — Saturday & Sunday only</option>`;
      return;
    }
    timeSelect.innerHTML = `<option value="" disabled selected>Select a time</option>`;
    for (let h = hours.start; h < hours.end; h++) {
      for (const m of ["00", "30"]) {
        const label = new Date(`2026-01-01T${String(h).padStart(2, "0")}:${m}:00`).toLocaleTimeString(
          "en-US",
          { hour: "numeric", minute: "2-digit" }
        );
        const opt = document.createElement("option");
        opt.value = `${String(h).padStart(2, "0")}:${m}`;
        opt.textContent = label;
        timeSelect.appendChild(opt);
      }
    }
  }

  dateInput.addEventListener("change", fillTimes);

  const TZ = "America/New_York";
  const submitBtn = form.querySelector('button[type="submit"]');

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
    let utc = Date.UTC(y, mo - 1, d, h, min, 0);
    const off = tzOffsetMs(TZ, new Date(utc));
    utc = Date.UTC(y, mo - 1, d, h, min, 0) - off;
    const off2 = tzOffsetMs(TZ, new Date(utc));
    if (off2 !== off) utc = Date.UTC(y, mo - 1, d, h, min, 0) - off2;
    return utc;
  }

  function formatWhen(dateStr, timeValue) {
    const clock = parseClock(timeValue);
    const start = clock ? appointmentUtc(dateStr, clock.h, clock.min) : Date.parse(`${dateStr}T12:00:00`);
    const day = new Date(start).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: TZ,
    });
    const timeLabel = clock
      ? new Date(start).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: TZ,
        })
      : timeValue;
    return { day, timeLabel, start };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.hidden = true;

    const data = Object.fromEntries(new FormData(form));
    if (hoursFor(data.date) == null) {
      formError.hidden = false;
      formError.textContent = "Sorry — we’re only open Saturday and Sunday. Please pick a weekend date.";
      return;
    }
    if (!data.time) {
      formError.hidden = false;
      formError.textContent = "Please choose a time that works for you.";
      return;
    }

    const { day, timeLabel, start } = formatWhen(data.date, data.time);
    const where = [data.address, data.address2, data.city, data.state, data.zip]
      .filter(Boolean)
      .join(", ");
    const hours = Number(window.__SITE__?.reminderHours) || 3;
    const remindOn = data["sms-reminder"] === "on";
    let reminderLine = "";

    if (remindOn) {
      const webhook = String(window.__SITE__?.smsWebhook || "").trim();
      if (webhook) {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Sending…";
        }
        try {
          const res = await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: data.name,
              phone: data.phone,
              date: data.date,
              time: data.time,
              hours,
            }),
          });
          const out = await res.json().catch(() => ({}));
          if (res.ok && out.ok) {
            const around = out.remindLabel || new Date(start - hours * 60 * 60 * 1000).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: TZ,
            });
            reminderLine = ` You’ll get a text reminder ${hours} hours before (${around}) with the day and time.`;
          }
        } catch {
          /* booking still goes through */
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Request Appointment";
        }
      } else {
        const around = new Date(start - hours * 60 * 60 * 1000).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: TZ,
        });
        reminderLine = ` You’ll get a text reminder ${hours} hours before (${around}) with the day and time.`;
      }
    }

    successCopy.textContent = `Thank you, ${data.name}. Your ${data.service.toLowerCase()} request for ${day} at ${timeLabel} is in${where ? ` at ${where}` : ""}. I’ll confirm shortly by text or email.${reminderLine}`;
    modal.hidden = false;
    form.reset();
    const remindBox = document.querySelector("#sms-reminder");
    if (remindBox) remindBox.checked = true;
    fillTimes();
  });
}

const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightbox-image");
const lightboxClose = document.querySelector("#lightbox-close");

if (lightbox && lightboxImage) {
  document.querySelectorAll(".work-item").forEach((button) => {
    button.addEventListener("click", () => {
      lightboxImage.src = button.dataset.full;
      lightboxImage.alt = button.querySelector("img").alt;
      lightbox.hidden = false;
    });
  });
  lightboxClose.addEventListener("click", () => {
    lightbox.hidden = true;
    lightboxImage.src = "";
  });
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      lightbox.hidden = true;
      lightboxImage.src = "";
    }
  });
}
