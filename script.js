const dateInput = document.querySelector("#date");
const timeSelect = document.querySelector("#time");
const form = document.querySelector("#booking-form");
const formError = document.querySelector("#form-error");
const modal = document.querySelector("#success-modal");
const successCopy = document.querySelector("#success-copy");

if (dateInput && timeSelect && form) {
  const iso = (d) => {
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  };

  function fillWeekendDates() {
    const keep = dateInput.value;
    dateInput.innerHTML = `<option value="" disabled>Select a day</option>`;
    const end = new Date();
    end.setMonth(end.getMonth() + 4);
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      const weekday = cursor.getDay();
      if ((weekday === 0 || weekday === 6) && cursor >= start) {
        const opt = document.createElement("option");
        opt.value = iso(cursor);
        opt.textContent = cursor.toLocaleDateString("en-CA", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
        dateInput.appendChild(opt);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (keep && [...dateInput.options].some((o) => o.value === keep)) dateInput.value = keep;
    else dateInput.selectedIndex = 0;
  }

  fillWeekendDates();

  function hoursFor(dateStr) {
    const day = new Date(`${dateStr}T12:00:00`).getDay();
    const site = window.__SITE__;
    if (day === 6) {
      if (site?.hours?.saturday) return { start: site.hours.saturday.start, end: site.hours.saturday.end };
      return { start: 9, end: 17 };
    }
    if (day === 0) {
      if (site?.hours?.sunday) return { start: site.hours.sunday.start, end: site.hours.sunday.end };
      return { start: 9, end: 17 };
    }
    return null;
  }

  function fillTimes() {
    const hours = hoursFor(dateInput.value);
    if (!dateInput.value) {
      timeSelect.innerHTML = `<option value="" disabled selected>Select a day first</option>`;
      return;
    }
    if (!hours) {
      timeSelect.innerHTML = `<option value="" disabled selected>Saturday & Sunday only</option>`;
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

  const TZ = "America/Vancouver";
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

  function showBooked({ name, service, day, timeLabel, where, instagram, reminderLine, sendNote, inspoLine }) {
    successCopy.replaceChildren();
    const line = (cls, text) => {
      const p = document.createElement("p");
      if (cls) p.className = cls;
      p.textContent = text;
      successCopy.appendChild(p);
    };
    line("booked-hello", `You’re booked, ${name}.`);
    line("booked-when", `${day} at ${timeLabel}`);
    line("booked-service", service);
    if (instagram) line("booked-ig", instagram);
    if (where) line("booked-where", where);
    if (inspoLine) line("booked-inspo", inspoLine);
    if (reminderLine) line("booked-reminder", reminderLine);
    if (sendNote) line("booked-send-note", sendNote);
    modal.hidden = false;
  }

  const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
  const MEDIA_TYPE_OK = /^(image|video)\//i;
  const MEDIA_EXT_OK = /\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|m4v|webm|3gp|hevc)$/i;

  function isVideoFile(file) {
    return String(file?.type || "").startsWith("video/") || /\.(mp4|mov|m4v|webm|3gp|hevc)$/i.test(file?.name || "");
  }

  function mediaKind(file) {
    return isVideoFile(file) ? "video" : "photo";
  }

  function bindMediaPicker({ input, upload, preview, previewImg, previewVideo, previewName, removeBtn }) {
    let objectUrl = "";

    function clear() {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = "";
      }
      if (input) input.value = "";
      if (previewImg) {
        previewImg.removeAttribute("src");
        previewImg.hidden = true;
      }
      if (previewVideo) {
        previewVideo.pause();
        previewVideo.removeAttribute("src");
        previewVideo.load();
        previewVideo.hidden = true;
      }
      if (previewName) previewName.textContent = "";
      if (preview) preview.hidden = true;
      upload?.classList.remove("has-file");
    }

    function show(file) {
      if (!file) {
        clear();
        return;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      const video = isVideoFile(file);
      if (video && previewVideo) {
        if (previewImg) {
          previewImg.removeAttribute("src");
          previewImg.hidden = true;
        }
        previewVideo.hidden = false;
        previewVideo.src = objectUrl;
      } else if (previewImg) {
        if (previewVideo) {
          previewVideo.pause();
          previewVideo.removeAttribute("src");
          previewVideo.load();
          previewVideo.hidden = true;
        }
        previewImg.hidden = false;
        previewImg.src = objectUrl;
        previewImg.onerror = () => {
          previewImg.hidden = true;
        };
      }
      if (previewName) previewName.textContent = file.name;
      if (preview) preview.hidden = false;
      upload?.classList.add("has-file");
    }

    function take(file) {
      if (!file) return false;
      if (!MEDIA_TYPE_OK.test(file.type || "") && !MEDIA_EXT_OK.test(file.name || "")) {
        formError.hidden = false;
        formError.textContent = "Please choose a photo or video (JPG, PNG, HEIC, MP4, or MOV).";
        clear();
        return false;
      }
      if (file.size > MAX_MEDIA_BYTES) {
        formError.hidden = false;
        formError.textContent = "That file is too large. Please use a photo or a short clip under 10 MB.";
        clear();
        return false;
      }
      formError.hidden = true;
      show(file);
      return true;
    }

    if (input) {
      input.addEventListener("change", () => {
        take(input.files?.[0]);
      });
    }
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        clear();
      });
    }
    if (upload) {
      ["dragenter", "dragover"].forEach((type) => {
        upload.addEventListener(type, (event) => {
          event.preventDefault();
          upload.classList.add("is-dragover");
        });
      });
      ["dragleave", "drop"].forEach((type) => {
        upload.addEventListener(type, (event) => {
          event.preventDefault();
          upload.classList.remove("is-dragover");
        });
      });
      upload.addEventListener("drop", (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file || !input) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        take(file);
      });
    }

    return {
      clear,
      file: () => input?.files?.[0] || null,
    };
  }

  const hairPicker = bindMediaPicker({
    input: form.querySelector("#hair-media"),
    upload: form.querySelector("#hair-upload"),
    preview: form.querySelector("#hair-preview"),
    previewImg: form.querySelector("#hair-preview-img"),
    previewVideo: form.querySelector("#hair-preview-video"),
    previewName: form.querySelector("#hair-preview-name"),
    removeBtn: form.querySelector("#hair-remove"),
  });
  const inspoPicker = bindMediaPicker({
    input: form.querySelector("#inspo-photo"),
    upload: form.querySelector("#inspo-upload"),
    preview: form.querySelector("#inspo-preview"),
    previewImg: form.querySelector("#inspo-preview-img"),
    previewVideo: form.querySelector("#inspo-preview-video"),
    previewName: form.querySelector("#inspo-preview-name"),
    removeBtn: form.querySelector("#inspo-remove"),
  });

  function bookingEmailBody(data, day, timeLabel, where, hairFile, inspoFile) {
    return [
      "New Styled by Tonika booking",
      "",
      `Name: ${data.name}`,
      `Phone: ${data.phone}`,
      `Email: ${data.email}`,
      `Instagram: ${data.instagram || "(none)"}`,
      `Service: ${data.service}`,
      `When: ${day} at ${timeLabel}`,
      `Address: ${where || "(none)"}`,
      `Current hair ${hairFile ? mediaKind(hairFile) : "photo/video"}: ${hairFile?.name || "(none uploaded)"}`,
      `Inspiration ${inspoFile ? mediaKind(inspoFile) : "photo/video"}: ${inspoFile?.name || "(none uploaded)"}`,
      `Inspiration link: ${data["inspo-url"] || "(none)"}`,
      `Notes: ${data.notes || "(none)"}`,
    ].join("\n");
  }

  function openMailto(inbox, subject, body) {
    const href = `mailto:${inbox}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function sendBookingEmail(data, day, timeLabel, where, photoFile) {
    const inbox = String(window.__SITE__?.email || "styledbytonika@gmail.com").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inbox)) {
      throw new Error("Bad inbox");
    }
    const subject = `New booking: ${data.service} — ${day} at ${timeLabel}`;
    const body = bookingEmailBody(data, day, timeLabel, where, photoFile);
    const fd = new FormData();
    fd.append("name", data.name);
    fd.append("phone", data.phone);
    fd.append("email", data.email);
    fd.append("instagram", data.instagram || "(none)");
    fd.append("service", data.service);
    fd.append("date", day);
    fd.append("time", timeLabel);
    fd.append("address", where);
    fd.append("inspiration_link", data["inspo-url"] || "(none)");
    fd.append("notes", data.notes || "(none)");
    if (photoFile) fd.append("attachment", photoFile, photoFile.name);
    fd.append("_subject", subject);
    fd.append("_template", "table");
    fd.append("_replyto", data.email);

    try {
      const res = await fetch(`https://formsubmit.co/ajax/${inbox}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: fd,
      });
      const out = await res.json().catch(() => ({}));
      if (String(out.success) === "true") return { inbox, subject, body, via: "formsubmit" };
    } catch {
      /* fall through to mailto */
    }
    openMailto(inbox, subject, body);
    return { inbox, subject, body, via: "mailto" };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.hidden = true;

    const data = Object.fromEntries(new FormData(form));
    const photoFile = inspoInput?.files?.[0] || null;
    if (photoFile && photoFile.size > MAX_INSPO_BYTES) {
      formError.hidden = false;
      formError.textContent = "That photo is too large. Please use an image under 8 MB.";
      return;
    }
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
    const where = [data.address, data.address2, data.city, data.province || "British Columbia"]
      .filter(Boolean)
      .join(", ");
    const hours = Number(window.__SITE__?.reminderHours) || 3;
    const remindOn = data["sms-reminder"] === "on";
    let reminderLine = "";

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
    }

    let sent;
    try {
      sent = await sendBookingEmail(data, day, timeLabel, where, photoFile);
    } catch {
      formError.hidden = false;
      formError.textContent = "Couldn’t send your request. Please try again or email styledbytonika@gmail.com.";
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Request Appointment";
      }
      return;
    }

    if (remindOn) {
      const webhook = String(window.__SITE__?.smsWebhook || "").trim();
      if (webhook) {
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
            reminderLine = `Text reminder ${hours} hours before (${around}).`;
          }
        } catch {
          /* email already went through */
        }
      } else {
        const around = new Date(start - hours * 60 * 60 * 1000).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: TZ,
        });
        reminderLine = `Text reminder ${hours} hours before (${around}).`;
      }
    }

    const sendNote =
      sent?.via === "mailto"
        ? photoFile
          ? "An email to Tonika should have opened. Tap Send if you see it. The photo couldn’t be attached this way — add the image in that email if you can."
          : "An email to Tonika should have opened. Tap Send if you see it — that’s how this request reaches her inbox."
        : "";
    const inspoParts = [];
    if (photoFile) inspoParts.push("Inspiration photo sent.");
    if (data["inspo-url"]) inspoParts.push("Inspiration link sent.");
    showBooked({
      name: data.name,
      service: data.service,
      day,
      timeLabel,
      where,
      instagram: data.instagram,
      reminderLine,
      sendNote,
      inspoLine: inspoParts.join(" "),
    });
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Request Appointment";
    }
    form.reset();
    clearInspoPhoto();
    const remindBox = document.querySelector("#sms-reminder");
    if (remindBox) remindBox.checked = true;
    const province = document.querySelector("#province");
    if (province) province.value = "British Columbia";
    fillWeekendDates();
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
