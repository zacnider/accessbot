/**
 * AccessBot Service Worker
 *
 * Central coordinator for the Chrome extension. Manages:
 * - WebSocket connection to backend
 * - Screenshot capture loop
 * - Audio routing between offscreen document and backend
 * - Action dispatch to content scripts
 * - Keyboard shortcut handling
 */

importScripts("utils/websocket-manager.js");

const wsManager = new WebSocketManager();

let isActive = false;
let screenshotInterval = null;
let currentTabId = null;
let offscreenReady = false;

// Backend URL - will be updated to Cloud Run URL after deployment
const BACKEND_URL = "wss://accessbot-198414680119.us-central1.run.app/ws";

// ============================================================
// Initialization
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isActive: false,
    speechRate: 1.0,
    language: "auto",
    soundEffects: true,
    autoDescribe: true,
    verbosity: "normal",
  });
  console.log("[AccessBot] Extension installed");
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.error("[AccessBot] Failed to open side panel:", e);
  }
});

// ============================================================
// Keyboard Shortcuts
// ============================================================

chrome.commands.onCommand.addListener(async (command) => {
  console.log("[AccessBot] Command:", command);
  if (command === "toggle-accessbot") {
    await toggleAccessBot();
  } else if (command === "describe-page") {
    if (isActive) {
      await requestPageDescription();
    }
  }
});

// ============================================================
// Toggle AccessBot On/Off
// ============================================================

async function toggleAccessBot() {
  if (isActive) {
    await deactivate();
  } else {
    await activate();
  }
}

async function activate() {
  console.log("[AccessBot] Activating...");

  // Check if API key is set
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey || !apiKey.trim()) {
    console.error("[AccessBot] No API key set");
    broadcastToPopup({
      type: "transcript",
      role: "model",
      text: "Please enter your Gemini API key in Settings first.",
    });
    return;
  }

  // Set up message handlers (only once)
  setupMessageHandlers();

  // Create offscreen document for audio FIRST
  try {
    await ensureOffscreenDocument();
    console.log("[AccessBot] Offscreen document ready");
  } catch (e) {
    console.error("[AccessBot] Failed to create offscreen document:", e);
  }

  // Get current tab
  await refreshCurrentTab();

  isActive = true;
  await chrome.storage.local.set({ isActive: true });

  // Connect to backend
  wsManager.connect(BACKEND_URL);

  // Update icon to indicate active state
  chrome.action.setBadgeText({ text: "ON" });
  chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });

  console.log("[AccessBot] Activated");
}

async function deactivate() {
  console.log("[AccessBot] Deactivating...");

  // Stop screenshot capture
  stopScreenshotLoop();

  // Stop audio recording
  try {
    await chrome.runtime.sendMessage({ type: "stop_recording" });
  } catch (e) {
    // Offscreen document may not exist
  }
  try {
    await chrome.runtime.sendMessage({ type: "stop_playback" });
  } catch (e) {
    // Ignore
  }

  // Disconnect WebSocket
  wsManager.disconnect();

  isActive = false;
  await chrome.storage.local.set({ isActive: false });

  chrome.action.setBadgeText({ text: "" });

  console.log("[AccessBot] Deactivated");
}

// ============================================================
// Tab Management
// ============================================================

/**
 * Always get the REAL current active tab. This prevents stale tab ID issues.
 */
async function refreshCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentTabId = tab.id;
      return tab;
    }
  } catch (e) {
    console.error("[AccessBot] Failed to get current tab:", e);
  }
  return null;
}

/**
 * Wait for a tab to finish loading after navigation.
 * Returns a promise that resolves when tab status is "complete".
 */
