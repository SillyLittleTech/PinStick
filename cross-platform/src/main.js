const pinBtn = document.getElementById("pin-btn");
const statusEl = document.getElementById("status");
const noteEl = document.getElementById("note");
const mediaPreviewEl = document.getElementById("media-preview");

const IMAGE_EXTENSIONS = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?.*)?(#.*)?$/i;
const VIDEO_EXTENSIONS = /\.(m4v|mov|mp4|ogg|ogv|webm)(\?.*)?(#.*)?$/i;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;
const TRAILING_PUNCTUATION_PATTERN = /[),.!?;:]+$/;

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
      mediaItems.push({ url, type });
    }
    match = MARKDOWN_IMAGE_PATTERN.exec(noteText);
  }

  match = URL_PATTERN.exec(noteText);
  while (match) {
    const url = normalizeUrl(match[0]);
    const type = classifyMediaUrl(url);
    if (type && !seen.has(url)) {
      seen.add(url);
      mediaItems.push({ url, type });
    }
    match = URL_PATTERN.exec(noteText);
  }

  return mediaItems;
}

function createMediaCard(mediaItem) {
  const cardEl = document.createElement("article");
  cardEl.className = "media-card";

  const labelEl = document.createElement("p");
  labelEl.className = "media-card-label";
  labelEl.textContent = mediaItem.type === "image" ? "Image" : "Video";

  const urlEl = document.createElement("p");
  urlEl.className = "media-card-url";
  urlEl.textContent = mediaItem.url;

  const errorEl = document.createElement("p");
  errorEl.className = "media-error";
  errorEl.textContent =
    mediaItem.type === "image"
      ? "Unable to load this image."
      : "Unable to load this video.";

  const mediaEl = document.createElement(mediaItem.type === "image" ? "img" : "video");
  mediaEl.src = mediaItem.url;
  mediaEl.referrerPolicy = "no-referrer";

  if (mediaItem.type === "image") {
    mediaEl.alt = "Embedded image preview";
    mediaEl.loading = "lazy";
  } else {
    mediaEl.controls = true;
    mediaEl.preload = "metadata";
    mediaEl.playsInline = true;
  }

  mediaEl.addEventListener(
    "error",
    () => {
      if (!cardEl.contains(errorEl)) {
        cardEl.appendChild(errorEl);
      }
    },
    { once: true },
  );

  cardEl.appendChild(labelEl);
  cardEl.appendChild(mediaEl);
  cardEl.appendChild(urlEl);
  return cardEl;
}

function renderMediaPreview(noteText) {
  if (!mediaPreviewEl) {
    return;
  }

  mediaPreviewEl.textContent = "";

  const mediaItems = collectMediaUrls(noteText);
  if (mediaItems.length === 0) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "media-empty";
    emptyEl.textContent = "Paste image or video links in your note to preview them here.";
    mediaPreviewEl.appendChild(emptyEl);
    return;
  }

  const fragment = document.createDocumentFragment();
  mediaItems.forEach((mediaItem) => {
    fragment.appendChild(createMediaCard(mediaItem));
  });
  mediaPreviewEl.appendChild(fragment);
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
  renderMediaPreview(saved);
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
    TAURI.app.getVersion()
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
    setEdited(value.length > 0);
    renderMediaPreview(value);
  });

  pinBtn.addEventListener("click", togglePin);
}

document.addEventListener("DOMContentLoaded", init);
