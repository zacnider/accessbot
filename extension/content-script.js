/**
 * AccessBot Content Script
 *
 * Runs in the context of web pages. Handles:
 * - Executing browser actions (click, scroll, type, navigate, key press)
 * - Form interaction (focus, select, tab navigation)
 * - Page reading and element finding
 * - Visual highlighting of active elements
 *
 * COORDINATE SYSTEM: Screenshots are captured at device pixel ratio (DPR).
 * Gemini returns coordinates in screenshot space. We must divide by DPR
 * to get viewport coordinates for elementFromPoint().
 */

// ============================================================
// AccessBot Floating Widget (Shadow DOM isolated)
// ============================================================

let accessbotWidget = null;
let widgetStatus = "idle"; // idle, listening, speaking, processing, error

function createWidget() {
  if (accessbotWidget || document.getElementById("accessbot-widget-host")) return;

  const host = document.createElement("div");
  host.id = "accessbot-widget-host";
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; bottom: 20px; right: 20px; pointer-events: auto;";

  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; }

      .widget {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: rgba(10, 10, 26, 0.9);
        border: 2px solid rgba(78, 205, 196, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
        backdrop-filter: blur(10px);
        transition: all 0.3s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(78, 205, 196, 0.15);
        user-select: none;
        -webkit-user-select: none;
      }

      .widget:hover {
        transform: scale(1.08);
        box-shadow: 0 4px 25px rgba(0, 0, 0, 0.5), 0 0 25px rgba(78, 205, 196, 0.3);
      }

      .widget.dragging { cursor: grabbing; transition: none; }

      /* Status animations */
      .widget.idle { animation: breathe 3s ease-in-out infinite; }
      .widget.listening { border-color: rgba(100, 181, 246, 0.8); }
      .widget.speaking { border-color: rgba(78, 205, 196, 0.9); }
      .widget.error { border-color: rgba(255, 107, 107, 0.8); animation: error-pulse 1s ease-in-out 3; }

      @keyframes breathe {
        0%, 100% { transform: scale(1); box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 10px rgba(78,205,196,0.1); }
        50% { transform: scale(1.04); box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 20px rgba(78,205,196,0.2); }
      }

      @keyframes error-pulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 10px rgba(255,107,107,0.2); }
        50% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 25px rgba(255,107,107,0.5); }
      }

      /* Ripple rings for listening */
      .ripple {
        position: absolute;
        inset: -8px;
        border-radius: 50%;
        border: 1.5px solid rgba(100, 181, 246, 0.4);
        opacity: 0;
        pointer-events: none;
      }
      .widget.listening .ripple { animation: ripple-expand 2s ease-out infinite; }
      .widget.listening .ripple:nth-child(2) { animation-delay: 0.6s; }
      .widget.listening .ripple:nth-child(3) { animation-delay: 1.2s; }

      @keyframes ripple-expand {
        0% { transform: scale(1); opacity: 0.6; }
        100% { transform: scale(1.8); opacity: 0; }
      }

      /* Waveform bars for speaking */
      .wave-bars {
        display: flex;
        align-items: center;
        gap: 2px;
        height: 20px;
      }
      .wave-bars .bar {
        width: 3px;
        background: rgba(78, 205, 196, 0.9);
        border-radius: 2px;
        transition: height 0.1s;
      }
      .widget.speaking .bar { animation: wave 0.8s ease-in-out infinite; }
      .widget.speaking .bar:nth-child(1) { animation-delay: 0s; }
      .widget.speaking .bar:nth-child(2) { animation-delay: 0.1s; }
      .widget.speaking .bar:nth-child(3) { animation-delay: 0.2s; }
      .widget.speaking .bar:nth-child(4) { animation-delay: 0.3s; }
      .widget.speaking .bar:nth-child(5) { animation-delay: 0.15s; }

      @keyframes wave {
        0%, 100% { height: 4px; }
        50% { height: 18px; }
      }

      /* Icon */
      .icon { color: rgba(78, 205, 196, 0.9); display: flex; }
      .widget.speaking .icon { display: none; }
      .widget.speaking .wave-bars { display: flex; }
      .widget:not(.speaking) .wave-bars { display: none; }
      .widget.listening .icon svg { color: rgba(100, 181, 246, 0.9); }
      .widget.error .icon svg { color: rgba(255, 107, 107, 0.9); }

      /* Tooltip */
      .tooltip {
        position: absolute;
        bottom: calc(100% + 8px);
        right: 0;
        background: rgba(10, 10, 26, 0.95);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 8px 12px;
        max-width: 220px;
        font-size: 12px;
        color: #c0e8e5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        opacity: 0;
        transform: translateY(4px);
        transition: all 0.2s;
        pointer-events: none;
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      .widget:hover .tooltip, .tooltip.visible {
        opacity: 1;
        transform: translateY(0);
      }
    </style>

    <div class="widget idle" id="ab-widget">
      <div class="ripple"></div>
      <div class="ripple"></div>
      <div class="ripple"></div>
      <div class="icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="10" r="3" fill="currentColor" stroke="none"/>
          <path d="M6 19c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
      </div>
      <div class="wave-bars">
        <div class="bar" style="height:4px"></div>
        <div class="bar" style="height:8px"></div>
        <div class="bar" style="height:14px"></div>
        <div class="bar" style="height:8px"></div>
        <div class="bar" style="height:4px"></div>
      </div>
      <div class="tooltip" id="ab-tooltip">AccessBot ready</div>
    </div>
  `;

  document.documentElement.appendChild(host);
  accessbotWidget = shadow;

  // Drag support
  const widget = shadow.getElementById("ab-widget");
  let isDragging = false;
  let dragStartX, dragStartY, startRight, startBottom;

  widget.addEventListener("mousedown", (e) => {
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startRight = parseInt(host.style.right);
    startBottom = parseInt(host.style.bottom);

    const onMove = (e) => {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isDragging = true;
        widget.classList.add("dragging");
        host.style.right = Math.max(0, startRight - dx) + "px";
        host.style.bottom = Math.max(0, startBottom - dy) + "px";
      }
    };

    const onUp = () => {
      widget.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (!isDragging) {
        // Click - toggle AccessBot
        chrome.runtime.sendMessage({ type: "popup_toggle" });
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function updateWidgetStatus(newStatus, tooltipText) {
  if (!accessbotWidget) return;
  const widget = accessbotWidget.getElementById("ab-widget");
  const tooltip = accessbotWidget.getElementById("ab-tooltip");
  if (!widget) return;

  widget.className = `widget ${newStatus}`;
  widgetStatus = newStatus;
  if (tooltipText && tooltip) {
    tooltip.textContent = tooltipText;
    tooltip.classList.add("visible");
    setTimeout(() => tooltip.classList.remove("visible"), 3000);
  }
}

// Initialize widget
createWidget();

// ============================================================
// Action Router
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Widget status updates from service worker
  if (message.type === "widget_status") {
    updateWidgetStatus(message.status, message.tooltip);
    sendResponse({ ok: true });
    return true;
  }

  // Settings update
  if (message.type === "setting_update") {
    // Handle settings in content script if needed
    sendResponse({ ok: true });
    return true;
  }

  // Ping check - used to verify content script is loaded
  if (message.type === "ping") {
    sendResponse({
      pong: true,
      dpr: window.devicePixelRatio || 1,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    });
    return true;
  }

  // Return viewport info
  if (message.type === "get_viewport") {
    sendResponse({
      dpr: window.devicePixelRatio || 1,
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    });
    return true;
  }

  if (message.type !== "execute_action") return false;

  const action = message.action;
  let result;

  try {
    switch (action.action || action.type) {
      case "click":
      case "click_element":
        result = handleClick(action);
        break;
      case "scroll":
      case "scroll_page":
        result = handleScroll(action);
        break;
      case "type":
      case "type_text":
        result = handleType(action);
        break;
      case "navigate":
      case "navigate_to":
        result = handleNavigate(action);
        break;
      case "go_back":
        result = handleGoBack();
        break;
      case "press_key":
        result = handlePressKey(action);
        break;
      case "focus":
      case "focus_element":
        result = handleFocus(action);
        break;
      case "select_option":
        result = handleSelectOption(action);
        break;
      case "read_page_text":
        result = handleReadPageText();
        break;
      case "tab_navigate":
        result = handleTabNavigate(action);
        break;
      case "get_page_summary":
        result = handleGetPageSummary();
        break;
      case "list_interactive_elements":
        result = handleListInteractiveElements();
        break;
      case "find_element":
        result = handleFindElement(action);
        break;
      // Advanced actions
      case "right_click":
        result = handleRightClick(action);
        break;
      case "double_click":
        result = handleDoubleClick(action);
        break;
      case "hover":
        result = handleHover(action);
        break;
      case "clipboard":
        result = handleClipboard(action);
        break;
      case "find_on_page":
        result = handleFindOnPage(action);
        break;
      case "navigate_by_type":
        result = handleNavigateByType(action);
        break;
      case "get_page_structure":
        result = handleGetPageStructure();
        break;
      case "read_selected_text":
        result = handleReadSelectedText();
        break;
      case "detect_page_type":
        result = handleDetectPageType();
        break;
      case "get_contextual_suggestions":
        result = handleGetContextualSuggestions();
        break;
      case "keyboard_shortcut":
        result = handleKeyboardShortcut(action);
        break;
      case "drag_and_drop":
        result = handleDragAndDrop(action);
        break;
      case "move_mouse":
        result = handleMoveMouse(action);
        break;
      case "scroll_to_element":
        result = handleScrollToElement(action);
        break;
      default:
        result = { success: false, error: `Unknown action: ${action.action || action.type}` };
    }
  } catch (e) {
    result = { success: false, error: e.message };
  }

  // Enrich every result with page context so AI knows current state
  if (result && typeof result === "object") {
    result.pageUrl = window.location.href;
    result.pageTitle = document.title;
  }

  sendResponse(result);
  return true;
});

// ============================================================
// Coordinate Scaling Helper
// ============================================================

/**
 * Scale screenshot coordinates to viewport coordinates.
 * Screenshots are captured at device pixel ratio, so Gemini's coordinates
 * are in screenshot space (e.g. 2x on Retina). We divide by DPR to get
 * viewport coordinates that work with elementFromPoint().
 */
function scaleCoordinates(x, y) {
  const dpr = window.devicePixelRatio || 1;
  return {
    x: Math.round(x / dpr),
    y: Math.round(y / dpr),
  };
}

// ============================================================
// Click Action - Description-First Strategy
// ============================================================

function handleClick(action) {
  const description = action.description || action.element_description || "";

  // STRATEGY 1: Try description-based click FIRST (most reliable)
  if (description) {
    const descElement = findElementByDescription(description);
    if (descElement) {
      highlightElement(descElement);
      descElement.scrollIntoView({ behavior: "smooth", block: "center" });
      simulateRealClick(descElement);
      return {
        success: true,
        element: describeElement(descElement),
        method: "description",
      };
    }
  }

  // STRATEGY 2: Click by coordinates (scaled by DPR)
  if (action.x && action.y && action.x > 0 && action.y > 0) {
    const scaled = scaleCoordinates(action.x, action.y);
    const element = document.elementFromPoint(scaled.x, scaled.y);
    if (element) {
      // If we have a description, verify the element somewhat matches
      if (description && !elementMatchesDescription(element, description)) {
        // Try nearby elements in a small radius
        const nearby = findNearbyMatchingElement(scaled.x, scaled.y, description);
        if (nearby) {
          highlightElement(nearby);
          nearby.scrollIntoView({ behavior: "smooth", block: "center" });
          simulateRealClick(nearby);
          return {
            success: true,
            element: describeElement(nearby),
            method: "nearby_search",
          };
        }
      }

      // Try to find the closest clickable ancestor (button, a, etc.)
      const clickable = element.closest("a, button, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [onclick]") || element;
      highlightElement(clickable);
      clickable.scrollIntoView({ behavior: "smooth", block: "center" });
      simulateRealClick(clickable);
      return {
        success: true,
        element: describeElement(clickable),
        method: "coordinates",
        scaledCoords: scaled,
        originalCoords: { x: action.x, y: action.y },
        dpr: window.devicePixelRatio,
      };
    }
  }

  // STRATEGY 3: If description provided but not found, try broader searches
  if (description) {
    // Try: maybe description is a URL or partial URL (user said "click google.com")
    const links = document.querySelectorAll("a[href]");
    const lowerDesc = description.toLowerCase();
    for (const link of links) {
      if (isVisible(link) && (link.href || "").toLowerCase().includes(lowerDesc)) {
        highlightElement(link);
        link.scrollIntoView({ behavior: "smooth", block: "center" });
        simulateRealClick(link);
        return {
          success: true,
          element: describeElement(link),
          method: "href_match",
        };
      }
    }

    // Try: click on any element with matching class or id
    try {
      const byId = document.getElementById(description) || document.getElementById(lowerDesc);
      if (byId && isVisible(byId)) {
        highlightElement(byId);
        byId.scrollIntoView({ behavior: "smooth", block: "center" });
        simulateRealClick(byId);
        return { success: true, element: describeElement(byId), method: "id_match" };
      }
    } catch (e) { /* skip */ }
  }

  // Build helpful error with what IS on the page
  const visibleButtons = [];
  document.querySelectorAll('a, button, [role="button"]').forEach((el) => {
    if (isVisible(el)) {
      const text = getElementText(el).trim();
      if (text && text.length < 60) visibleButtons.push(text);
    }
  });
  const nearby = visibleButtons.slice(0, 10).join(", ");

  return {
    success: false,
    error: `Element not found. Description: "${description}", Coords: (${action.x}, ${action.y}), DPR: ${window.devicePixelRatio}. Available elements: ${nearby}`,
  };
}

/**
 * Simulate a real click with proper mouse events (some sites need this).
 */
function simulateRealClick(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  const eventOpts = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
  };

  element.dispatchEvent(new MouseEvent("mousedown", eventOpts));
  element.dispatchEvent(new MouseEvent("mouseup", eventOpts));
  element.dispatchEvent(new MouseEvent("click", eventOpts));

  // Also try native click as fallback for links
  if (element.tagName.toLowerCase() === "a" && element.href) {
    element.click();
  }
}

/**
 * Check if an element roughly matches a description.
 */
function elementMatchesDescription(element, description) {
  const cleanDesc = cleanDescription(description).toLowerCase();
  const elText = getElementText(element).toLowerCase();

  if (!cleanDesc || !elText) return false;

  // Check if the element text contains the description or vice versa
  return elText.includes(cleanDesc) || cleanDesc.includes(elText);
}

/**
 * Search nearby elements in a radius around the given coordinates.
 */
function findNearbyMatchingElement(x, y, description) {
  const cleanDesc = cleanDescription(description).toLowerCase();
  const offsets = [
    [0, 0], [0, -10], [0, 10], [-10, 0], [10, 0],
    [0, -20], [0, 20], [-20, 0], [20, 0],
    [-15, -15], [15, -15], [-15, 15], [15, 15],
    [0, -30], [0, 30], [-30, 0], [30, 0],
  ];

  for (const [dx, dy] of offsets) {
    const el = document.elementFromPoint(x + dx, y + dy);
    if (el && elementMatchesDescription(el, description)) {
      return el;
    }
    // Also check parent (the actual clickable element may wrap the text)
    if (el && el.parentElement) {
      const parent = el.closest("a, button, [role='button'], [role='link'], [role='tab'], [role='menuitem']");
      if (parent && elementMatchesDescription(parent, description)) {
        return parent;
      }
    }
  }
  return null;
}

// ============================================================
// Scroll Action
// ============================================================

function handleScroll(action) {
  const direction = action.direction || "";
  let deltaX = action.deltaX || 0;
  let deltaY = action.deltaY || 0;

  // If direction is given but no deltas, calculate from direction
  if (direction && !deltaX && !deltaY) {
    const amount = action.amount || "medium";
    const pixels = { small: 150, medium: 400, large: 700, page: window.innerHeight };
    const px = pixels[amount] || 400;

    const dirMap = {
      up: { deltaX: 0, deltaY: -px },
      down: { deltaX: 0, deltaY: px },
      left: { deltaX: -px, deltaY: 0 },
      right: { deltaX: px, deltaY: 0 },
    };
    const d = dirMap[direction] || { deltaX: 0, deltaY: px };
    deltaX = d.deltaX;
    deltaY = d.deltaY;
  }

  // Use auto behavior for immediate scrolling
  window.scrollBy({
    top: deltaY,
    left: deltaX,
    behavior: "auto",
  });

  // Also try scrolling the main scrollable element if window didn't scroll
  const scrollable = findMainScrollable();
  if (scrollable && scrollable !== document.documentElement && scrollable !== document.body) {
    scrollable.scrollBy({
      top: deltaY,
      left: deltaX,
      behavior: "auto",
    });
  }

  return {
    success: true,
    scrollPosition: {
      x: Math.round(window.scrollX),
      y: Math.round(window.scrollY),
      maxY: document.documentElement.scrollHeight - window.innerHeight,
    },
  };
}

/**
 * Find the main scrollable container on the page.
 */
function findMainScrollable() {
  // Check if body or documentElement are scrollable
  if (document.documentElement.scrollHeight > document.documentElement.clientHeight) {
    return document.documentElement;
  }
  if (document.body.scrollHeight > document.body.clientHeight) {
    return document.body;
  }

  // Find the largest scrollable child
  const candidates = document.querySelectorAll("main, [role='main'], article, .content, #content, .main");
  for (const el of candidates) {
    if (el.scrollHeight > el.clientHeight) {
      return el;
    }
  }
  return document.documentElement;
}

// ============================================================
// Type Action
// ============================================================

function handleType(action) {
  let element = null;

  // Try to find the field by description
  if (action.field_description) {
    element = findInputByDescription(action.field_description);
  }

  // Try by coordinates (scaled by DPR)
  if (!element && action.x && action.y) {
    const scaled = scaleCoordinates(action.x, action.y);
    element = document.elementFromPoint(scaled.x, scaled.y);
    if (element && !isInputElement(element)) element = null;
  }

  // Fall back to currently focused element
  if (!element) {
    element = document.activeElement;
  }

  // Fall back to first visible input
  if (!element || !isInputElement(element)) {
    element = findFirstVisibleInput();
  }

  if (!element || !isInputElement(element)) {
    return { success: false, error: "No input field found" };
  }

  highlightElement(element);
  element.focus();
  // Small delay for focus to register
  element.click();

  // Strategy 1: Select all + execCommand 'insertText'
  // This triggers proper InputEvent chain and works on React, Angular,
  // Vue, Google, and all modern framework-based sites.
  let typed = false;
  try {
    if (element.select) element.select();
    else if (element.setSelectionRange) {
      element.setSelectionRange(0, (element.value || element.textContent || "").length);
    }
    typed = document.execCommand("insertText", false, action.text);
  } catch (e) { /* fall through */ }

  // Strategy 2: InputEvent dispatch char-by-char (for sites that block execCommand)
  if (!typed) {
    try {
      const proto = element.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

      // Clear existing value
      if (setter) {
        setter.call(element, "");
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // Type each character with proper events
      for (const char of action.text) {
        element.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
        const curVal = element.value || "";
        if (setter) setter.call(element, curVal + char);
        else element.value = curVal + char;
        element.dispatchEvent(new InputEvent("input", {
          data: char, inputType: "insertText", bubbles: true, composed: true,
        }));
        element.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      }
      typed = true;
    } catch (e2) { /* fall through */ }
  }

  // Strategy 3: Direct value set (last resort for simple HTML inputs)
  if (!typed) {
    element.value = action.text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  element.dispatchEvent(new Event("change", { bubbles: true }));

  return {
    success: true,
    element: describeElement(element),
    value: action.text,
  };
}

// ============================================================
// Navigate Action
// ============================================================

function handleNavigate(action) {
  if (action.url) {
    window.location.href = action.url;
    return { success: true, url: action.url };
  }
  return { success: false, error: "No URL provided" };
}

function handleGoBack() {
  window.history.back();
  return { success: true };
}

// ============================================================
// Press Key Action
// ============================================================

function handlePressKey(action) {
  const key = action.key || "Enter";
  const target = document.activeElement || document.body;

  const eventInit = {
    key: key,
    code: key,
    bubbles: true,
    cancelable: true,
  };

  // Handle modifier combos
  if (key.includes("+")) {
    const parts = key.split("+");
    eventInit.key = parts[parts.length - 1];
    eventInit.ctrlKey = parts.includes("Ctrl");
    eventInit.shiftKey = parts.includes("Shift");
    eventInit.altKey = parts.includes("Alt");
    eventInit.metaKey = parts.includes("Meta");
  }

  target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  target.dispatchEvent(new KeyboardEvent("keypress", eventInit));
  target.dispatchEvent(new KeyboardEvent("keyup", eventInit));

  // Special handling for Enter on forms
  if (key === "Enter" && target.form) {
    target.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  return {
    success: true,
    key: key,
    target: describeElement(target),
  };
}

// ============================================================
// Focus Action
// ============================================================

function handleFocus(action) {
  let element = null;
  const description = action.description || action.element_description || "";

  // Try description first
  if (description) {
    element = findElementByDescription(description) ||
              findInputByDescription(description);
  }

  // Then try coordinates (scaled)
  if (!element && action.x && action.y && action.x > 0 && action.y > 0) {
    const scaled = scaleCoordinates(action.x, action.y);
    element = document.elementFromPoint(scaled.x, scaled.y);
  }

  if (!element) {
    return { success: false, error: "Element not found to focus" };
  }

  highlightElement(element);
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.focus();

  return {
    success: true,
    element: describeElement(element),
  };
}

// ============================================================
// Select Option Action
// ============================================================

function handleSelectOption(action) {
  let selectEl = null;

  // Find the select element
  if (action.field_description) {
    selectEl = findInputByDescription(action.field_description);
  }

  // Fall back to focused element
  if (!selectEl) {
    selectEl = document.activeElement;
  }

  // Fall back to first visible select
  if (!selectEl || selectEl.tagName.toLowerCase() !== "select") {
    const selects = document.querySelectorAll("select");
    for (const sel of selects) {
      if (isVisible(sel)) {
        selectEl = sel;
        break;
      }
    }
  }

  if (!selectEl || selectEl.tagName.toLowerCase() !== "select") {
    return { success: false, error: "No dropdown found" };
  }

  // Find the matching option
  const optionText = (action.option_text || "").toLowerCase();
  let matched = false;
  for (const opt of selectEl.options) {
    if (opt.text.toLowerCase().includes(optionText) ||
        opt.value.toLowerCase().includes(optionText)) {
      selectEl.value = opt.value;
      matched = true;
      break;
    }
  }

  if (!matched) {
    return {
      success: false,
      error: `Option "${action.option_text}" not found`,
      available: Array.from(selectEl.options).map(o => o.text).slice(0, 10),
    };
  }

  selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  highlightElement(selectEl);

  return {
    success: true,
    element: describeElement(selectEl),
    selectedOption: action.option_text,
  };
}

// ============================================================
// Read Page Text
// ============================================================

function handleReadPageText() {
  const main =
    document.querySelector("main") ||
    document.querySelector('[role="main"]') ||
    document.querySelector("article") ||
    document.body;

  // Get visible text, skip hidden elements
  const walker = document.createTreeWalker(
    main,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || !isVisible(parent)) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (["script", "style", "noscript"].includes(tag)) return NodeFilter.FILTER_REJECT;
        if (node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let text = "";
  let node;
  while ((node = walker.nextNode()) && text.length < 3000) {
    text += node.textContent.trim() + " ";
  }

  return {
    success: true,
    title: document.title,
    url: window.location.href,
    text: text.trim().substring(0, 3000),
  };
}

// ============================================================
// Tab Navigation
// ============================================================

function handleTabNavigate(action) {
  const direction = action.direction || "next";

  // Manual focus movement
  const focusable = Array.from(document.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), textarea, select, [tabindex]:not([tabindex="-1"])'
  )).filter(isVisible);

  const currentIndex = focusable.indexOf(document.activeElement);
  let nextIndex;

  if (direction === "previous") {
    nextIndex = currentIndex > 0 ? currentIndex - 1 : focusable.length - 1;
  } else {
    nextIndex = currentIndex < focusable.length - 1 ? currentIndex + 1 : 0;
  }

  if (focusable[nextIndex]) {
    focusable[nextIndex].focus();
    highlightElement(focusable[nextIndex]);
    focusable[nextIndex].scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const focused = document.activeElement;
  return {
    success: true,
    element: focused ? describeElement(focused) : null,
    direction: direction,
  };
}

// ============================================================
// Page Analysis
// ============================================================

function handleGetPageSummary() {
  const links = document.querySelectorAll("a[href]");
  const buttons = document.querySelectorAll(
    'button, input[type="button"], input[type="submit"], [role="button"]'
  );
  const inputs = document.querySelectorAll(
    'input:not([type="hidden"]), textarea, select'
  );
  const headings = document.querySelectorAll("h1, h2, h3");

  const headingTexts = Array.from(headings)
    .slice(0, 10)
    .map((h) => ({
      level: h.tagName,
      text: h.textContent.trim().substring(0, 100),
    }));

  return {
    success: true,
    title: document.title,
    url: window.location.href,
    counts: {
      links: links.length,
      buttons: buttons.length,
      inputs: inputs.length,
      headings: headings.length,
    },
    headings: headingTexts,
    mainText: getMainText(),
  };
}

function handleListInteractiveElements() {
  const elements = [];

  // Links
  document.querySelectorAll("a[href]").forEach((el, i) => {
    if (i < 30 && isVisible(el)) {
      const rect = el.getBoundingClientRect();
      elements.push({
        type: "link",
        text: el.textContent.trim().substring(0, 80),
        href: el.href,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      });
    }
  });

  // Buttons
  document
    .querySelectorAll(
      'button, input[type="button"], input[type="submit"], [role="button"]'
    )
    .forEach((el) => {
      if (isVisible(el)) {
        const rect = el.getBoundingClientRect();
        elements.push({
          type: "button",
          text: (el.textContent || el.value || el.getAttribute("aria-label") || "").trim().substring(0, 80),
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        });
      }
    });

  // Form inputs
  document
    .querySelectorAll('input:not([type="hidden"]), textarea, select')
    .forEach((el) => {
      if (isVisible(el)) {
        const rect = el.getBoundingClientRect();
        const label = findLabelForInput(el);
        elements.push({
          type: el.tagName.toLowerCase(),
          inputType: el.type || "text",
          label: label,
          placeholder: el.placeholder || "",
          value: el.value || "",
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        });
      }
    });

  return {
    success: true,
    count: elements.length,
    elements: elements.slice(0, 50),
  };
}

function handleFindElement(action) {
  const description = action.description || action.element_description || "";
  const element = findElementByDescription(description);
  if (element) {
    highlightElement(element);
    const rect = element.getBoundingClientRect();
    return {
      success: true,
      element: describeElement(element),
      position: {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      },
    };
  }
  return { success: false, error: `Element not found: ${description}` };
}

// ============================================================
// Element Search Helpers
// ============================================================

/**
 * Strip common suffixes like "link", "button", "icon" from descriptions.
 * Gemini often says "Trade link" or "Submit button" - we want just "Trade"/"Submit".
 */
function cleanDescription(description) {
  if (!description) return "";
  return description
    .replace(/\b(link|button|icon|image|img|field|input|text|tab|menu item|menu|element|section)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Get readable text content from an element.
 */
function getElementText(el) {
  return (
    el.textContent ||
    el.value ||
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.getAttribute("alt") ||
    el.placeholder ||
    ""
  ).trim();
}

function findElementByDescription(description) {
  if (!description) return null;

  const lower = description.toLowerCase();
  const cleanedLower = cleanDescription(description).toLowerCase();

  // Use both the original and cleaned description for matching
  const searchTerms = [cleanedLower];
  if (cleanedLower !== lower) searchTerms.push(lower);

  // Search strategy: text content match on clickable elements
  const allClickable = document.querySelectorAll(
    'a, button, input[type="button"], input[type="submit"], [role="button"], [onclick], [role="link"], [role="tab"], [role="menuitem"], summary, [tabindex]'
  );

  // Pass 1: Exact match on cleaned description
  for (const term of searchTerms) {
    for (const el of allClickable) {
      const text = getElementText(el).toLowerCase();
      if (text && text === term && isVisible(el)) return el;
    }
  }

  // Pass 2: Element text starts with or equals description
  for (const term of searchTerms) {
    if (!term) continue;
    for (const el of allClickable) {
      const text = getElementText(el).toLowerCase().trim();
      if (text && (text.startsWith(term) || term.startsWith(text)) && isVisible(el)) {
        return el;
      }
    }
  }

  // Pass 3: Partial text match (includes)
  for (const term of searchTerms) {
    if (!term) continue;
    for (const el of allClickable) {
      const text = getElementText(el).toLowerCase();
      if (text && text.length < 200 && (text.includes(term) || term.includes(text)) && isVisible(el)) {
        return el;
      }
    }
  }

  // Pass 4: aria-label match
  const ariaElements = document.querySelectorAll("[aria-label]");
  for (const term of searchTerms) {
    if (!term) continue;
    for (const el of ariaElements) {
      const label = el.getAttribute("aria-label").toLowerCase();
      if ((label.includes(term) || term.includes(label)) && isVisible(el)) {
        return el;
      }
    }
  }

  // Pass 5: title match
  const titleElements = document.querySelectorAll("[title]");
  for (const term of searchTerms) {
    if (!term) continue;
    for (const el of titleElements) {
      const title = el.getAttribute("title").toLowerCase();
      if ((title.includes(term) || term.includes(title)) && isVisible(el)) {
        return el;
      }
    }
  }

  // Pass 6: placeholder, value, data-* attributes
  for (const term of searchTerms) {
    if (!term) continue;
    for (const el of allClickable) {
      if (!isVisible(el)) continue;
      const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
      const value = (el.getAttribute("value") || "").toLowerCase();
      const dataLabel = (el.getAttribute("data-label") || el.getAttribute("data-text") || el.getAttribute("data-tooltip") || "").toLowerCase();
      const alt = (el.getAttribute("alt") || "").toLowerCase();
      if ((placeholder && (placeholder.includes(term) || term.includes(placeholder))) ||
          (value && (value.includes(term) || term.includes(value))) ||
          (dataLabel && (dataLabel.includes(term) || term.includes(dataLabel))) ||
          (alt && (alt.includes(term) || term.includes(alt)))) {
        return el;
      }
    }
  }

  // Pass 7: CSS selector match (if description looks like a selector)
  if (cleanedLower.match(/^[#.\[]/) || cleanedLower.includes("=")) {
    try {
      const el = document.querySelector(cleanedLower);
      if (el && isVisible(el)) return el;
    } catch (e) { /* not a valid selector, skip */ }
  }

  // Pass 8: Word-level matching on any visible leaf or link element
  const words = cleanedLower.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 0) {
    for (const el of allClickable) {
      const text = getElementText(el).toLowerCase();
      if (text && isVisible(el)) {
        const matches = words.filter(w => text.includes(w));
        if (matches.length === words.length) return el;
      }
    }
  }

  // Pass 9: Any visible element with matching text (broader search)
  for (const term of searchTerms) {
    if (!term) continue;
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (el.children.length === 0 || el.tagName.toLowerCase() === "a") {
        const text = el.textContent.trim().toLowerCase();
        if (text && text.length < 100 && (text.includes(term) || term.includes(text)) && isVisible(el)) {
          return el;
        }
      }
    }
  }

  // Pass 10: Fuzzy match - find closest matching element by edit distance
  let bestMatch = null;
  let bestScore = 0;
  for (const el of allClickable) {
    if (!isVisible(el)) continue;
    const text = getElementText(el).toLowerCase().trim();
    if (!text || text.length > 200) continue;
    // Simple similarity: count matching chars
    const shorter = cleanedLower.length < text.length ? cleanedLower : text;
    const longer = cleanedLower.length < text.length ? text : cleanedLower;
    let matchCount = 0;
    for (const ch of shorter) {
      if (longer.includes(ch)) matchCount++;
    }
    const score = matchCount / Math.max(shorter.length, 1);
    if (score > 0.7 && score > bestScore) {
      bestScore = score;
      bestMatch = el;
    }
  }
  if (bestMatch) return bestMatch;

  return null;
}

function findInputByDescription(description) {
  const lower = description.toLowerCase();
  const cleaned = cleanDescription(description).toLowerCase();

  // Well-known input patterns: catch "search", "arama", "email", etc.
  const wellKnownSelectors = {
    search: 'input[type="search"], input[name="q"], input[name="query"], input[name="search"], textarea[name="q"], [role="searchbox"], [role="combobox"][aria-label*="earch"], [role="combobox"][aria-label*="ara"]',
    arama: 'input[type="search"], input[name="q"], textarea[name="q"], [role="searchbox"], [role="combobox"]',
    email: 'input[type="email"], input[name="email"], input[name="mail"]',
    password: 'input[type="password"]',
    username: 'input[name="username"], input[name="user"], input[name="login"]',
    url: 'input[type="url"], input[name="url"]',
  };

  // Try well-known selectors first
  for (const [keyword, selector] of Object.entries(wellKnownSelectors)) {
    if (lower.includes(keyword) || cleaned.includes(keyword)) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) return el;
    }
  }

  // General search: all inputs, textareas, selects, and contenteditable
  const inputs = document.querySelectorAll(
    'input:not([type="hidden"]), textarea, select, [contenteditable="true"]'
  );

  for (const input of inputs) {
    const label = findLabelForInput(input).toLowerCase();
    const placeholder = (input.placeholder || "").toLowerCase();
    const name = (input.name || "").toLowerCase();
    const ariaLabel = (input.getAttribute("aria-label") || "").toLowerCase();
    const id = (input.id || "").toLowerCase();
    const type = (input.type || "").toLowerCase();
    const role = (input.getAttribute("role") || "").toLowerCase();

    const terms = [lower, cleaned].filter(Boolean);
    for (const term of terms) {
      if (
        label.includes(term) ||
        (label && term.includes(label)) ||
        placeholder.includes(term) ||
        name.includes(term) ||
        ariaLabel.includes(term) ||
        id.includes(term) ||
        type.includes(term) ||
        role.includes(term)
      ) {
        if (isVisible(input)) return input;
      }
    }
  }

  // Last resort: find the most prominent visible input (large, centered)
  const visibleInputs = Array.from(inputs).filter(isVisible);
  if (visibleInputs.length === 1) return visibleInputs[0];

  // If description mentions "first" or "main", return first visible
  if (lower.match(/first|main|primary|ilk|ana/)) {
    if (visibleInputs.length > 0) return visibleInputs[0];
  }

  return null;
}

function findFirstVisibleInput() {
  const inputs = document.querySelectorAll(
    'input:not([type="hidden"]), textarea, [role="textbox"], [role="searchbox"], [role="combobox"], [contenteditable="true"]'
  );
  for (const input of inputs) {
    if (isVisible(input)) return input;
  }
  return null;
}

function findLabelForInput(input) {
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) return label.textContent.trim();
  }
  const parentLabel = input.closest("label");
  if (parentLabel) return parentLabel.textContent.trim();
  if (input.getAttribute("aria-label")) return input.getAttribute("aria-label");
  if (input.placeholder) return input.placeholder;
  if (input.name) return input.name;
  return "unnamed field";
}

function isInputElement(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  const role = (el.getAttribute("role") || "").toLowerCase();
  if (role === "textbox" || role === "searchbox" || role === "combobox") return true;
  return false;
}

function isVisible(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) {
    return false;
  }
  return true;
}

function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const text = getElementText(el).substring(0, 100);
  const ariaLabel = el.getAttribute("aria-label") || "";
  const role = el.getAttribute("role") || "";
  const rect = el.getBoundingClientRect();

  return {
    tag,
    text,
    ariaLabel,
    role,
    type: el.type || "",
    href: el.href || "",
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  };
}

function getMainText() {
  const main =
    document.querySelector("main") ||
    document.querySelector('[role="main"]') ||
    document.querySelector("article") ||
    document.body;

  const text = main.textContent || "";
  return text.replace(/\s+/g, " ").trim().substring(0, 500);
}

// ============================================================
// Visual Highlighting
// ============================================================

let highlightOverlay = null;

function highlightElement(element) {
  removeHighlight();

  const rect = element.getBoundingClientRect();

  highlightOverlay = document.createElement("div");
  highlightOverlay.id = "accessbot-highlight";
  highlightOverlay.style.cssText = `
    position: fixed;
    top: ${rect.top - 3}px;
    left: ${rect.left - 3}px;
    width: ${rect.width + 6}px;
    height: ${rect.height + 6}px;
    border: 3px solid #4CAF50;
    border-radius: 4px;
    background: rgba(76, 175, 80, 0.15);
    pointer-events: none;
    z-index: 999999;
    transition: opacity 0.3s;
  `;

  document.body.appendChild(highlightOverlay);
  setTimeout(removeHighlight, 2000);
}

function removeHighlight() {
  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }
}

// ============================================================
// Right Click Action
// ============================================================

function handleRightClick(action) {
  const description = action.description || action.element_description || "";
  let element = null;

  if (description) {
    element = findElementByDescription(description);
  }
  if (!element && action.x && action.y && action.x > 0 && action.y > 0) {
    const scaled = scaleCoordinates(action.x, action.y);
    element = document.elementFromPoint(scaled.x, scaled.y);
  }

  if (!element) {
    return { success: false, error: "Element not found for right-click" };
  }

  highlightElement(element);
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  element.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true, cancelable: true, view: window,
    clientX: x, clientY: y, button: 2,
  }));

  return {
    success: true,
    element: describeElement(element),
    method: "right_click",
  };
}

// ============================================================
// Double Click Action
// ============================================================

function handleDoubleClick(action) {
  const description = action.description || action.element_description || "";
  let element = null;

  if (description) {
    element = findElementByDescription(description);
  }
  if (!element && action.x && action.y && action.x > 0 && action.y > 0) {
    const scaled = scaleCoordinates(action.x, action.y);
    element = document.elementFromPoint(scaled.x, scaled.y);
  }

  if (!element) {
    return { success: false, error: "Element not found for double-click" };
  }

  highlightElement(element);
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };

  element.dispatchEvent(new MouseEvent("mousedown", opts));
  element.dispatchEvent(new MouseEvent("mouseup", opts));
  element.dispatchEvent(new MouseEvent("click", opts));
  element.dispatchEvent(new MouseEvent("mousedown", opts));
  element.dispatchEvent(new MouseEvent("mouseup", opts));
  element.dispatchEvent(new MouseEvent("click", opts));
  element.dispatchEvent(new MouseEvent("dblclick", opts));

  return {
    success: true,
    element: describeElement(element),
    method: "double_click",
  };
}

// ============================================================
// Hover Action
// ============================================================

function handleHover(action) {
  const description = action.description || action.element_description || "";
  let element = null;

  if (description) {
    element = findElementByDescription(description);
  }
  if (!element && action.x && action.y && action.x > 0 && action.y > 0) {
    const scaled = scaleCoordinates(action.x, action.y);
    element = document.elementFromPoint(scaled.x, scaled.y);
  }

  if (!element) {
    return { success: false, error: "Element not found to hover" };
  }

  highlightElement(element);
  element.scrollIntoView({ behavior: "smooth", block: "center" });

  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };

  element.dispatchEvent(new MouseEvent("mouseenter", { ...opts, bubbles: false }));
  element.dispatchEvent(new MouseEvent("mouseover", opts));
  element.dispatchEvent(new MouseEvent("mousemove", opts));

  return {
    success: true,
    element: describeElement(element),
    method: "hover",
  };
}

// ============================================================
// Clipboard Action
// ============================================================

function handleClipboard(action) {
  const clipAction = action.clipboard_action || action.action_type || "";

  switch (clipAction) {
    case "select_all":
      document.execCommand("selectAll");
      return { success: true, action: "select_all" };

    case "copy":
      document.execCommand("copy");
      const selectedText = window.getSelection()?.toString() || "";
      return { success: true, action: "copy", copiedText: selectedText.substring(0, 500) };

    case "cut":
      document.execCommand("cut");
      return { success: true, action: "cut" };

    case "paste":
      if (action.text) {
        const active = document.activeElement;
        if (active && isInputElement(active)) {
          const start = active.selectionStart || 0;
          const end = active.selectionEnd || 0;
          const current = active.value || "";
          active.value = current.substring(0, start) + action.text + current.substring(end);
          active.dispatchEvent(new Event("input", { bubbles: true }));
          return { success: true, action: "paste", text: action.text };
        }
        // Try execCommand for contentEditable
        document.execCommand("insertText", false, action.text);
        return { success: true, action: "paste", text: action.text };
      }
      document.execCommand("paste");
      return { success: true, action: "paste" };

    default:
      return { success: false, error: `Unknown clipboard action: ${clipAction}` };
  }
}

// ============================================================
// Find on Page (Ctrl+F equivalent)
// ============================================================

function handleFindOnPage(action) {
  const searchText = action.search_text || "";
  if (!searchText) {
    return { success: false, error: "No search text provided" };
  }

  // Use window.find() for basic text search
  const found = window.find(searchText, false, false, true, false, false, false);

  if (found) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Highlight the found text
      const el = range.startContainer.parentElement;
      if (el) {
        highlightElement(el);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      return {
        success: true,
        found: true,
        text: selection.toString(),
        position: {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        },
      };
    }
  }

  return {
    success: true,
    found: false,
    error: `Text "${searchText}" not found on page`,
  };
}

// ============================================================
// Screen Reader Navigation (navigate by element type)
// ============================================================

// Track current position for each element type
const navigationPositions = {};

function handleNavigateByType(action) {
  const elementType = action.element_type || "heading";
  const direction = action.direction || "next";

  // Get all elements of the requested type
  const elements = getElementsByType(elementType);

  if (elements.length === 0) {
    return {
      success: false,
      error: `No ${elementType} elements found on this page`,
    };
  }

  // Track position per element type
  const key = elementType;
  if (!(key in navigationPositions)) {
    navigationPositions[key] = -1;
  }

  // Move to next/previous
  if (direction === "next") {
    navigationPositions[key] = (navigationPositions[key] + 1) % elements.length;
  } else {
    navigationPositions[key] = navigationPositions[key] <= 0
      ? elements.length - 1
      : navigationPositions[key] - 1;
  }

  const idx = navigationPositions[key];
  const element = elements[idx];

  // Focus and highlight
  highlightElement(element);
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  if (element.focus) element.focus();

  return {
    success: true,
    element: describeElement(element),
    elementType: elementType,
    index: idx + 1,
    total: elements.length,
    text: getElementText(element).substring(0, 200),
    tag: element.tagName.toLowerCase(),
  };
}

function getElementsByType(type) {
  let selector = "";
  switch (type) {
    case "heading":
      selector = "h1, h2, h3, h4, h5, h6";
      break;
    case "link":
      selector = "a[href]";
      break;
    case "form":
      selector = 'input:not([type="hidden"]), textarea, select, button';
      break;
    case "landmark":
      selector = 'nav, main, aside, header, footer, [role="navigation"], [role="main"], [role="complementary"], [role="banner"], [role="contentinfo"], [role="search"]';
      break;
    case "image":
      selector = "img[alt], [role='img']";
      break;
    case "table":
      selector = "table";
      break;
    case "button":
      selector = 'button, input[type="button"], input[type="submit"], [role="button"]';
      break;
    case "list":
      selector = "ul, ol";
      break;
    default:
      selector = type; // Allow raw CSS selector
  }

  return Array.from(document.querySelectorAll(selector)).filter(isVisible);
}

// ============================================================
// Page Structure (Accessibility Tree)
// ============================================================

function handleGetPageStructure() {
  // Headings hierarchy
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
    .filter(isVisible)
    .slice(0, 30)
    .map((h) => ({
      level: parseInt(h.tagName[1]),
      text: h.textContent.trim().substring(0, 120),
    }));

  // Landmarks
  const landmarkSelectors = [
    { selector: 'nav, [role="navigation"]', type: "navigation" },
    { selector: 'main, [role="main"]', type: "main" },
    { selector: 'aside, [role="complementary"]', type: "complementary" },
    { selector: 'header, [role="banner"]', type: "banner" },
    { selector: 'footer, [role="contentinfo"]', type: "contentinfo" },
    { selector: '[role="search"]', type: "search" },
  ];

  const landmarks = [];
  for (const { selector, type } of landmarkSelectors) {
    document.querySelectorAll(selector).forEach((el) => {
      if (isVisible(el)) {
        landmarks.push({
          type: type,
          label: el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || "",
          text: el.textContent.trim().substring(0, 80),
        });
      }
    });
  }

  // Forms
  const forms = Array.from(document.querySelectorAll("form")).filter(isVisible).map((f) => {
    const inputs = f.querySelectorAll('input:not([type="hidden"]), textarea, select');
    return {
      action: f.action || "",
      name: f.getAttribute("aria-label") || f.name || "",
      fields: Array.from(inputs).slice(0, 10).map((inp) => ({
        type: inp.type || inp.tagName.toLowerCase(),
        label: findLabelForInput(inp),
        required: inp.required,
      })),
    };
  });

  // Links count and top links
  const links = Array.from(document.querySelectorAll("a[href]"))
    .filter(isVisible)
    .slice(0, 20)
    .map((a) => ({
      text: a.textContent.trim().substring(0, 60),
      href: a.href,
    }));

  // Images with alt text
  const images = Array.from(document.querySelectorAll("img[alt]"))
    .filter(isVisible)
    .slice(0, 10)
    .map((img) => ({
      alt: img.alt,
      src: img.src?.substring(0, 100),
    }));

  return {
    success: true,
    title: document.title,
    url: window.location.href,
    headings,
    landmarks,
    forms,
    links: { count: document.querySelectorAll("a[href]").length, top: links },
    images,
  };
}

// ============================================================
// Read Selected Text
// ============================================================

function handleReadSelectedText() {
  const selection = window.getSelection();
  const text = selection ? selection.toString() : "";

  if (!text) {
    return { success: false, error: "No text is currently selected" };
  }

  return {
    success: true,
    text: text.substring(0, 3000),
    length: text.length,
  };
}

// ============================================================
// Smart Page Awareness - Page Type Detection
// ============================================================

function handleDetectPageType() {
  const url = window.location.href;
  const title = document.title || "";
  const h1 = document.querySelector("h1")?.textContent?.trim() || "";

  // Detect page type using heuristics
  let pageType = "general";
  let confidence = 0.5;
  const details = {};

  // Search results
  if (url.includes("google.com/search") || url.includes("bing.com/search") ||
      url.includes("duckduckgo.com") || url.includes("search.yahoo.com") ||
      document.querySelectorAll('[data-result], .g, .b_algo, .result').length > 3) {
    pageType = "search_results";
    confidence = 0.9;
    const results = document.querySelectorAll('.g, .b_algo, .result, [data-result]');
    details.resultCount = results.length;
    details.query = document.querySelector('input[name="q"], input[type="search"]')?.value || "";
  }

  // E-commerce / Product page
  else if (document.querySelector('[class*="price"], [class*="add-to-cart"], [class*="addtocart"], [data-price], [itemprop="price"]') ||
           url.match(/product|item|shop|store|buy/i)) {
    pageType = "ecommerce";
    confidence = 0.8;
    const priceEl = document.querySelector('[class*="price"], [data-price], [itemprop="price"]');
    details.price = priceEl?.textContent?.trim() || "";
    details.productName = document.querySelector('[itemprop="name"], h1')?.textContent?.trim() || title;
    details.hasAddToCart = !!document.querySelector('[class*="add-to-cart"], [class*="addtocart"], button[name="add"]');
  }

  // Article / Blog
  else if (document.querySelector('article, [role="article"], .article-content, .post-content') ||
           document.querySelectorAll('p').length > 5) {
    const article = document.querySelector('article, [role="article"], main');
    const paragraphs = (article || document).querySelectorAll('p');
    if (paragraphs.length > 3) {
      pageType = "article";
      confidence = 0.75;
      details.title = h1 || title;
      details.paragraphs = paragraphs.length;
      details.estimatedReadTime = Math.ceil(
        Array.from(paragraphs).reduce((acc, p) => acc + p.textContent.split(/\s+/).length, 0) / 200
      ) + " min";
    }
  }

  // Form page
  if (document.querySelectorAll('input:not([type="hidden"]), select, textarea').length > 2) {
    const formFields = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
    if (pageType === "general" || formFields.length > 4) {
      pageType = "form";
      confidence = 0.8;
      details.fieldCount = formFields.length;
      details.hasSubmit = !!document.querySelector('button[type="submit"], input[type="submit"]');
      details.formLabels = Array.from(document.querySelectorAll('label')).slice(0, 10).map(l => l.textContent.trim()).filter(Boolean);
    }
  }

  // Video page
  if (document.querySelector('video, [class*="player"], iframe[src*="youtube"], iframe[src*="vimeo"]') ||
      url.match(/youtube\.com\/watch|vimeo\.com\//)) {
    pageType = "video";
    confidence = 0.9;
    details.videoTitle = h1 || title;
    details.hasVideo = !!document.querySelector('video');
  }

  // Login page
  if (document.querySelector('input[type="password"]') && document.querySelectorAll('input').length <= 5) {
    pageType = "login";
    confidence = 0.85;
    details.hasPassword = true;
    details.hasUsername = !!document.querySelector('input[type="email"], input[name="username"], input[name="email"]');
  }

  return {
    success: true,
    pageType,
    confidence,
    url,
    title,
    details,
  };
}

function handleGetContextualSuggestions() {
  const detection = handleDetectPageType();
  const suggestions = [];

  switch (detection.pageType) {
    case "search_results":
      suggestions.push("I can read the search results for you");
      suggestions.push("Tell me which result to open");
      suggestions.push("I can refine the search query");
      break;
    case "article":
      suggestions.push("I can read this article aloud for you");
      suggestions.push("I can summarize the key points");
      suggestions.push("I can navigate through the headings");
      break;
    case "ecommerce":
      suggestions.push(`Product: ${detection.details.productName || 'Unknown'}`);
      if (detection.details.price) suggestions.push(`Price: ${detection.details.price}`);
      if (detection.details.hasAddToCart) suggestions.push("I can add this to your cart");
      break;
    case "form":
      suggestions.push(`This form has ${detection.details.fieldCount} fields`);
      suggestions.push("I can help you fill out this form step by step");
      break;
    case "video":
      suggestions.push("I can play or pause the video");
      suggestions.push("I can describe what's on screen");
      break;
    case "login":
      suggestions.push("This is a login page");
      suggestions.push("I can help you enter your credentials");
      break;
    default:
      suggestions.push("I can describe what's on this page");
      suggestions.push("I can list all interactive elements");
      suggestions.push("I can read the page content");
  }

  return {
    success: true,
    pageType: detection.pageType,
    suggestions,
  };
}

// ============================================================
// Keyboard Shortcut Handler
// ============================================================

function handleKeyboardShortcut(action) {
  const shortcut = action.shortcut || "";
  if (!shortcut) return { success: false, error: "No shortcut specified" };

  const parts = shortcut.split("+").map(s => s.trim());
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).map(m => m.toLowerCase());

  const target = document.activeElement || document.body;

  // Map common key names
  const keyMap = {
    "Plus": "+", "Minus": "-", "Equal": "=",
    "Left": "ArrowLeft", "Right": "ArrowRight",
    "Up": "ArrowUp", "Down": "ArrowDown",
    "Del": "Delete", "Esc": "Escape",
  };
  const mappedKey = keyMap[key] || key;

  // Map key to proper code
  const codeMap = {
    "a": "KeyA", "b": "KeyB", "c": "KeyC", "d": "KeyD", "e": "KeyE",
    "f": "KeyF", "g": "KeyG", "h": "KeyH", "i": "KeyI", "j": "KeyJ",
    "k": "KeyK", "l": "KeyL", "m": "KeyM", "n": "KeyN", "o": "KeyO",
    "p": "KeyP", "q": "KeyQ", "r": "KeyR", "s": "KeyS", "t": "KeyT",
    "u": "KeyU", "v": "KeyV", "w": "KeyW", "x": "KeyX", "y": "KeyY",
    "z": "KeyZ", "Tab": "Tab", "Enter": "Enter", "Escape": "Escape",
    "Backspace": "Backspace", "Delete": "Delete", "Space": "Space",
    "ArrowLeft": "ArrowLeft", "ArrowRight": "ArrowRight",
    "ArrowUp": "ArrowUp", "ArrowDown": "ArrowDown",
    "F1": "F1", "F2": "F2", "F3": "F3", "F4": "F4", "F5": "F5",
    "F6": "F6", "F7": "F7", "F8": "F8", "F9": "F9", "F10": "F10",
    "F11": "F11", "F12": "F12",
    "+": "Equal", "-": "Minus", "=": "Equal",
  };
  const code = codeMap[mappedKey] || codeMap[mappedKey.toLowerCase()] || mappedKey;

  const eventInit = {
    key: mappedKey.length === 1 ? mappedKey.toLowerCase() : mappedKey,
    code: code,
    bubbles: true,
    cancelable: true,
    ctrlKey: modifiers.includes("ctrl") || modifiers.includes("control"),
    shiftKey: modifiers.includes("shift"),
    altKey: modifiers.includes("alt"),
    metaKey: modifiers.includes("meta") || modifiers.includes("cmd") || modifiers.includes("command"),
  };

  target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  target.dispatchEvent(new KeyboardEvent("keypress", eventInit));
  target.dispatchEvent(new KeyboardEvent("keyup", eventInit));

  // Handle some shortcuts natively that can't be simulated
  if (eventInit.ctrlKey || eventInit.metaKey) {
    const lowerKey = mappedKey.toLowerCase();
    if (lowerKey === "a") {
      // Select all
      document.execCommand("selectAll");
    } else if (lowerKey === "c") {
      document.execCommand("copy");
    } else if (lowerKey === "x") {
      document.execCommand("cut");
    } else if (lowerKey === "v") {
      document.execCommand("paste");
    } else if (lowerKey === "z") {
      document.execCommand("undo");
    } else if (lowerKey === "y") {
      document.execCommand("redo");
    }
  }

  return {
    success: true,
    shortcut,
    target: describeElement(target),
  };
}

// ============================================================
// Drag and Drop Handler
// ============================================================

function handleDragAndDrop(action) {
  const fromDesc = action.from_description || "";
  const toDesc = action.to_description || "";

  // Find source element
  let sourceEl = null;
  if (fromDesc) sourceEl = findElementByDescription(fromDesc);
  if (!sourceEl && action.from_x && action.from_y) {
    const scaled = scaleCoordinates(action.from_x, action.from_y);
    sourceEl = document.elementFromPoint(scaled.x, scaled.y);
  }
  if (!sourceEl) return { success: false, error: `Source element not found: "${fromDesc}"` };

  // Find target element
  let targetEl = null;
  if (toDesc) targetEl = findElementByDescription(toDesc);
  if (!targetEl && action.to_x && action.to_y) {
    const scaled = scaleCoordinates(action.to_x, action.to_y);
    targetEl = document.elementFromPoint(scaled.x, scaled.y);
  }
  if (!targetEl) return { success: false, error: `Target element not found: "${toDesc}"` };

  const sourceRect = sourceEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();

  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;

  const dataTransfer = new DataTransfer();

  // Dispatch drag sequence
  sourceEl.dispatchEvent(new DragEvent("dragstart", {
    bubbles: true, cancelable: true, clientX: startX, clientY: startY, dataTransfer,
  }));
  sourceEl.dispatchEvent(new DragEvent("drag", {
    bubbles: true, cancelable: true, clientX: startX, clientY: startY, dataTransfer,
  }));
  targetEl.dispatchEvent(new DragEvent("dragenter", {
    bubbles: true, cancelable: true, clientX: endX, clientY: endY, dataTransfer,
  }));
  targetEl.dispatchEvent(new DragEvent("dragover", {
    bubbles: true, cancelable: true, clientX: endX, clientY: endY, dataTransfer,
  }));
  targetEl.dispatchEvent(new DragEvent("drop", {
    bubbles: true, cancelable: true, clientX: endX, clientY: endY, dataTransfer,
  }));
  sourceEl.dispatchEvent(new DragEvent("dragend", {
    bubbles: true, cancelable: true, clientX: endX, clientY: endY, dataTransfer,
  }));

  return {
    success: true,
    from: describeElement(sourceEl),
    to: describeElement(targetEl),
  };
}

// ============================================================
// Mouse Move Handler
// ============================================================

function handleMoveMouse(action) {
  if (!action.x || !action.y) return { success: false, error: "No coordinates" };

  const scaled = scaleCoordinates(action.x, action.y);
  const element = document.elementFromPoint(scaled.x, scaled.y);

  if (element) {
    element.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true, cancelable: true, view: window,
      clientX: scaled.x, clientY: scaled.y,
    }));
    element.dispatchEvent(new MouseEvent("mouseover", {
      bubbles: true, cancelable: true, view: window,
      clientX: scaled.x, clientY: scaled.y,
    }));

    highlightElement(element);

    return {
      success: true,
      element: describeElement(element),
      coords: scaled,
    };
  }

  return { success: false, error: "No element at coordinates" };
}

// ============================================================
// Scroll To Element Handler
// ============================================================

function handleScrollToElement(action) {
  const description = action.description || action.element_description || "";
  if (!description) return { success: false, error: "No element description" };

  // Search all visible elements, not just clickable ones
  const allElements = document.querySelectorAll("*");
  const lower = description.toLowerCase();
  const cleaned = cleanDescription(description).toLowerCase();

  let found = null;

  // Try headings first
  const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
  for (const h of headings) {
    const text = h.textContent.trim().toLowerCase();
    if (text.includes(cleaned) || cleaned.includes(text)) {
      found = h;
      break;
    }
  }

  // Try aria-label, id, class name
  if (!found) {
    for (const el of allElements) {
      const text = (el.textContent || "").trim().toLowerCase();
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
      const id = (el.id || "").toLowerCase();

      if (text.length < 200 && text.length > 0) {
        if (text.includes(cleaned) || cleaned.includes(text) ||
            ariaLabel.includes(cleaned) || id.includes(cleaned)) {
          if (isVisible(el)) {
            found = el;
            break;
          }
        }
      }
    }
  }

  if (!found) {
    // Broader search: findElementByDescription
    found = findElementByDescription(description);
  }

  if (!found) return { success: false, error: `Element not found: "${description}"` };

  found.scrollIntoView({ behavior: "smooth", block: "center" });
  highlightElement(found);

  return {
    success: true,
    element: describeElement(found),
    scrolledTo: true,
  };
}

console.log("[AccessBot] Content script loaded, DPR:", window.devicePixelRatio);
