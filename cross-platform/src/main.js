const pinBtn = document.getElementById("pin-btn");
const overlayBtn = document.getElementById("overlay-btn");
const headerControlsEl = document.getElementById("header-controls");
const overlayOpacitySliderEl = document.getElementById("overlay-opacity-slider");
const overlayOpacityValueEl = document.getElementById("overlay-opacity-value");
const overlayNoticeEl = document.getElementById("overlay-notice");
const statusEl = document.getElementById("status");
const noteEl = document.getElementById("note");
const noteSurfaceEl = document.getElementById("note-surface");
const mediaStageEl = document.getElementById("media-stage");
const mediaFileInputEl = document.getElementById("media-file-input");

const NOTE_STORAGE_KEY = "pinstick-note";
const LOCAL_MEDIA_STORAGE_KEY = "pinstick-local-media";
const OVERLAY_OPACITY_STORAGE_KEY = "pinstick-overlay-opacity";

const OVERLAY_POLL_MS = 60;
const OVERLAY_POLL_FAIL_MAX = 3;
const DEFAULT_OVERLAY_OPACITY = 0.7;

let overlayActive = false;
let overlayPollId = null;
let overlayOpacity = DEFAULT_OVERLAY_OPACITY;
let overlayClickThroughAvailable = true;
let overlayPollFailures = 0;

