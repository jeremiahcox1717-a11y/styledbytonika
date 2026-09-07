const gateForm = document.querySelector("#gate-form");
const gateCopy = document.querySelector("#gate-copy");
const gateError = document.querySelector("#gate-error");
const gateSubmit = document.querySelector("#gate-submit");
const passInput = document.querySelector("#owner-pass");
const pass2 = document.querySelector("#owner-pass-2");
const passConfirmWrap = document.querySelector("#pass-confirm-wrap");

let setupMode = false;

function showGateError(msg) {
  gateError.hidden = false;
  gateError.textContent = msg;
}

function goToStudio() {
  markUnlocked();
  window.location.replace("studio.html");
}

if (isUnlocked()) {
  window.location.replace("studio.html");
}

if (!storedHash()) {
  setupMode = true;
  gateCopy.textContent = "Create an owner password. Only people with this password can open the studio.";
  passConfirmWrap.hidden = false;
  pass2.required = true;
  gateSubmit.textContent = "Create password";
}

gateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  gateError.hidden = true;
  const value = passInput.value;
  try {
    if (setupMode) {
      if (value.length < 8) {
        showGateError("Use at least 8 characters.");
        return;
      }
      if (value !== pass2.value) {
        showGateError("Those passwords do not match.");
        return;
      }
      saveHash(await sha256(value));
      goToStudio();
      return;
    }
    if ((await sha256(value)) !== storedHash()) {
      showGateError("Wrong password.");
      return;
    }
    goToStudio();
  } catch (err) {
    showGateError("Could not unlock. Try again, or use 8 or more characters.");
  }
});
