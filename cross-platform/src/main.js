const pinBtn = document.getElementById("pin-btn");
const statusEl = document.getElementById("status");
const noteEl = document.getElementById("note");

const TAURI = window.__TAURI__;
const invoke = TAURI && TAURI.tauri ? TAURI.tauri.invoke : null;

function setStatus(message) {
  statusEl.textContent = message;
}

function loadNote() {
  let saved = "";
  try {
    const stored = localStorage.getItem("pinstick-note");
    saved = stored === null ? "" : stored;
  } catch (err) {
    console.warn("Unable to read saved note:", err);
    setStatus("Failed to load note; starting empty");
  }
  noteEl.value = saved;
  setEdited(saved.length > 0);
}

function setEdited(isEdited) {
  document.title = isEdited ? "PinStick • Edited" : "PinStick";
  setStatus(isEdited ? "Edited" : "Ready");
}

function saveNote(value) {
  localStorage.setItem("pinstick-note", value);
}

let isCloseDialogOpen = false;

function showCloseDialog() {
  isCloseDialogOpen = true;

  return new Promise((resolve) => {
    const overlay = document.getElementById("close-dialog");
    const yeaBtn = document.getElementById("dialog-yea");
    const nahBtn = document.getElementById("dialog-nah");
    const focusable = [yeaBtn, nahBtn];
    const previousFocus = document.activeElement;

    // Hide background content from assistive technologies while dialog is open
    document.querySelector("header").setAttribute("aria-hidden", "true");
    document.querySelector("main").setAttribute("aria-hidden", "true");

    overlay.hidden = false;
    yeaBtn.focus();

    function cleanup(value) {
      overlay.hidden = true;
      document.querySelector("header").removeAttribute("aria-hidden");
      document.querySelector("main").removeAttribute("aria-hidden");
      yeaBtn.removeEventListener("click", onConfirm);
      nahBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("keydown", onKeyDown);
      isCloseDialogOpen = false;
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
      resolve(value);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }

    function onKeyDown(e) {
      if (e.key === "Escape") { cleanup(true); return; } // Escape = keep data (safe default; window closes either way)
      if (e.key !== "Tab") return;
      e.preventDefault();
      const current = document.activeElement;
      const idx = focusable.indexOf(current);
      const base = idx === -1 ? 0 : idx;
      const next = e.shiftKey
        ? focusable[(base - 1 + focusable.length) % focusable.length]
        : focusable[(base + 1) % focusable.length];
      next.focus();
    }

    yeaBtn.addEventListener("click", onConfirm);
    nahBtn.addEventListener("click", onCancel);
    overlay.addEventListener("keydown", onKeyDown);
  });
}

async function togglePin() {
  if (!invoke) return;
  pinBtn.disabled = true;
  setStatus("Toggling pin…");
  try {
    const result = await invoke("toggle_pin");
    const pinned =
      result && Object.prototype.hasOwnProperty.call(result, "pinned")
        ? result.pinned
        : false;
    pinBtn.classList.toggle("pinned", pinned);
    pinBtn.title = pinned ? "Unpin window" : "Pin window";
    pinBtn.setAttribute("aria-label", pinned ? "Unpin window" : "Pin window");
    setStatus(pinned ? "Pinned on top" : "Not pinned");
  } catch (err) {
    console.error(err);
    setStatus("Failed to toggle pin");
  } finally {
    pinBtn.disabled = false;
  }
}

function init() {
  loadNote();
  if (!invoke) {
    pinBtn.disabled = true;
    setStatus("Tauri API unavailable");
  } else if (TAURI && TAURI.app) {
    // Briefly show the app version so users can verify which build is running
    TAURI.app.getVersion().then((version) => {
      const previous = statusEl.textContent;
      setStatus(`v${version}`);
      setTimeout(() => setStatus(previous), 2000);
    }).catch(() => { /* non-critical */ });
  }

  noteEl.addEventListener("input", (e) => {
    const value = e.target.value;
    saveNote(value);
    setEdited(value.length > 0);
  });

  pinBtn.addEventListener("click", togglePin);

  // Prompt the user about their saved notes when they close the window.
  // Always call event.preventDefault() so we fully control when the window
  // closes; use closeApproved so our own appWindow.close() call is never
  // re-intercepted, avoiding the unlisten race condition.
  if (TAURI && TAURI.window && TAURI.window.appWindow) {
    let shouldBypassClosePrompt = false;

    TAURI.window.appWindow.onCloseRequested(async (event) => {
      if (shouldBypassClosePrompt) return;

      const hasData = noteEl.value.length > 0;
      if (!hasData) return;

      event.preventDefault();
      if (isCloseDialogOpen) return;

      try {
        const keepData = await showCloseDialog();
        if (!keepData) {
          try { localStorage.removeItem("pinstick-note"); } catch (e) { console.warn("Failed to clear saved note:", e); }
          noteEl.value = "";
          setEdited(false);
        }

        shouldBypassClosePrompt = true;
        await TAURI.window.appWindow.close();
      } catch (err) {
        shouldBypassClosePrompt = false;
        console.error("Close handler error:", err);
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
