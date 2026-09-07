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
        opt.value = label;
        opt.textContent = label;
        timeSelect.appendChild(opt);
      }
    }
  }

  dateInput.addEventListener("change", fillTimes);

  form.addEventListener("submit", (event) => {
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

    const when = new Date(`${data.date}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const where = [data.address, data.address2, data.city, data.state, data.zip]
      .filter(Boolean)
      .join(", ");
    successCopy.textContent = `Thank you, ${data.name}. Your ${data.service.toLowerCase()} request for ${when} at ${data.time} is in${where ? ` at ${where}` : ""}. I’ll confirm shortly by text or email.`;
    modal.hidden = false;
    form.reset();
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