function waitForTabLoad(tabId, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(); // Resolve even on timeout
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ============================================================
// WebSocket Message Handlers
// ============================================================

let handlersSetup = false;

function setupMessageHandlers() {
  if (handlersSetup) return;
  handlersSetup = true;

  // Connection status
  wsManager.on("connection", async (data) => {
    if (data.connected) {
      console.log("[AccessBot] Connected to backend, sending auth...");

      // Send API key as first message (auth handshake)
      const { apiKey } = await chrome.storage.local.get("apiKey");
      if (!apiKey) {
        console.error("[AccessBot] No API key available for auth");
        wsManager.disconnect();
        return;
      }
      wsManager.sendJSON({ type: "auth", api_key: apiKey });
      console.log("[AccessBot] Auth message sent");

      playSoundEffect("connected");
      // Start audio recording and screenshot capture after auth
      await startAudioRecording();
      startScreenshotLoop();
    } else {
      console.log("[AccessBot] Disconnected from backend");
      playSoundEffect("disconnected");
      stopScreenshotLoop();
    }
  });

  // Session info
  wsManager.on("session_info", (data) => {
    console.log("[AccessBot] Session:", data.session_id);
  });

  // Error from backend (e.g., invalid API key)
  wsManager.on("error", (data) => {
    console.error("[AccessBot] Backend error:", data.message);
    broadcastToPopup({
      type: "transcript",
      role: "model",
      text: data.message || "Connection error. Please check your API key.",
    });
    playSoundEffect("error");
  });

  // Audio from backend (Gemini voice response) - already base64
  let audioFromBackend = 0;
  wsManager.on("audio", async (data) => {
    audioFromBackend++;
    if (audioFromBackend % 50 === 1) {
      console.log(`[AccessBot] Audio from backend #${audioFromBackend}, data length: ${data.data?.length || 0}`);
    }
    try {
      await chrome.runtime.sendMessage({
        type: "play_audio",
        data: data.data, // base64 string
      });
    } catch (e) {
      console.error("[AccessBot] Audio playback error:", e);
    }
  });

  // Action commands from Gemini (click, scroll, type, etc.)
  wsManager.on("action", async (data) => {
    console.log("[AccessBot] Action received:", JSON.stringify(data.action));
    const actionType = data.action?.action || data.action?.type || "";

    // Play sound for the action
    const soundMap = {
      click: "click", click_element: "click",
      scroll: "scroll", scroll_page: "scroll",
      type: "type", type_text: "type",
      navigate: "navigate", navigate_to: "navigate",
      go_back: "navigate",
      switch_tab: "tab", close_tab: "tab", new_tab: "tab",
    };
    if (soundMap[actionType]) playSoundEffect(soundMap[actionType]);

    // Update widget to "processing" while action runs
    updateWidgetInTab("processing", "Running action...");

    let result;
    try {
      result = await executeActionInTab(data.action);
    } catch (err) {
      result = { success: false, error: err.message || "Unknown error" };
    }
    console.log("[AccessBot] Action result:", JSON.stringify(result));

    // Audio + visual feedback based on result
    if (result.success) {
      updateWidgetInTab("idle", `Done: ${actionType}`);
    } else {
      playSoundEffect("error");
      updateWidgetInTab("error", `Failed: ${result.error || actionType}`);
      // Reset widget after 3 seconds
      setTimeout(() => updateWidgetInTab("idle"), 3000);
    }

    // Send result back to backend (which forwards to Gemini)
    wsManager.sendActionResult(data.id, result);

    // Capture fresh screenshot immediately so AI sees the result
    setTimeout(() => captureAndSendScreenshot(), 200);

    // For clicks/navigation: check if URL changed after a delay
    // This catches clicks that trigger page navigation
    if (["click", "click_element", "press_key"].includes(actionType)) {
      const urlBefore = result.pageUrl || "";
      setTimeout(async () => {
        try {
          const tab = await refreshCurrentTab();
          if (tab && tab.url && tab.url !== urlBefore && urlBefore) {
            // Page navigated! Send updated context to backend
            wsManager.sendActionResult(data.id + "_nav", {
              success: true,
              pageChanged: true,
              previousUrl: urlBefore,
              newUrl: tab.url,
              newTitle: tab.title || "",
            });
            // Take another screenshot of the new page
            setTimeout(() => captureAndSendScreenshot(), 500);
          }
        } catch (e) { /* ignore */ }
      }, 1500);
    }
  });

  // Transcription (for debug / UI display)
  wsManager.on("transcript", (data) => {
    console.log(`[Transcript ${data.role}] ${data.text}`);
    broadcastToPopup({ type: "transcript", ...data });

    // Update floating widget status
    const status = data.role === "user" ? "listening" : "speaking";
    const tooltip = data.role === "user" ? `You: ${data.text}` : `AccessBot: ${data.text}`;
    updateWidgetInTab(status, tooltip.substring(0, 80));
  });

  // Interruption handling
  wsManager.on("interrupted", async () => {
    console.log("[AccessBot] Interrupted - stopping playback");
    try {
      await chrome.runtime.sendMessage({ type: "stop_playback" });
    } catch (e) {
      // Ignore
    }
    updateWidgetInTab("listening");
  });

  wsManager.on("turn_complete", () => {
    console.log("[AccessBot] Turn complete");
    updateWidgetInTab("idle");
  });
}

// ============================================================
// Screenshot Capture
// ============================================================

function startScreenshotLoop() {
  stopScreenshotLoop();
  screenshotInterval = setInterval(captureAndSendScreenshot, 500); // 2 FPS
  // Also send one immediately
  captureAndSendScreenshot();
}

function stopScreenshotLoop() {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
}

async function captureAndSendScreenshot() {
  if (!isActive || !wsManager.isConnected) return;

  try {
    // Refresh tab to make sure we have the right one
    const tab = await refreshCurrentTab();
    if (!tab) return;

    // Skip chrome:// and other non-capturable pages
    const url = tab.url || "";
    if (url.startsWith("chrome://") || url.startsWith("edge://") ||
        url.startsWith("about:") || url.startsWith("chrome-extension://") ||
        url === "") {
      return;
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: "jpeg",
      quality: 70,
    });
    // Strip the data URL prefix (data:image/jpeg;base64,)
    const base64Data = dataUrl.split(",")[1];
    wsManager.sendScreenshot(base64Data);
  } catch (e) {
    // Suppress common non-actionable errors
    const msg = e.message || "";
    if (msg.includes("Cannot access") ||
        msg.includes("No active") ||
        msg.includes("activeTab") ||
        msg.includes("No tab") ||
        msg.includes("Tabs cannot be edited") ||
        msg.includes("No window")) {
      // These are expected for chrome:// pages, during navigation, etc.
      return;
    }
    console.error("[AccessBot] Screenshot error:", msg);
  }
}

