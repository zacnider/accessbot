/**
 * AccessBot Side Panel Controller
 *
 * Manages the persistent side panel UI:
 * - Connection status and toggle
 * - Live waveform visualizer
 * - Conversation transcript
 * - Quick actions (describe, read, elements, tabs)
 * - Settings management
 * - Tab overview
 */

// ============================================================
// DOM Elements
// ============================================================

const $ = (id) => document.getElementById(id);

const logoOrb = $("logo-orb");
const statusText = $("status-text");
const statusDot = $("status-dot");
const connectionText = $("connection-text");
const visualizerLabel = $("visualizer-label");
const waveformCanvas = $("waveform-canvas");
const mainToggle = $("main-toggle");
const toggleText = $("toggle-text");
const playIcon = $("play-icon");
const stopIcon = $("stop-icon");
const transcriptArea = $("transcript-area");
const transcriptEmpty = $("transcript-empty");
const tabsPanel = $("tabs-panel");
const tabsList = $("tabs-list");
const settingsToggle = $("settings-toggle");
const settingsBody = $("settings-body");
const apiKeyInput = $("api-key");
const toggleKeyVisibility = $("toggle-key-visibility");
const speechRate = $("speech-rate");
const speechRateValue = $("speech-rate-value");
const soundEffects = $("sound-effects");
const autoDescribe = $("auto-describe");
const verbosity = $("verbosity");
const language = $("language");

// ============================================================
// Waveform Visualizer
// ============================================================

const ctx = waveformCanvas.getContext("2d");
let waveformData = new Array(60).fill(0);
let waveformAnimId = null;
let visualizerMode = "idle"; // idle, listening, speaking

function drawWaveform() {
  const w = waveformCanvas.width;
  const h = waveformCanvas.height;
  ctx.clearRect(0, 0, w, h);

  const barCount = waveformData.length;
  const barWidth = w / barCount;
  const centerY = h / 2;

  for (let i = 0; i < barCount; i++) {
    const amplitude = waveformData[i];
    const barHeight = Math.max(2, amplitude * (h * 0.4));

    let color;
    if (visualizerMode === "listening") {
      color = `rgba(100, 181, 246, ${0.4 + amplitude * 0.6})`;
    } else if (visualizerMode === "speaking") {
      color = `rgba(78, 205, 196, ${0.4 + amplitude * 0.6})`;
    } else {
      color = `rgba(136, 136, 168, ${0.2 + amplitude * 0.3})`;
    }

    ctx.fillStyle = color;
    ctx.fillRect(
      i * barWidth + 1,
      centerY - barHeight / 2,
      barWidth - 2,
      barHeight
    );
  }

  waveformAnimId = requestAnimationFrame(drawWaveform);
}

function updateWaveform(mode) {
  visualizerMode = mode;
  if (mode === "idle") {
    // Gentle idle animation
    waveformData = waveformData.map(() => Math.random() * 0.05 + 0.02);
    visualizerLabel.textContent = "Idle";
  } else if (mode === "listening") {
    visualizerLabel.textContent = "Listening...";
  } else if (mode === "speaking") {
    visualizerLabel.textContent = "Speaking...";
  }
}

function simulateWaveformActivity() {
  if (visualizerMode === "idle") {
    waveformData = waveformData.map((v) => {
      const target = Math.random() * 0.06 + 0.01;
      return v + (target - v) * 0.1;
    });
  } else if (visualizerMode === "listening") {
    waveformData = waveformData.map(() => Math.random() * 0.5 + 0.05);
  } else if (visualizerMode === "speaking") {
    waveformData = waveformData.map(() => Math.random() * 0.7 + 0.1);
  }
}

// Start waveform animation
drawWaveform();
setInterval(simulateWaveformActivity, 80);

