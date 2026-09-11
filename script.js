const dateInput = document.querySelector("#date");
const timeSelect = document.querySelector("#time");
const form = document.querySelector("#booking-form");
const formError = document.querySelector("#form-error");
const modal = document.querySelector("#success-modal");
const successCopy = document.querySelector("#success-copy");

if (dateInput && timeSelect && form) {
  const TZ = "America/Vancouver";
  try {
    localStorage.removeItem("sbt-taken-slots");
  } catch {
    /* ignore */
  }
  const LOCAL_TAKEN_KEY = "sbt-taken-slots-v2";
  const takenSlots = new Set();
  let liveCalendar = "";
  let timesGen = 0;

  const iso = (d) => {
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  };

  function slotHours() {
    const n = Number(window.__SITE__?.slotHours);
    return n > 0 ? n : 3;
  }

  function clockValue(h, min = 0) {
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  function slotKey(dateStr, timeValue) {
    const clock = parseClock(timeValue);
    if (!clock) return `${dateStr}|${timeValue}`;
    return `${dateStr}|${clockValue(clock.h, clock.min)}`;
  }

  function addTaken(keys) {
    (keys || []).forEach((key) => {
      if (key) takenSlots.add(String(key));
    });
  }

  function rememberTaken(key) {
    if (!key) return;
    takenSlots.add(key);
    try {
      const local = JSON.parse(localStorage.getItem(LOCAL_TAKEN_KEY) || "[]");
      if (!local.includes(key)) {
        local.push(key);
        localStorage.setItem(LOCAL_TAKEN_KEY, JSON.stringify(local));
      }
    } catch {
      /* private mode */
    }
  }

  function forgetTaken(key) {
    if (!key) return;
    takenSlots.delete(key);
    try {
      const local = JSON.parse(localStorage.getItem(LOCAL_TAKEN_KEY) || "[]").filter((item) => item !== key);
      localStorage.setItem(LOCAL_TAKEN_KEY, JSON.stringify(local));
    } catch {
      /* private mode */
    }
  }

  function takenListFrom(data) {
    return (data?.taken || []).map((item) => (typeof item === "string" ? item : `${item.date}|${item.time}`));
  }

  async function loadTaken() {
    takenSlots.clear();
    try {
      addTaken(JSON.parse(localStorage.getItem(LOCAL_TAKEN_KEY) || "[]"));
    } catch {
      /* ignore */
    }
    liveCalendar = "";
    const sources = [
      fetchJson(`bookings.json?ts=${Date.now()}`),
      fetchJson(
        `https://raw.githubusercontent.com/jeremiahcox1717-a11y/styledbytonika/main/bookings.json?ts=${Date.now()}`
      ),
    ];
    for (const url of bookingEndpoints()) {
      sources.push(
        fetchJson(`${url}?slots=1`).then((result) => {
          if (result.res?.ok && Array.isArray(result.out?.taken)) liveCalendar = liveCalendar || url;
          return result;
        })
      );
    }
    const results = await Promise.allSettled(sources);
    results.forEach((result) => {
      if (result.status !== "fulfilled" || !result.value?.res?.ok) return;
      addTaken(takenListFrom(result.value.out));
    });
  }

  async function claimSlot(dateStr, timeValue, extra = {}) {
    const key = slotKey(dateStr, timeValue);
    await loadTaken();
    if (takenSlots.has(key)) return { ok: false, taken: true, key };

    if (!liveCalendar) {
      for (const url of bookingEndpoints()) {
        try {
          const { res, out } = await fetchJson(`${url}?slots=1`);
          if (res.ok && Array.isArray(out.taken)) {
            liveCalendar = url;
            addTaken(out.taken);
            break;
          }
        } catch {
          /* try next */
        }
      }
    }

    if (liveCalendar) {
      try {
        const { res, out } = await fetchJson(
          liveCalendar,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "claim",
              date: dateStr,
              time: timeValue,
              name: extra?.name || "",
              phone: extra?.phone || "",
              email: extra?.email || "",
              service: extra?.service || "",
            }),
          },
          8000
        );
        if (res.status === 409 || out.error === "taken") return { ok: false, taken: true, key };
        if (res.status === 400) {
          rememberTaken(key);
          return { ok: true, via: "local", key };
        }
        if (!res.ok || out.ok === false) return { ok: false, taken: false, key };
        rememberTaken(key);
        return { ok: true, via: "live", key };
      } catch {
        return { ok: false, taken: false, key };
      }
    }

    rememberTaken(key);
    return { ok: true, via: "local", key };
  }

  function bookingEndpoints() {
    const urls = [];
    const configured = String(window.__SITE__?.bookingApi || "").trim();
    if (configured) urls.push(configured.replace(/\/$/, ""));
    urls.push("https://styledbytonika-sms.workers.dev");
    return [...new Set(urls)];
  }

  async function fetchJson(url, opts = {}, ms = 2500) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      const out = await res.json().catch(() => ({}));
      return { res, out };
    } finally {
      clearTimeout(timer);
    }
  }

  async function releaseSlot(dateStr, timeValue) {
    if (!liveCalendar) return;
    try {
      await fetch(liveCalendar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release", date: dateStr, time: timeValue }),
      });
    } catch {
      /* email already failed */
    }
  }

  function vancouverStamp() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value;
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      minutes: Number(get("hour")) * 60 + Number(get("minute")),
    };
  }

  function slotHasPassed(dateStr, h, min) {
    const now = vancouverStamp();
    if (dateStr > now.date) return false;
    if (dateStr < now.date) return true;
    return h * 60 + min <= now.minutes;
  }

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

  function blockedWindows() {
    return Array.isArray(window.__SITE__?.blocked) ? window.__SITE__.blocked : [];
  }

  function weekdayName(dateStr) {
    const day = new Date(`${dateStr}T12:00:00`).getDay();
    if (day === 6) return "saturday";
    if (day === 0) return "sunday";
    return "";
  }

  function hourIsBlocked(dateStr, h) {
    return blockedWindows().some((block) => {
      const start = Number(block.start);
      const end = Number(block.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || h < start || h >= end) return false;
      if (block.date) return String(block.date) === dateStr;
      const day = String(block.weekday || "").toLowerCase();
      return day && day === weekdayName(dateStr);
    });
  }

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

  function isOpenSlot(dateStr, timeValue) {
    const hours = hoursFor(dateStr);
    const clock = parseClock(timeValue);
    if (!hours || !clock) return false;
    const span = slotHours();
    if (clock.min !== 0) return false;
    if (clock.h < hours.start || clock.h >= hours.end) return false;
    if (hourIsBlocked(dateStr, clock.h)) return false;
    return (clock.h - hours.start) % span === 0;
  }

  function timeLabelAt(h, min = 0) {
    return new Date(`2026-01-01T${clockValue(h, min)}:00`).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  async function fillTimes() {
    const gen = ++timesGen;
    const keep = timeSelect.value;
    const hours = hoursFor(dateInput.value);
    if (!dateInput.value) {
      timeSelect.innerHTML = `<option value="" disabled selected>Select a day first</option>`;
      return;
    }
    if (!hours) {
      timeSelect.innerHTML = `<option value="" disabled selected>Saturday & Sunday only</option>`;
      return;
    }
    timeSelect.innerHTML = `<option value="" disabled selected>Loading times…</option>`;
    await loadTaken();
    if (gen !== timesGen) return;

    const span = slotHours();
    timeSelect.innerHTML = `<option value="" disabled selected>Select a time</option>`;
    let openCount = 0;
    for (let h = hours.start; h < hours.end; h += span) {
      const value = clockValue(h);
      const key = `${dateInput.value}|${value}`;
      if (slotHasPassed(dateInput.value, h, 0) || takenSlots.has(key) || hourIsBlocked(dateInput.value, h)) continue;
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = `${timeLabelAt(h)} – ${timeLabelAt(h + span)}`;
      timeSelect.appendChild(opt);
      openCount += 1;
    }
    if (!openCount) {
      timeSelect.innerHTML = `<option value="" disabled selected>No times left this day</option>`;
      return;
    }
    if (keep && [...timeSelect.options].some((o) => o.value === keep && !o.disabled)) {
      timeSelect.value = keep;
    }
  }

  dateInput.addEventListener("change", () => {
    fillTimes();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === LOCAL_TAKEN_KEY && dateInput.value) fillTimes();
  });

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

  function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function blobToInline(blob, filename, kind) {
    if (!blob) return null;
    const buf = await blob.arrayBuffer();
    return {
      b64: arrayBufferToBase64(buf),
      type: blob.type || "image/jpeg",
      filename: filename || "photo.jpg",
      kind: kind || "photo",
    };
  }

  async function compressImageFile(file) {
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      bitmap = null;
    }
    if (!bitmap) return blobToInline(file, file.name, "photo");
    const maxEdge = 1000;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.74));
    const name = String(file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
    return blobToInline(blob || file, name, "photo");
  }

  async function videoPoster(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      const done = async (blob) => {
        URL.revokeObjectURL(url);
        video.removeAttribute("src");
        video.load();
        if (!blob) {
          resolve(null);
          return;
        }
        const name = String(file.name || "video").replace(/\.[^.]+$/, "") + "-preview.jpg";
        resolve(await blobToInline(blob, name, "video"));
      };
      video.onerror = () => done(null);
      video.onloadeddata = () => {
        try {
          video.currentTime = Math.min(0.25, Math.max(0, (video.duration || 1) * 0.1));
        } catch {
          done(null);
        }
      };
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 640;
        const scale = Math.min(1, 1000 / Math.max(w, h));
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => done(blob), "image/jpeg", 0.74);
      };
    });
  }

  async function fileToInline(file) {
    if (!file) return null;
    if (isVideoFile(file)) {
      const poster = await videoPoster(file);
      return poster;
    }
    return compressImageFile(file);
  }

  function bookingEmailBody(data, day, timeLabel, where, hairFile, inspoFile, extra = {}) {
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
      extra.hairUrl ? `Current hair photo: ${extra.hairUrl}` : `Current hair: ${hairFile?.name || "(none uploaded)"}`,
      extra.inspoUrl ? `Inspiration photo: ${extra.inspoUrl}` : `Inspiration: ${inspoFile?.name || "(none uploaded)"}`,
      extra.recapUrl ? `Open with photos: ${extra.recapUrl}` : "",
      `Inspiration link: ${data["inspo-url"] || "(none)"}`,
      `Notes: ${data.notes || "(none)"}`,
    ]
      .filter((line, i, arr) => line !== "" || arr[i - 1] !== "")
      .join("\n");
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

  async function postFormSubmit(inbox, subject, data, day, timeLabel, where, extras = {}) {
    const fd = new FormData();
    fd.append("_subject", subject);
    fd.append("_template", "box");
    fd.append("_replyto", data.email);
    if (extras.recapUrl) fd.append("Open this booking", extras.recapUrl);
    fd.append("Client", data.name);
    fd.append("Phone", data.phone);
    fd.append("Client email", data.email);
    fd.append("Instagram", data.instagram || "(none)");
    fd.append("Service", data.service);
    fd.append("When", `${day} at ${timeLabel}`);
    fd.append("Address", where || "(none)");
    if (extras.hairUrl) fd.append("Current hair photo", extras.hairUrl);
    if (extras.inspoUrl) fd.append("Inspiration photo", extras.inspoUrl);
    fd.append("Inspiration link", data["inspo-url"] || "(none)");
    fd.append("Notes", data.notes || "(none)");
    if (extras.hairBlob) fd.append("attachment", extras.hairBlob, extras.hairBlob.name || "current-hair.jpg");
    if (extras.inspoBlob) fd.append("inspiration", extras.inspoBlob, extras.inspoBlob.name || "inspiration.jpg");
    const res = await fetch(`https://formsubmit.co/ajax/${inbox}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: fd,
    });
    const out = await res.json().catch(() => ({}));
    if (String(out.success) !== "true") throw new Error("FormSubmit failed");
    return { inbox, subject, via: "formsubmit", recapUrl: extras.recapUrl };
  }

  function inlineToBlob(inline) {
    if (!inline?.b64) return null;
    const bin = atob(inline.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], inline.filename || "photo.jpg", { type: inline.type || "image/jpeg" });
  }

  async function sendBookingEmail(data, day, timeLabel, where, hairFile, inspoFile) {
    const inbox = String(window.__SITE__?.email || "styledbytonika@gmail.com").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inbox)) {
      throw new Error("Bad inbox");
    }
    const subject = `New booking: ${data.service} — ${day} at ${timeLabel}`;
    const hair = await fileToInline(hairFile);
    const inspo = await fileToInline(inspoFile);
    const payload = {
      action: "notify",
      inbox,
      name: data.name,
      phone: data.phone,
      email: data.email,
      instagram: data.instagram || "",
      service: data.service,
      date: data.date,
      slotTime: data.time,
      day,
      timeLabel,
      address: where,
      notes: data.notes || "",
      inspoLink: data["inspo-url"] || "",
      subject,
      hair,
      inspo,
    };

    for (const url of bookingEndpoints()) {
      try {
        const { res, out } = await fetchJson(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
          25000
        );
        if (res.ok && out.ok) {
          return { inbox, subject, via: out.via || "worker", recapUrl: out.recapUrl, hairUrl: out.hairUrl, inspoUrl: out.inspoUrl };
        }
        if (out.recapUrl) {
          try {
            return await postFormSubmit(inbox, subject, data, day, timeLabel, where, {
              recapUrl: out.recapUrl,
              hairUrl: out.hairUrl,
              inspoUrl: out.inspoUrl,
              hairBlob: inlineToBlob(hair),
              inspoBlob: inlineToBlob(inspo),
            });
          } catch {
            /* try next endpoint */
          }
        }
      } catch {
        /* try next */
      }
    }

    try {
      return await postFormSubmit(inbox, subject, data, day, timeLabel, where, {
        hairBlob: inlineToBlob(hair),
        inspoBlob: inlineToBlob(inspo),
      });
    } catch {
      const body = bookingEmailBody(data, day, timeLabel, where, hairFile, inspoFile);
      openMailto(inbox, subject, body);
      return { inbox, subject, body, via: "mailto" };
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.hidden = true;

    const data = Object.fromEntries(new FormData(form));
    const hairFile = hairPicker.file();
    const inspoFile = inspoPicker.file();
    const tooBig = [hairFile, inspoFile].find((file) => file && file.size > MAX_MEDIA_BYTES);
    if (tooBig) {
      formError.hidden = false;
      formError.textContent = "That file is too large. Please use a photo or a short clip under 10 MB.";
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
    if (!isOpenSlot(data.date, data.time)) {
      formError.hidden = false;
      formError.textContent = "Please pick a start time that’s still open.";
      fillTimes();
      return;
    }
    const picked = parseClock(data.time);
    if (picked && slotHasPassed(data.date, picked.h, picked.min)) {
      formError.hidden = false;
      formError.textContent = "That time has already passed. Please pick a later time.";
      fillTimes();
      return;
    }

    const holdKey = slotKey(data.date, data.time);
    await loadTaken();
    if (takenSlots.has(holdKey)) {
      formError.hidden = false;
      formError.textContent = "That time was just booked. Please pick another.";
      fillTimes();
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

    const claimed = await claimSlot(data.date, data.time, {
      name: data.name,
      phone: data.phone,
      email: data.email,
      service: data.service,
    });
    if (!claimed.ok) {
      formError.hidden = false;
      formError.textContent = claimed.taken
        ? "That time was just booked. Please pick another."
        : "Couldn’t hold that time. Please try again.";
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Request Appointment";
      }
      fillTimes();
      return;
    }

    let sent;
    try {
      sent = await sendBookingEmail(data, day, timeLabel, where, hairFile, inspoFile);
    } catch {
      if (claimed.via === "live") await releaseSlot(data.date, data.time);
      else forgetTaken(holdKey);
      formError.hidden = false;
      formError.textContent = "Couldn’t send your request. Please try again or email styledbytonika@gmail.com.";
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Request Appointment";
      }
      return;
    }
    rememberTaken(holdKey);

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

    const hasMedia = Boolean(hairFile || inspoFile);
    const sendNote =
      sent?.via === "mailto"
        ? hasMedia
          ? "An email to Tonika should have opened. Tap Send if you see it. The photo or video couldn’t be attached this way — add it in that email if you can."
          : "An email to Tonika should have opened. Tap Send if you see it — that’s how this request reaches her inbox."
        : "";
    const inspoParts = [];
    if (hairFile) inspoParts.push(`Current hair ${mediaKind(hairFile)} sent.`);
    if (inspoFile) inspoParts.push(`Inspiration ${mediaKind(inspoFile)} sent.`);
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
    hairPicker.clear();
    inspoPicker.clear();
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