// ============================================================
// Audio Recording
// ============================================================

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (contexts.length === 0) {
    console.log("[AccessBot] Creating offscreen document...");
    await chrome.offscreen.createDocument({
      url: "offscreen/offscreen.html",
      reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
      justification: "Audio capture and playback for AccessBot voice interaction",
    });
    // Wait for the offscreen document to load
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log("[AccessBot] Offscreen document created");
  } else {
    console.log("[AccessBot] Offscreen document already exists");
  }
}

async function startAudioRecording() {
  try {
    await ensureOffscreenDocument();
    console.log("[AccessBot] Sending start_recording to offscreen...");
    const response = await chrome.runtime.sendMessage({ type: "start_recording" });
    console.log("[AccessBot] start_recording response:", response);
  } catch (e) {
    console.error("[AccessBot] Failed to start recording:", e);
  }
}

// ============================================================
// Action Execution in Content Script
// ============================================================

async function executeActionInTab(action) {
  // Always refresh the current tab before executing actions
  const tab = await refreshCurrentTab();
  const tabId = currentTabId;

  if (!tabId || !tab) {
    return { success: false, error: "No active tab" };
  }

  const actionType = action.action || action.type;
  console.log(`[AccessBot] Executing action "${actionType}" on tab ${tabId} (${tab.url})`);

  // --- Handle navigation directly in service worker ---
  // These don't need content script and work on any page (including chrome://)
  if (actionType === "navigate" || actionType === "navigate_to") {
    const url = action.url;
    if (!url) return { success: false, error: "No URL provided" };
    try {
      await chrome.tabs.update(tabId, { url: url });
      console.log("[AccessBot] Navigated to:", url);

      // Wait for the page to load before returning
      await waitForTabLoad(tabId, 10000);
      console.log("[AccessBot] Page loaded after navigation");

      // Capture a fresh screenshot after navigation
      setTimeout(() => captureAndSendScreenshot(), 500);

      return { success: true, url: url };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  if (actionType === "go_back") {
    try {
      await chrome.tabs.goBack(tabId);

      // Wait for the page to load
      await waitForTabLoad(tabId, 10000);
      console.log("[AccessBot] Page loaded after going back");

      setTimeout(() => captureAndSendScreenshot(), 500);

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // --- Tab management actions (handled in service worker) ---
  if (actionType === "list_tabs") {
    return await handleListTabs();
  }

  if (actionType === "switch_tab") {
    return await handleSwitchTab(action.tab_index);
  }

  if (actionType === "close_tab") {
    return await handleCloseTab(action.tab_index);
  }

  if (actionType === "new_tab") {
    return await handleNewTab(action.url);
  }

  if (actionType === "zoom") {
    return await handleZoom(action.direction);
  }

  // --- Voice-controlled settings (handled in service worker) ---
  if (actionType === "change_setting") {
    return await handleVoiceSettingChange(action.setting, action.value);
  }

  // --- For all other actions, ensure content script is injected ---
  try {
    await ensureContentScript(tabId);
  } catch (e) {
    console.error("[AccessBot] Cannot inject content script:", e.message);
    return { success: false, error: "Cannot interact with this page: " + e.message };
  }

  // Send action to content script
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "execute_action",
      action: action,
    });
    return response || { success: false, error: "No response from content script" };
  } catch (e) {
    // Content script might not be ready, try injecting and retrying
    console.warn("[AccessBot] Content script message failed, retrying:", e.message);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content-script.js"],
      });
      // Wait a moment for script to load
      await new Promise((r) => setTimeout(r, 300));
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "execute_action",
        action: action,
      });
      return response || { success: false, error: "No response after retry" };
    } catch (retryErr) {
      return { success: false, error: retryErr.message };
    }
  }
}