// ============================================================
// Initialization
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await chrome.storage.local.get([
    "apiKey",
    "speechRate",
    "soundEffects",
    "autoDescribe",
    "verbosity",
    "language",
  ]);

  apiKeyInput.value = settings.apiKey || "";
  speechRate.value = settings.speechRate || 1.0;
  speechRateValue.textContent = `${parseFloat(speechRate.value).toFixed(1)}x`;
  soundEffects.checked = settings.soundEffects !== false;
  autoDescribe.checked = settings.autoDescribe !== false;
  if (settings.verbosity) verbosity.value = settings.verbosity;
  if (settings.language) language.value = settings.language;

  updateStatus();
});

// ============================================================
// Main Toggle
// ============================================================

mainToggle.addEventListener("click", async () => {
  mainToggle.disabled = true;
  try {
    const status = await chrome.runtime.sendMessage({ type: "popup_get_status" });
    if (!status.isActive) {
      const permResult = await navigator.permissions.query({ name: "microphone" });
      if (permResult.state !== "granted") {
        chrome.tabs.create({ url: chrome.runtime.getURL("permissions/permissions.html") });
        mainToggle.disabled = false;
        return;
      }
    }
    const response = await chrome.runtime.sendMessage({ type: "popup_toggle" });
    updateUI(response.isActive, response.isConnected);
  } catch (e) {
    console.error("[SidePanel] Toggle error:", e);
  }
  mainToggle.disabled = false;
});

// ============================================================
// Quick Actions
// ============================================================

$("btn-describe").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "sidepanel_action", action: "describe_page" });
});

$("btn-read").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "sidepanel_action", action: "read_page" });
});

$("btn-elements").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "sidepanel_action", action: "list_elements" });
});

$("btn-tabs").addEventListener("click", async () => {
  if (tabsPanel.classList.contains("hidden")) {
    await loadTabs();
    tabsPanel.classList.remove("hidden");
  } else {
    tabsPanel.classList.add("hidden");
  }
});

$("close-tabs").addEventListener("click", () => {
  tabsPanel.classList.add("hidden");
});

// ============================================================
// Tab Management
// ============================================================

async function loadTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    tabsList.innerHTML = "";

    tabs.forEach((tab, i) => {
      const item = document.createElement("div");
      item.className = `tab-item${tab.active ? " active" : ""}`;
      item.innerHTML = `
        <span class="tab-index">${i + 1}</span>
        <span class="tab-title" title="${escapeHtml(tab.title || '')}">${escapeHtml(tab.title || "Untitled")}</span>
        <button class="tab-close" data-tab-id="${tab.id}" title="Close tab">&times;</button>
      `;

      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("tab-close")) return;
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
        loadTabs(); // Refresh
      });

      const closeBtn = item.querySelector(".tab-close");
      closeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await chrome.tabs.remove(tab.id);
        loadTabs();
      });

      tabsList.appendChild(item);
    });
  } catch (e) {
    console.error("[SidePanel] Tab load error:", e);
  }
}

// ============================================================
// Settings
// ============================================================

settingsToggle.addEventListener("click", () => {
  settingsBody.classList.toggle("hidden");
  settingsToggle.classList.toggle("open");
});

apiKeyInput.addEventListener("change", () => {
  chrome.storage.local.set({ apiKey: apiKeyInput.value.trim() });
});

toggleKeyVisibility.addEventListener("click", () => {
  if (apiKeyInput.type === "password") {
    apiKeyInput.type = "text";
  } else {
    apiKeyInput.type = "password";
  }
});

speechRate.addEventListener("input", () => {
  const rate = parseFloat(speechRate.value);
  speechRateValue.textContent = `${rate.toFixed(1)}x`;
  chrome.storage.local.set({ speechRate: rate });
  chrome.runtime.sendMessage({ type: "setting_changed", setting: "speechRate", value: rate });
});

soundEffects.addEventListener("change", () => {
  chrome.storage.local.set({ soundEffects: soundEffects.checked });
  chrome.runtime.sendMessage({ type: "setting_changed", setting: "soundEffects", value: soundEffects.checked });
});

