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

function showCloseDialog() {
  return new Promise((resolve) => {
    const overlay = document.getElementById("close-dialog");
    const yeaBtn = document.getElementById("dialog-yea");
    const nahBtn = document.getElementById("dialog-nah");
    overlay.hidden = false;
    yeaBtn.focus();

    function cleanup(value) {
      overlay.hidden = true;
      yeaBtn.removeEventListener("click", onConfirm);
      nahBtn.removeEventListener("click", onCancel);
      resolve(value);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }

    yeaBtn.addEventListener("click", onConfirm);
    nahBtn.addEventListener("click", onCancel);
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
  // Unlisten before calling appWindow.close() so the handler never blocks its
  // own close call — avoids permanent lock-out if close() re-fires the event.
  if (TAURI && TAURI.window && TAURI.window.appWindow) {
    let unlistenClose;
    TAURI.window.appWindow.onCloseRequested(async (event) => {
      const hasData = noteEl.value.length > 0;
      if (!hasData) return; // nothing saved; close immediately

      event.preventDefault();
      try {
        const isOkay = await showCloseDialog();
        if (!isOkay) {
          localStorage.removeItem("pinstick-note");
        }
      } catch (err) {
        console.error("Close handler error:", err);
      } finally {
        if (unlistenClose) unlistenClose();
        TAURI.window.appWindow.close();
      }
    }).then((fn) => { unlistenClose = fn; });
  }
}

document.addEventListener("DOMContentLoaded", init);