async function ensureContentScript(tabId) {
  // Check if the tab URL is injectable
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (e) {
    // Tab doesn't exist anymore, refresh
    const freshTab = await refreshCurrentTab();
    if (!freshTab) throw new Error("No valid tab available");
    tabId = currentTabId;
    tab = freshTab;
  }

  const url = tab.url || "";

  // chrome:// and edge:// and about: pages cannot have content scripts
  if (url.startsWith("chrome://") || url.startsWith("edge://") ||
      url.startsWith("about:") || url.startsWith("chrome-extension://")) {
    throw new Error("Cannot inject into " + url.split("/")[0] + " pages");
  }

  // Wait if the tab is still loading
  if (tab.status === "loading") {
    console.log("[AccessBot] Tab is still loading, waiting...");
    await waitForTabLoad(tabId, 5000);
    await new Promise((r) => setTimeout(r, 200));
  }

  // Try to ping the content script to see if it's already running
  try {
    await chrome.tabs.sendMessage(tabId, { type: "ping" });
    return; // Content script is already there
  } catch (e) {
    // Content script not running, inject it
    console.log("[AccessBot] Injecting content script into tab", tabId);
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content-script.js"],
    });
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function requestPageDescription() {
  await captureAndSendScreenshot();
}

// ============================================================
// Tab Tracking
// ============================================================

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  currentTabId = activeInfo.tabId;
  console.log("[AccessBot] Tab activated:", activeInfo.tabId);
  if (isActive) {
    await captureAndSendScreenshot();
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === currentTabId && isActive) {
    if (changeInfo.status === "complete") {
      console.log("[AccessBot] Tab finished loading:", tab.url);
      // Small delay to ensure page is fully rendered
      setTimeout(() => captureAndSendScreenshot(), 300);
    }
  }
});

