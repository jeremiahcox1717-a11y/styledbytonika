async function loadSiteContent() {
  try {
    const res = await fetch(`content.json?ts=${Date.now()}`);
    if (!res.ok) return;
    const c = await res.json();
    window.__SITE__ = c;

    const text = (sel, value) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (value != null) el.textContent = value;
      });
    };

    text("[data-field='brand']", c.brand);
    text("[data-field='kicker']", c.kicker);
    text("[data-field='owner']", c.owner ? `By ${c.owner}` : null);
    text("[data-field='bio']", c.bio);
    text("[data-field='phone']", c.phone);
    text("[data-field='email']", c.email);
    text("[data-field='instagram']", c.instagram);
    text("[data-field='hashtag']", c.hashtag ? `Hashtag ${c.hashtag}` : null);
    text("[data-field='tagline']", c.instagram ? `Tag us ${c.instagram}` : null);
    text("[data-field='book-lede']", c.bookLede);
    text("[data-field='thanks-note']", c.thanksNote);
    text("[data-field='hours-sat-label']", c.hours?.saturday?.label);
    text("[data-field='hours-sat-text']", c.hours?.saturday?.text);
    text("[data-field='hours-sun-label']", c.hours?.sunday?.label);
    text("[data-field='hours-sun-text']", c.hours?.sunday?.text);
    text("[data-field='policy-deposits']", c.policies?.deposits);
    text("[data-field='policy-traveling']", c.policies?.traveling);
    text("[data-field='policy-delay']", c.policies?.delay);
    text("[data-field='policy-reschedule']", c.policies?.reschedule);

    if (Array.isArray(c.before)) {
      document.querySelectorAll("[data-field^='before-']").forEach((el) => {
        const i = Number(el.getAttribute("data-field").split("-")[1]);
        if (c.before[i]) el.textContent = c.before[i];
      });
    }

    if (Array.isArray(c.services)) {
      const list = document.querySelector("[data-field='services']");
      if (list) {
        list.innerHTML = c.services
          .map((name) => `<li>${name || ""}</li>`)
          .join("");
      }
      const select = document.querySelector("#service");
      if (select) {
        const current = select.value;
        select.innerHTML = `<option value="" disabled>Select a service</option>${c.services
          .filter(Boolean)
          .map((name) => `<option>${name}</option>`)
          .join("")}`;
        if ([...select.options].some((o) => o.value === current)) select.value = current;
        else select.selectedIndex = 0;
      }
    }
  } catch {
    /* keep the HTML fallback copy */
  }
}

loadSiteContent();
