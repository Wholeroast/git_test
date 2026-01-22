const profileUrlInput = document.getElementById("profileUrl");
const fetchButton = document.getElementById("fetchPhotos");
const selectAllButton = document.getElementById("selectAll");
const clearButton = document.getElementById("clearAll");
const downloadButton = document.getElementById("downloadSelected");
const formatSelect = document.getElementById("formatSelect");
const statusText = document.getElementById("status");
const photoGrid = document.getElementById("photoGrid");

const IMG_URL_REGEX = /https:\/\/lh\d\.googleusercontent\.com\/[^\s"'<>\\]+/g;

fetchButton.addEventListener("click", handleFetch);
selectAllButton.addEventListener("click", () => toggleAll(true));
clearButton.addEventListener("click", () => toggleAll(false));
downloadButton.addEventListener("click", handleDownload);
photoGrid.addEventListener("change", (event) => {
  if (event.target.classList.contains("photo-check")) {
    updateDownloadState();
  }
});

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function setBusy(isBusy) {
  fetchButton.disabled = isBusy;
  selectAllButton.disabled = isBusy;
  clearButton.disabled = isBusy;
  downloadButton.disabled = isBusy || getSelectedUrls().length === 0;
  profileUrlInput.disabled = isBusy;
  formatSelect.disabled = isBusy;
}

async function handleFetch() {
  const url = profileUrlInput.value.trim();
  if (!url) {
    setStatus("Enter a Google Business Profile link.", true);
    return;
  }

  setBusy(true);
  setStatus("Fetching page...");
  photoGrid.innerHTML = "";

  try {
    const html = await fetchPage(url);
    const urls = extractImageUrls(html);
    renderPhotos(urls);
    if (urls.length === 0) {
      setStatus(
        "No photos found. Try opening the Photos tab and copy that URL.",
        true
      );
    } else {
      setStatus(`Found ${urls.length} photos.`);
    }
  } catch (error) {
    setStatus(`Failed to fetch photos: ${error.message}`, true);
  } finally {
    setBusy(false);
    updateDownloadState();
  }
}

async function fetchPage(url) {
  const response = await fetch(url, {
    redirect: "follow",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.text();
}

function extractImageUrls(html) {
  const normalized = html.replace(/\\\//g, "/");
  const matches = normalized.match(IMG_URL_REGEX) || [];
  const urls = matches.map((match) => ensureS0(decodeEscapes(match)));
  const unique = Array.from(new Set(urls.filter(Boolean)));
  return unique;
}

function decodeEscapes(value) {
  return value
    .replace(/\\\\u003d/g, "=")
    .replace(/\\u003d/g, "=")
    .replace(/\\\\u0026/g, "&")
    .replace(/\\u0026/g, "&")
    .replace(/\\\\u003f/g, "?")
    .replace(/\\u003f/g, "?");
}

function ensureS0(url) {
  if (!url) {
    return "";
  }
  let fixed = url;
  if (!fixed.includes("googleusercontent.com")) {
    return fixed;
  }
  fixed = fixed.replace(/\/s\d+(-[a-z]+)?\//g, "/s0/");
  fixed = fixed.replace(/=([swh]\d+[^&]*)$/, "=s0");
  if (!/=s0$/.test(fixed) && !/=[swh]\d/.test(fixed)) {
    fixed += "=s0";
  }
  return fixed;
}

function renderPhotos(urls) {
  photoGrid.innerHTML = "";
  urls.forEach((url, index) => {
    const card = document.createElement("div");
    card.className = "photo-card";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "photo-check";
    checkbox.dataset.url = url;

    const img = document.createElement("img");
    img.src = url;
    img.alt = `Photo ${index + 1}`;

    const badge = document.createElement("span");
    badge.className = "photo-index";
    badge.textContent = String(index + 1);

    card.appendChild(checkbox);
    card.appendChild(img);
    card.appendChild(badge);
    photoGrid.appendChild(card);
  });
}

function toggleAll(checked) {
  const checkboxes = photoGrid.querySelectorAll(".photo-check");
  checkboxes.forEach((box) => {
    box.checked = checked;
  });
  updateDownloadState();
}

function getSelectedUrls() {
  return Array.from(photoGrid.querySelectorAll(".photo-check"))
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.dataset.url);
}

function updateDownloadState() {
  downloadButton.disabled = getSelectedUrls().length === 0;
}

async function handleDownload() {
  const selectedUrls = getSelectedUrls();
  if (selectedUrls.length === 0) {
    setStatus("Select at least one photo to download.", true);
    return;
  }

  const format = formatSelect.value;
  setBusy(true);

  try {
    for (let i = 0; i < selectedUrls.length; i += 1) {
      const url = selectedUrls[i];
      setStatus(`Downloading ${i + 1} of ${selectedUrls.length}...`);
      await downloadImage(url, i + 1, format);
    }
    setStatus(`Downloaded ${selectedUrls.length} photos.`);
  } catch (error) {
    setStatus(`Download failed: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function downloadImage(url, index, format) {
  const s0Url = ensureS0(url);
  const sourceBlob = await fetchBlob(s0Url);
  const outputBlob = await convertBlob(sourceBlob, format);
  const extension = format.toLowerCase();
  const filename = buildFilename(s0Url, index, extension);
  const blobUrl = URL.createObjectURL(outputBlob);

  await chrome.downloads.download({
    url: blobUrl,
    filename,
    saveAs: false,
  });

  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

async function fetchBlob(url) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Image request failed (${response.status})`);
  }
  return response.blob();
}

async function convertBlob(blob, format) {
  const mimeType = format === "jpg" ? "image/jpeg" : `image/${format}`;
  const image = await decodeImage(blob);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);

  if (image.close) {
    image.close();
  } else if (image.src && image.src.startsWith("blob:")) {
    URL.revokeObjectURL(image.src);
  }

  const output = await new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, 0.92);
  });

  if (!output) {
    throw new Error("Failed to encode image.");
  }
  return output;
}

async function decodeImage(blob) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed."));
    const objectUrl = URL.createObjectURL(blob);
    img.src = objectUrl;
  });
}

function buildFilename(url, index, extension) {
  let base = `photo-${String(index).padStart(3, "0")}`;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const candidate = parts[parts.length - 1];
    if (candidate && candidate.length < 64) {
      base = candidate;
    }
  } catch (error) {
    base = `photo-${String(index).padStart(3, "0")}`;
  }
  base = base.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
  if (!base) {
    base = `photo-${String(index).padStart(3, "0")}`;
  }
  return `gbp-photos/${base}.${extension}`;
}
