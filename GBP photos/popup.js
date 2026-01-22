const scanButton = document.getElementById("scanPhotos");
const selectAllButton = document.getElementById("selectAll");
const clearButton = document.getElementById("clearAll");
const downloadButton = document.getElementById("downloadSelected");
const formatSelect = document.getElementById("formatSelect");
const statusText = document.getElementById("status");
const photoGrid = document.getElementById("photoGrid");
const profileNameText = document.getElementById("profileName");

let currentProfileName = "";
let currentUrls = [];

scanButton.addEventListener("click", handleScan);
selectAllButton.addEventListener("click", () => toggleAll(true));
clearButton.addEventListener("click", () => toggleAll(false));
downloadButton.addEventListener("click", handleDownload);
photoGrid.addEventListener("change", (event) => {
  if (event.target.classList.contains("photo-check")) {
    syncCardSelection(event.target);
    updateDownloadState();
  }
});
photoGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".photo-card");
  if (!card || event.target.classList.contains("photo-check")) {
    return;
  }
  const checkbox = card.querySelector(".photo-check");
  if (!checkbox) {
    return;
  }
  checkbox.checked = !checkbox.checked;
  syncCardSelection(checkbox);
  updateDownloadState();
});

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function setBusy(isBusy) {
  scanButton.disabled = isBusy;
  selectAllButton.disabled = isBusy;
  clearButton.disabled = isBusy;
  downloadButton.disabled = isBusy || getSelectedUrls().length === 0;
  formatSelect.disabled = isBusy;
}

async function handleScan() {
  setBusy(true);
  setStatus("Scanning page...");
  profileNameText.textContent = "";
  renderPhotos([]);

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      throw new Error("No active tab found.");
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeGBPPhotos,
    });

    const result = results && results[0] ? results[0].result : null;
    if (!result) {
      throw new Error("No response from page.");
    }
    if (result.error) {
      setStatus(result.error, true);
      return;
    }

    currentProfileName = result.profileName || "";
    currentUrls = result.imageUrls || [];

    if (currentProfileName) {
      profileNameText.textContent = `Profile: ${currentProfileName}`;
    }

    renderPhotos(
      currentUrls,
      currentUrls.length === 0 ? "No images found." : null
    );
    if (currentUrls.length === 0) {
      setStatus("No images found on this page.", true);
    } else {
      setStatus(`Loaded ${currentUrls.length} photos.`);
    }
  } catch (error) {
    setStatus(`Scan failed: ${error.message}`, true);
  } finally {
    setBusy(false);
    updateDownloadState();
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function renderPhotos(urls, emptyMessage = "No photos loaded yet.") {
  photoGrid.innerHTML = "";
  photoGrid.classList.toggle("empty", urls.length === 0);

  if (urls.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    photoGrid.appendChild(empty);
    return;
  }

  urls.forEach((url, index) => {
    const card = document.createElement("div");
    card.className = "photo-card";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "photo-check";
    checkbox.dataset.url = url;

    const img = document.createElement("img");
    img.src = getPreviewUrl(url);
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
    syncCardSelection(box);
  });
  updateDownloadState();
}

function syncCardSelection(checkbox) {
  const card = checkbox.closest(".photo-card");
  if (!card) {
    return;
  }
  card.classList.toggle("selected", checkbox.checked);
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
  const folderName = sanitizeFolderName(
    currentProfileName || "GBP Photos"
  );
  setBusy(true);

  let success = 0;
  let failed = 0;
  for (let i = 0; i < selectedUrls.length; i += 1) {
    const url = selectedUrls[i];
    setStatus(`Downloading ${i + 1} of ${selectedUrls.length}...`);
    try {
      await downloadImage(url, i + 1, format, folderName);
      success += 1;
    } catch (error) {
      failed += 1;
      console.warn("Download failed", error);
    }
  }

  if (failed > 0) {
    setStatus(`Done. Downloaded: ${success}, Failed: ${failed}`, true);
  } else {
    setStatus(`Done. Downloaded: ${success}.`);
  }
  setBusy(false);
}

function getPreviewUrl(baseUrl) {
  return `${baseUrl}=s200`;
}

function sanitizeFolderName(name) {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "GBP Photos";
  }
  return cleaned.slice(0, 80);
}

async function downloadImage(baseUrl, index, format, folderName) {
  const fullUrl = `${baseUrl}=s0`;
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const sourceBlob = await fetchBlob(fullUrl);
      if (sourceBlob.size < 1000) {
        throw new Error("Blob too small");
      }
      const outputBlob = await convertBlob(sourceBlob, format);
      const extension = format === "jpeg" ? "jpg" : format;
      const filename = `${folderName}/gbp-image-${String(index).padStart(
        3,
        "0"
      )}.${extension}`;
      const blobUrl = URL.createObjectURL(outputBlob);

      await chrome.downloads.download({
        url: blobUrl,
        filename,
        saveAs: false,
      });

      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      await sleep(1000);
      return;
    } catch (error) {
      lastError = error;
      await sleep(1500);
    }
  }

  throw lastError || new Error("Download failed.");
}

async function fetchBlob(url) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Image request failed (${response.status})`);
  }
  return response.blob();
}

async function convertBlob(blob, format) {
  const mimeType = format === "jpeg" ? "image/jpeg" : `image/${format}`;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeGBPPhotos() {
  const container = document.querySelector('div.HHuGCe[jsname="Iu0eZe"]');
  if (!container) {
    return { error: "Container not found. Open the Photos tab first." };
  }

  let prev = 0;
  let same = 0;
  while (same < 5) {
    container.scrollTop = container.scrollHeight;
    await new Promise((resolve) => setTimeout(resolve, 800));
    const curr = container.querySelectorAll("img").length;
    if (curr === prev) {
      same += 1;
    } else {
      same = 0;
      prev = curr;
    }
  }
  container.scrollTop = 0;

  const imgs = Array.from(container.querySelectorAll("img"))
    .map((img) => img.src)
    .filter((src) => /lh3\.googleusercontent\.com\//.test(src));
  const unique = Array.from(new Set(imgs.map((url) => url.split("=")[0]))).filter(
    Boolean
  );

  const profileName =
    document.querySelector("h2.jFiX9e")?.textContent?.trim() || "";

  return {
    profileName,
    imageUrls: unique,
  };
}