autoDescribe.addEventListener("change", () => {
  chrome.storage.local.set({ autoDescribe: autoDescribe.checked });
  chrome.runtime.sendMessage({ type: "setting_changed", setting: "autoDescribe", value: autoDescribe.checked });
});

verbosity.addEventListener("change", () => {
  chrome.storage.local.set({ verbosity: verbosity.value });
  chrome.runtime.sendMessage({ type: "setting_changed", setting: "verbosity", value: verbosity.value });
});

language.addEventListener("change", () => {
  chrome.storage.local.set({ language: language.value });
  chrome.runtime.sendMessage({ type: "setting_changed", setting: "language", value: language.value });
});

// ============================================================
// Status Updates
// ============================================================

async function updateStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ type: "popup_get_status" });
    updateUI(status.isActive, status.isConnected);
  } catch (e) {
    updateUI(false, false);
  }
}

function updateUI(isActive, isConnected) {
  if (isActive) {
    mainToggle.classList.add("active");
    playIcon.classList.add("hidden");
    stopIcon.classList.remove("hidden");
    toggleText.textContent = "Stop AccessBot";
    logoOrb.classList.add("active");
    statusText.textContent = "Active";

    if (isConnected) {
      statusDot.className = "status-dot connected";
      connectionText.textContent = "Connected";
      updateWaveform("listening");
    } else {
      statusDot.className = "status-dot connecting";
      connectionText.textContent = "Connecting...";
      updateWaveform("idle");
    }
  } else {
    mainToggle.classList.remove("active");
    playIcon.classList.remove("hidden");
    stopIcon.classList.add("hidden");
    toggleText.textContent = "Start AccessBot";
    logoOrb.classList.remove("active");
    statusText.textContent = "Ready";
    statusDot.className = "status-dot";
    connectionText.textContent = "Offline";
    updateWaveform("idle");
    visualizerLabel.textContent = "Press Start to begin";
  }
}

// Poll status
setInterval(updateStatus, 2000);

// ============================================================
// Transcript
// ============================================================

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "transcript") {
    addTranscriptMessage(message.role, message.text);

    // Update waveform mode
    if (message.role === "user") {
      updateWaveform("listening");
    } else {
      updateWaveform("speaking");
      // Reset to listening after a moment
      setTimeout(() => {
        if (visualizerMode === "speaking") updateWaveform("listening");
      }, 2000);
    }
  }

  if (message.type === "status_update") {
    updateUI(message.isActive, message.isConnected);
  }

  if (message.type === "setting_update") {
    // Settings changed from voice command
    if (message.setting === "speechRate") {
      speechRate.value = message.value;
      speechRateValue.textContent = `${parseFloat(message.value).toFixed(1)}x`;
    } else if (message.setting === "soundEffects") {
      soundEffects.checked = message.value;
    } else if (message.setting === "autoDescribe") {
      autoDescribe.checked = message.value;
    } else if (message.setting === "verbosity") {
      verbosity.value = message.value;
    } else if (message.setting === "language") {
      language.value = message.value;
    }
  }
});

function addTranscriptMessage(role, text) {
  if (transcriptEmpty) {
    transcriptEmpty.remove();
  }

  const msg = document.createElement("div");
  msg.className = `transcript-msg ${role === "user" ? "user" : "model"}`;

  const roleLabel = document.createElement("div");
  roleLabel.className = "msg-role";
  roleLabel.textContent = role === "user" ? "You" : "AccessBot";

  const textDiv = document.createElement("div");
  textDiv.textContent = text;

  msg.appendChild(roleLabel);
  msg.appendChild(textDiv);
  transcriptArea.appendChild(msg);

  transcriptArea.scrollTop = transcriptArea.scrollHeight;
}

// ============================================================
// Utilities
// ============================================================

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