const IMAGE_EXTENSIONS = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?.*)?(#.*)?$/i;
const VIDEO_EXTENSIONS = /\.(m4v|mov|mp4|ogg|ogv|webm)(\?.*)?(#.*)?$/i;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;
const TRAILING_PUNCTUATION_PATTERN = /[),.!?;:]+$/;
const LOCAL_IMAGE_MIME = /^image\//i;
const LOCAL_VIDEO_MIME = /^video\//i;

const TAURI = window.__TAURI__;
const invoke = TAURI && TAURI.tauri ? TAURI.tauri.invoke : null;

function setStatus(message) {
  statusEl.textContent = message;
}

function normalizeUrl(rawUrl) {
  return rawUrl.replace(TRAILING_PUNCTUATION_PATTERN, "");
}

function classifyMediaUrl(url) {
  if (IMAGE_EXTENSIONS.test(url)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.test(url)) {
    return "video";
  }
  return null;
}

function classifyLocalFile(file) {
  if (LOCAL_IMAGE_MIME.test(file.type)) {
    return "image";
  }
  if (LOCAL_VIDEO_MIME.test(file.type)) {
    return "video";
  }
  const name = file.name.toLowerCase();
  if (IMAGE_EXTENSIONS.test(name)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.test(name)) {
    return "video";
  }
  return null;
}

function collectMediaUrls(noteText) {
  const seen = new Set();
  const mediaItems = [];

  MARKDOWN_IMAGE_PATTERN.lastIndex = 0;
  URL_PATTERN.lastIndex = 0;

  let match = MARKDOWN_IMAGE_PATTERN.exec(noteText);
  while (match) {
    const url = normalizeUrl(match[1]);
    const type = classifyMediaUrl(url);
    if (type && !seen.has(url)) {
      seen.add(url);
      mediaItems.push({ source: "remote", url, type });
    }
    match = MARKDOWN_IMAGE_PATTERN.exec(noteText);
  }

  match = URL_PATTERN.exec(noteText);
  while (match) {
    const url = normalizeUrl(match[0]);
    const type = classifyMediaUrl(url);
    if (type && !seen.has(url)) {
      seen.add(url);
      mediaItems.push({ source: "remote", url, type });
    }
    match = URL_PATTERN.exec(noteText);
  }

  return mediaItems;
}

function loadLocalMedia() {
  try {
    const raw = localStorage.getItem(LOCAL_MEDIA_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      (parsed.type === "image" || parsed.type === "video") &&
      typeof parsed.dataUrl === "string"
    ) {
      return { source: "local", type: parsed.type, dataUrl: parsed.dataUrl };
    }
  } catch (err) {
    console.warn("Unable to read local media:", err);
  }
  return null;
}

function saveLocalMedia(mediaItem) {
  // Large videos may exceed localStorage quota; IndexedDB would be a future improvement.
  localStorage.setItem(
    LOCAL_MEDIA_STORAGE_KEY,
    JSON.stringify({ type: mediaItem.type, dataUrl: mediaItem.dataUrl }),
  );
}

function clearLocalMedia() {
  localStorage.removeItem(LOCAL_MEDIA_STORAGE_KEY);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeUrlFromNote(noteText, url) {
  let updated = noteText;
  const markdownPattern = new RegExp(
    `!\\[[^\\]]*]\\(${escapeRegExp(url)}\\)\\s*`,
    "g",
  );
  updated = updated.replace(markdownPattern, "");
  updated = updated.split(url).join("");
  return updated.replace(/\n{3,}/g, "\n\n").trim();
}

function hasActiveMedia(noteText) {
  if (loadLocalMedia()) {
    return true;
  }
  return collectMediaUrls(noteText).length > 0;
}

function updateEditedState(noteText) {
  const edited = noteText.trim().length > 0 || hasActiveMedia(noteText);
  document.title = edited ? "PinStick • Edited" : "PinStick";
  setStatus(edited ? "Edited" : "Ready");
}

function saveNote(value) {
  localStorage.setItem(NOTE_STORAGE_KEY, value);
}

function createMediaEmbed(mediaItem) {
  const embedEl = document.createElement("article");
  embedEl.className = "media-embed";
  embedEl.title = "Double-click to remove";

  const src = mediaItem.source === "local" ? mediaItem.dataUrl : mediaItem.url;
  const errorEl = document.createElement("p");
  errorEl.className = "media-error";
  errorEl.hidden = true;
  errorEl.textContent =
    mediaItem.type === "image"
      ? "Unable to load this image."
      : "Unable to load this video.";

  const mediaEl = document.createElement(mediaItem.type === "image" ? "img" : "video");
  mediaEl.src = src;
  if (mediaItem.source === "remote") {
    mediaEl.referrerPolicy = "no-referrer";
  }

  if (mediaItem.type === "image") {
    mediaEl.alt = "Embedded image";
    mediaEl.loading = "lazy";
  } else {
    mediaEl.controls = true;
    mediaEl.preload = "metadata";
    mediaEl.playsInline = true;
  }

  mediaEl.addEventListener(
    "error",
    () => {
      errorEl.hidden = false;
    },
    { once: true },
  );

  embedEl.addEventListener("dblclick", (event) => {
    event.preventDefault();
    if (mediaItem.source === "local") {
      clearLocalMedia();
    } else {
      const updated = removeUrlFromNote(noteEl.value, mediaItem.url);
      noteEl.value = updated;
      saveNote(updated);
    }
    syncNoteView(noteEl.value);
  });

  embedEl.appendChild(mediaEl);
  embedEl.appendChild(errorEl);
  return embedEl;
}

function syncNoteView(noteText) {
  if (!noteSurfaceEl || !mediaStageEl) {
    return;
  }

  const remoteItems = collectMediaUrls(noteText);
  const localItem = loadLocalMedia();
  const mediaItems = localItem ? [localItem, ...remoteItems] : remoteItems;
  const inMediaMode = mediaItems.length > 0;

  noteSurfaceEl.classList.toggle("media-mode", inMediaMode);
  mediaStageEl.hidden = !inMediaMode;
  mediaStageEl.textContent = "";

  if (inMediaMode) {
    const fragment = document.createDocumentFragment();
    mediaItems.forEach((item) => {
      fragment.appendChild(createMediaEmbed(item));
    });
    mediaStageEl.appendChild(fragment);
  }

  updateEditedState(noteText);
}

function loadNote() {
  let saved = "";
  try {
    const stored = localStorage.getItem(NOTE_STORAGE_KEY);
    saved = stored === null ? "" : stored;
  } catch (err) {
    console.warn("Unable to read saved note:", err);
    setStatus("Failed to load note; starting empty");
  }
  noteEl.value = saved;
  syncNoteView(saved);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function handleLocalFileSelected(file) {
  const type = classifyLocalFile(file);
  if (!type) {
    setStatus("Unsupported file type");
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    saveLocalMedia({ type, dataUrl });
    syncNoteView(noteEl.value);
    setStatus("Media added");
  } catch (err) {
    console.error(err);
    setStatus("Failed to load file");
  }
}

function openMediaFilePicker() {
  if (!mediaFileInputEl) {
    return;
  }
  mediaFileInputEl.value = "";
  mediaFileInputEl.click();
}

function loadOverlayOpacity() {
  try {
    const stored = localStorage.getItem(OVERLAY_OPACITY_STORAGE_KEY);
    if (stored !== null) {
      const parsed = Number.parseFloat(stored);
      if (!Number.isNaN(parsed)) {
        overlayOpacity = Math.min(1, Math.max(0.4, parsed));
      }
    }
  } catch (err) {
    console.warn("Unable to read overlay opacity:", err);
  }
  applyOverlayOpacityCss(overlayOpacity);
  syncOverlayOpacityUi();
}

function saveOverlayOpacity(value) {
  overlayOpacity = Math.min(1, Math.max(0.4, value));
  localStorage.setItem(OVERLAY_OPACITY_STORAGE_KEY, String(overlayOpacity));
  applyOverlayOpacityCss(overlayOpacity);
}

function applyOverlayOpacityCss(value) {
  document.documentElement.style.setProperty("--overlay-opacity", String(value));
}

function opacityToSliderPercent(opacity) {
  return Math.round(opacity * 100);
}

function sliderPercentToOpacity(percent) {
  return Math.min(1, Math.max(0.4, percent / 100));
}

function syncOverlayOpacityUi() {
  if (!overlayOpacitySliderEl) {
    return;
  }
  const percent = opacityToSliderPercent(overlayOpacity);
  overlayOpacitySliderEl.value = String(percent);
  if (overlayOpacityValueEl) {
    overlayOpacityValueEl.textContent = `${percent}%`;
  }
}

function showOverlayNotice(message) {
  if (!overlayNoticeEl || !message) {
    return;
  }
  overlayNoticeEl.textContent = message;
  overlayNoticeEl.hidden = false;
}

function hideOverlayNotice() {
  if (overlayNoticeEl) {
    overlayNoticeEl.hidden = true;
    overlayNoticeEl.textContent = "";
  }
}

function setOverlayUi(enabled) {
  overlayActive = enabled;
  document.body.classList.toggle("overlay-mode", enabled);
  if (overlayBtn) {
    overlayBtn.classList.toggle("overlay-active", enabled);
    overlayBtn.title = enabled ? "Exit overlay mode" : "Overlay mode";
    overlayBtn.setAttribute("aria-label", enabled ? "Exit overlay mode" : "Overlay mode");
  }
  if (pinBtn) {
    pinBtn.disabled = enabled;
  }
  if (noteEl) {
    noteEl.disabled = enabled;
  }
  if (!enabled) {
    hideOverlayNotice();
    overlayPollFailures = 0;
  }
  syncOverlayOpacityUi();
}

function isPointInRect(cursorX, cursorY, rect) {
  return (
    cursorX >= rect.left &&
    cursorX <= rect.right &&
    cursorY >= rect.top &&
    cursorY <= rect.bottom
  );
}

function isCursorOverInteractiveControls(cursorX, cursorY) {
  if (headerControlsEl) {
    const headerRect = headerControlsEl.getBoundingClientRect();
    if (isPointInRect(cursorX, cursorY, headerRect)) {
      return true;
    }
  }
  return false;
}

async function handleOverlayPollFailure(err) {
  overlayPollFailures += 1;
  console.warn("Overlay click-through sync failed:", err);
  if (overlayPollFailures >= OVERLAY_POLL_FAIL_MAX) {
    stopOverlayPoll();
    if (invoke) {
      try {
        await invoke("set_ignore_cursor_events", { ignore: false });
      } catch (innerErr) {
        console.warn("Failed to restore cursor events:", innerErr);
      }
    }
    showOverlayNotice(
      "Overlay click-through is limited. Use the toolbar to exit or change opacity.",
    );
  }
}

async function syncOverlayClickThrough() {
  if (!invoke || !overlayActive || !overlayClickThroughAvailable) {
    return;
  }
  try {
    const [x, y] = await invoke("get_cursor_position");
    const overControl = isCursorOverInteractiveControls(x, y);
    await invoke("set_ignore_cursor_events", { ignore: !overControl });
    overlayPollFailures = 0;
  } catch (err) {
    await handleOverlayPollFailure(err);
  }
}

function startOverlayPoll() {
  stopOverlayPoll();
  overlayPollId = window.setInterval(syncOverlayClickThrough, OVERLAY_POLL_MS);
}

function stopOverlayPoll() {
  if (overlayPollId !== null) {
    window.clearInterval(overlayPollId);
    overlayPollId = null;
  }
}

async function applyOverlayOpacity(value) {
  saveOverlayOpacity(value);
  syncOverlayOpacityUi();
  if (!invoke || !overlayActive) {
    return;
  }
  try {
    await invoke("set_overlay_opacity", { opacity: overlayOpacity });
  } catch (err) {
    console.error(err);
    setStatus("Failed to set overlay opacity");
  }
}

async function loadOverlayAvailability() {
  if (!invoke) {
    overlayClickThroughAvailable = false;
    return;
  }
  try {
    const availability = await invoke("check_overlay_input_available");
    overlayClickThroughAvailable = Boolean(
      availability && availability.click_through,
    );
    if (availability && availability.message) {
      showOverlayNotice(availability.message);
    }
  } catch (err) {
    console.warn("Unable to check overlay availability:", err);
    overlayClickThroughAvailable = true;
  }
}

async function toggleOverlay() {
  if (!invoke) {
    return;
  }
  const togglingOn = !overlayActive;
  if (togglingOn) {
    overlayBtn.disabled = true;
  }
  setStatus("Toggling overlay…");
  try {
    if (togglingOn) {
      await loadOverlayAvailability();
    }
    await invoke("set_overlay_opacity", { opacity: overlayOpacity });
    const result = await invoke("toggle_overlay");
    const enabled = Boolean(result && result.enabled);
    if (result && typeof result.opacity === "number") {
      saveOverlayOpacity(result.opacity);
    }
    setOverlayUi(enabled);
    if (enabled) {
      await invoke("set_ignore_cursor_events", { ignore: false });
      await invoke("set_overlay_opacity", { opacity: overlayOpacity });
      overlayPollFailures = 0;
      if (overlayClickThroughAvailable) {
        hideOverlayNotice();
        startOverlayPoll();
      } else if (invoke) {
        await invoke("set_ignore_cursor_events", { ignore: false });
      }
      setStatus("Overlay on");
    } else {
      stopOverlayPoll();
      await invoke("set_ignore_cursor_events", { ignore: false });
      setStatus("Overlay off");
    }
  } catch (err) {
    console.error(err);
    setStatus("Failed to toggle overlay");
  } finally {
    if (togglingOn) {
      overlayBtn.disabled = false;
    }
  }
}

async function togglePin() {
  if (!invoke) return;
  if (overlayActive) {
    setStatus("Disable overlay before pinning");
    return;
  }
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
  loadOverlayOpacity();
  if (!invoke) {
    pinBtn.disabled = true;
    if (overlayBtn) {
      overlayBtn.disabled = true;
    }
    setStatus("Tauri API unavailable");
  } else if (TAURI && TAURI.app) {
    TAURI.app
      .getVersion()
      .then((version) => {
        const previous = statusEl.textContent;
        setStatus(`v${version}`);
        setTimeout(() => setStatus(previous), 2000);
      })
      .catch(() => {
        /* non-critical */
      });
  }

  noteEl.addEventListener("input", (e) => {
    const value = e.target.value;
    saveNote(value);
    syncNoteView(value);
  });

  noteEl.addEventListener("dblclick", () => {
    if (noteEl.value.trim() !== "" || hasActiveMedia(noteEl.value)) {
      return;
    }
    openMediaFilePicker();
  });

  if (mediaFileInputEl) {
    mediaFileInputEl.addEventListener("change", () => {
      const file = mediaFileInputEl.files && mediaFileInputEl.files[0];
      if (file) {
        handleLocalFileSelected(file);
      }
    });
  }

  pinBtn.addEventListener("click", togglePin);

  if (overlayBtn) {
    overlayBtn.addEventListener("click", toggleOverlay);
  }

  if (overlayOpacitySliderEl) {
    overlayOpacitySliderEl.addEventListener("input", () => {
      const percent = Number.parseInt(overlayOpacitySliderEl.value, 10);
      if (Number.isNaN(percent)) {
        return;
      }
      applyOverlayOpacity(sliderPercentToOpacity(percent));
      if (overlayActive) {
        syncOverlayClickThrough();
      }
    });
    overlayOpacitySliderEl.addEventListener("pointerdown", async () => {
      if (!invoke || !overlayActive) {
        return;
      }
      try {
        await invoke("set_ignore_cursor_events", { ignore: false });
      } catch (err) {
        console.warn("Failed to enable slider interaction:", err);
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
