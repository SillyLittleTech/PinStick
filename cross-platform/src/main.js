const pinBtn = document.getElementById("pin-btn");
const statusEl = document.getElementById("status");
const noteEl = document.getElementById("note");

const TAURI = window.__TAURI__;
const invoke = TAURI?.tauri?.invoke;

function setStatus(message) {
  statusEl.textContent = message;
}

function loadNote() {
  let saved = "";
  try {
    saved = localStorage.getItem("pinstick-note") ?? "";
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

async function togglePin() {
  if (!invoke) return;
  pinBtn.disabled = true;
  setStatus("Toggling pin…");
  try {
    const result = await invoke("toggle_pin");
    const pinned = result?.pinned ?? false;
    pinBtn.textContent = pinned ? "Unpin" : "Pin";
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
  }

  noteEl.addEventListener("input", (e) => {
    const value = e.target.value;
    saveNote(value);
    setEdited(value.length > 0);
  });

  pinBtn.addEventListener("click", togglePin);
}

document.addEventListener("DOMContentLoaded", init);