// ============================================================
// Message routing from offscreen document and popup
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Audio data from offscreen document (base64 encoded)
  if (message.type === "audio_data" && isActive) {
    try {
      const binaryString = atob(message.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      wsManager.sendBinary(bytes.buffer);
    } catch (e) {
      console.error("[AccessBot] Audio send error:", e);
    }
    sendResponse({ ok: true });
    return true;
  }

  // Offscreen ready notification
  if (message.type === "offscreen_ready") {
    offscreenReady = true;
    console.log("[AccessBot] Offscreen document is ready");
    sendResponse({ ok: true });
    return true;
  }

  // Mic permission granted from permissions page - auto activate
  if (message.type === "mic_permission_granted") {
    console.log("[AccessBot] Mic permission granted, activating...");
    if (!isActive) {
      activate();
    }
    sendResponse({ ok: true });
    return true;
  }

  // Recording status
  if (message.type === "recording_started") {
    console.log("[AccessBot] Recording started successfully!");
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "recording_error") {
    console.error("[AccessBot] Recording error:", message.error);
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "recording_stopped") {
    console.log("[AccessBot] Recording stopped");
    sendResponse({ ok: true });
    return true;
  }

  // Popup commands
  if (message.type === "popup_toggle") {
    toggleAccessBot().then(() => sendResponse({ isActive }));
    return true;
  }

  if (message.type === "popup_get_status") {
    sendResponse({
      isActive,
      isConnected: wsManager.isConnected,
      sessionId: wsManager.sessionId,
    });
    return true;
  }

  if (message.type === "popup_update_url") {
    // Deprecated - backend URL is now hardcoded
    sendResponse({ ok: true });
    return true;
  }

  // Side panel quick actions
  if (message.type === "sidepanel_action") {
    handleSidePanelAction(message.action);
    sendResponse({ ok: true });
    return true;
  }

  // Settings changed from side panel or voice command
  if (message.type === "setting_changed") {
    handleSettingChanged(message.setting, message.value);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// ============================================================
// Tab Management Handlers
// ============================================================

async function handleListTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const tabList = tabs.map((t, i) => ({
      index: i + 1,
      id: t.id,
      title: t.title || "Untitled",
      url: t.url || "",
      active: t.active,
      pinned: t.pinned,
    }));

    const activeTab = tabs.find(t => t.active);

    return {
      success: true,
      tabs: tabList,
      totalTabs: tabs.length,
      currentTab: activeTab ? {
        index: tabs.indexOf(activeTab) + 1,
        title: activeTab.title,
        url: activeTab.url,
      } : null,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleSwitchTab(tabIndex) {
  try {
    const tabs = await chrome.tabs.query({});

    // Convert 1-based index to 0-based
    const idx = (tabIndex || 1) - 1;

    if (idx < 0 || idx >= tabs.length) {
      return {
        success: false,
        error: `Tab index ${tabIndex} out of range. There are ${tabs.length} tabs.`,
      };
    }

    const targetTab = tabs[idx];
    await chrome.tabs.update(targetTab.id, { active: true });
    // Also focus the window
    await chrome.windows.update(targetTab.windowId, { focused: true });
    currentTabId = targetTab.id;

    // Give the tab a moment to become active, then screenshot
    setTimeout(() => captureAndSendScreenshot(), 300);

    return {
      success: true,
      switchedTo: {
        index: tabIndex,
        title: targetTab.title,
        url: targetTab.url,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleCloseTab(tabIndex) {
  try {
    const tabs = await chrome.tabs.query({});
    let targetTabId;

    if (!tabIndex || tabIndex === 0) {
      // Close current tab
      targetTabId = currentTabId;
    } else {
      const idx = tabIndex - 1;
      if (idx < 0 || idx >= tabs.length) {
        return { success: false, error: `Tab index ${tabIndex} out of range` };
      }
      targetTabId = tabs[idx].id;
    }

    const closedTab = tabs.find(t => t.id === targetTabId);
    await chrome.tabs.remove(targetTabId);

    // Refresh current tab after closing
    await refreshCurrentTab();
    setTimeout(() => captureAndSendScreenshot(), 300);

    return {
      success: true,
      closedTab: closedTab ? { title: closedTab.title, url: closedTab.url } : {},
      remainingTabs: tabs.length - 1,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleNewTab(url) {
  try {
    const createOpts = {};
    if (url && url.trim()) {
      createOpts.url = url;
    }

    const newTab = await chrome.tabs.create(createOpts);
    currentTabId = newTab.id;

    if (url) {
      await waitForTabLoad(newTab.id, 10000);
    }

    setTimeout(() => captureAndSendScreenshot(), 500);

    return {
      success: true,
      newTab: {
        id: newTab.id,
        url: url || "about:blank",
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleZoom(direction) {
  try {
    const tabId = currentTabId;
    if (!tabId) return { success: false, error: "No active tab" };

    const currentZoom = await chrome.tabs.getZoom(tabId);
    let newZoom;

    switch (direction) {
      case "in":
        newZoom = Math.min(currentZoom + 0.25, 5.0);
        break;
      case "out":
        newZoom = Math.max(currentZoom - 0.25, 0.25);
        break;
      case "reset":
        newZoom = 1.0;
        break;
      default:
        return { success: false, error: `Unknown zoom direction: ${direction}` };
    }

    await chrome.tabs.setZoom(tabId, newZoom);

    return {
      success: true,
      previousZoom: Math.round(currentZoom * 100) + "%",
      newZoom: Math.round(newZoom * 100) + "%",
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================================================
// Voice-Controlled Settings Handler
// ============================================================

async function handleVoiceSettingChange(setting, value) {
  try {
    const settingMap = {
      speechRate: "speechRate",
      speech_rate: "speechRate",
      language: "language",
      sound_effects: "soundEffects",
      soundEffects: "soundEffects",
      auto_describe: "autoDescribe",
      autoDescribe: "autoDescribe",
      verbosity: "verbosity",
    };

    const storageKey = settingMap[setting] || setting;
    let finalValue = value;

    // Handle speech rate special values
    if (storageKey === "speechRate") {
      const current = (await chrome.storage.local.get("speechRate")).speechRate || 1.0;
      if (value === "faster" || value === "hızlı") {
        finalValue = Math.min(current + 0.25, 3.0);
      } else if (value === "slower" || value === "yavaş") {
        finalValue = Math.max(current - 0.25, 0.5);
      } else if (value === "normal") {
        finalValue = 1.0;
      } else {
        finalValue = parseFloat(value) || 1.0;
        finalValue = Math.max(0.5, Math.min(3.0, finalValue));
      }
    }

    // Handle boolean settings
    if (storageKey === "soundEffects" || storageKey === "autoDescribe") {
      if (value === "on" || value === "true" || value === "aç") finalValue = true;
      else if (value === "off" || value === "false" || value === "kapat") finalValue = false;
    }

    // Handle language
    if (storageKey === "language") {
      const langMap = {
        turkish: "tr", "türkçe": "tr", tr: "tr",
        english: "en", "ingilizce": "en", en: "en",
        german: "de", deutsch: "de", de: "de",
        french: "fr", "français": "fr", fr: "fr",
        spanish: "es", "español": "es", es: "es",
        arabic: "ar", ar: "ar",
        russian: "ru", ru: "ru",
        chinese: "zh", zh: "zh",
        japanese: "ja", ja: "ja",
        korean: "ko", ko: "ko",
        portuguese: "pt", pt: "pt",
        italian: "it", italiano: "it", it: "it",
        dutch: "nl", nederlands: "nl", nl: "nl",
        hindi: "hi", hi: "hi",
        auto: "auto",
      };
      finalValue = langMap[value.toLowerCase()] || value;
    }

    // Save to storage
    await chrome.storage.local.set({ [storageKey]: finalValue });

    // Notify side panel
    broadcastToPopup({ type: "setting_update", setting: storageKey, value: finalValue });

    // Play confirmation sound
    playSoundEffect("click");

    return {
      success: true,
      setting: storageKey,
      value: finalValue,
      message: `Setting ${storageKey} changed to ${finalValue}`,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================================================
// Side Panel Actions
// ============================================================

async function handleSidePanelAction(action) {
  if (!isActive) {
    console.log("[AccessBot] Side panel action ignored - not active");
    return;
  }

  if (action === "describe_page") {
    await captureAndSendScreenshot();
  } else if (action === "read_page") {
    const result = await executeActionInTab({ action: "read_page_text" });
    console.log("[AccessBot] Read page result:", result?.success);
  } else if (action === "list_elements") {
    const result = await executeActionInTab({ action: "list_interactive_elements" });
    console.log("[AccessBot] List elements result:", result?.success);
  }
}

function handleSettingChanged(setting, value) {
  console.log(`[AccessBot] Setting changed: ${setting} = ${value}`);

  // Notify content scripts if needed
  if (setting === "soundEffects") {
    broadcastToContentScripts({ type: "setting_update", setting, value });
  }

  // Notify side panel
  broadcastToPopup({ type: "setting_update", setting, value });
}

function broadcastToContentScripts(data) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, data).catch(() => {});
    });
  });
}

// ============================================================
// Sound Effects - Trigger via offscreen
// ============================================================

async function playSoundEffect(soundName) {
  const { soundEffects } = await chrome.storage.local.get("soundEffects");
  if (soundEffects === false) return;

  try {
    await chrome.runtime.sendMessage({ type: "play_sound", sound: soundName });
  } catch (e) {
    // Offscreen may not be active
  }
}

// ============================================================
// Utility
// ============================================================

function broadcastToPopup(data) {
  chrome.runtime.sendMessage(data).catch(() => {
    // Side panel / popup is not open, ignore
  });
}

/**
 * Update the floating widget status in the current tab's content script.
 */
function updateWidgetInTab(status, tooltip) {
  if (!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId, {
    type: "widget_status",
    status,
    tooltip: tooltip || "",
  }).catch(() => {});
}
