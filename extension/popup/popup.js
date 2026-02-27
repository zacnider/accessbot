/**
 * AccessBot Popup UI Controller
 */

const toggleBtn = document.getElementById("toggle-btn");
const toggleIcon = document.getElementById("toggle-icon");
const toggleText = document.getElementById("toggle-text");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const transcriptArea = document.getElementById("transcript-area");
const transcriptPlaceholder = document.getElementById("transcript-placeholder");
const backendUrlInput = document.getElementById("backend-url");
const speechRateInput = document.getElementById("speech-rate");
const speechRateValue = document.getElementById("speech-rate-value");

// ============================================================
// Initialization
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  // Load saved settings
  const settings = await chrome.storage.local.get([
    "backendUrl",
    "isActive",
    "speechRate",
  ]);

  backendUrlInput.value = settings.backendUrl || "ws://localhost:8080/ws";
  speechRateInput.value = settings.speechRate || 1.0;
  speechRateValue.textContent = `${speechRateInput.value}x`;

  // Get current status from service worker
  updateStatus();
});

// ============================================================
// Toggle Button
// ============================================================

toggleBtn.addEventListener("click", async () => {
  toggleBtn.disabled = true;
  try {
    const status = await chrome.runtime.sendMessage({ type: "popup_get_status" });
    if (!status.isActive) {
      // Check if mic permission already granted
      const permResult = await navigator.permissions.query({ name: "microphone" });
      if (permResult.state !== "granted") {
        // Open permissions page in a new tab (popup can't show permission dialog)
        chrome.tabs.create({ url: chrome.runtime.getURL("permissions/permissions.html") });
        toggleBtn.disabled = false;
        return;
      }
    }
    const response = await chrome.runtime.sendMessage({ type: "popup_toggle" });
    updateUI(response.isActive);
  } catch (e) {
    console.error("Toggle failed:", e);
    // Fallback: open permissions page
    const status2 = await chrome.runtime.sendMessage({ type: "popup_get_status" });
    if (!status2.isActive) {
      chrome.tabs.create({ url: chrome.runtime.getURL("permissions/permissions.html") });
    }
  }
  toggleBtn.disabled = false;
});

// ============================================================
// Settings
// ============================================================

backendUrlInput.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "popup_update_url",
    url: backendUrlInput.value,
  });
});

speechRateInput.addEventListener("input", () => {
  const rate = parseFloat(speechRateInput.value);
  speechRateValue.textContent = `${rate.toFixed(1)}x`;
  chrome.storage.local.set({ speechRate: rate });
});

// ============================================================
// Status Updates
// ============================================================

async function updateStatus() {
  try {
    const status = await chrome.runtime.sendMessage({
      type: "popup_get_status",
    });
    updateUI(status.isActive, status.isConnected);
  } catch (e) {
    updateUI(false, false);
  }
}

function updateUI(isActive, isConnected) {
  if (isActive) {
    toggleBtn.classList.add("active");
    toggleIcon.textContent = "\u23F9"; // Stop icon
    toggleText.textContent = "Stop AccessBot";

    if (isConnected) {
      statusDot.className = "status-dot connected";
      statusText.textContent = "Connected";
    } else {
      statusDot.className = "status-dot active";
      statusText.textContent = "Connecting...";
    }
  } else {
    toggleBtn.classList.remove("active");
    toggleIcon.textContent = "\u25B6"; // Play icon
    toggleText.textContent = "Start AccessBot";
    statusDot.className = "status-dot";
    statusText.textContent = "Disconnected";
  }
}

// ============================================================
// Transcript Display
// ============================================================

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "transcript") {
    addTranscriptLine(message.role, message.text);
  }
});

function addTranscriptLine(role, text) {
  if (transcriptPlaceholder) {
    transcriptPlaceholder.remove();
  }

  const line = document.createElement("div");
  line.className = `transcript-line ${role}`;

  const roleSpan = document.createElement("span");
  roleSpan.className = "role";
  roleSpan.textContent = role === "user" ? "You:" : "Bot:";

  const textSpan = document.createElement("span");
  textSpan.textContent = text;

  line.appendChild(roleSpan);
  line.appendChild(textSpan);
  transcriptArea.appendChild(line);

  // Auto-scroll to bottom
  transcriptArea.scrollTop = transcriptArea.scrollHeight;
}

// Poll status periodically while popup is open
setInterval(updateStatus, 2000);
