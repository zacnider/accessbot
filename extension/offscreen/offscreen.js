/**
 * Offscreen document for audio capture and playback.
 *
 * Chrome Manifest V3 service workers can't access MediaDevices or AudioContext.
 * This offscreen document handles microphone capture and audio playback.
 */

let audioContext = null;
let mediaStream = null;
let workletNode = null;
let isRecording = false;

// Audio playback queue
let playbackContext = null;
let playbackQueue = [];
let isPlaying = false;

console.log("[Offscreen] Document loaded");

/**
 * Convert ArrayBuffer to base64 string.
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer.
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Start capturing microphone audio.
 */
async function startRecording() {
  if (isRecording) return;

  console.log("[Offscreen] Starting recording...");

  try {
    // Get microphone access
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    console.log("[Offscreen] Microphone access granted");

    // Create AudioContext at 16kHz for direct PCM output
    audioContext = new AudioContext({ sampleRate: 16000 });

    // Load AudioWorklet processor
    const processorUrl = chrome.runtime.getURL("utils/audio-processor.js");
    await audioContext.audioWorklet.addModule(processorUrl);

    // Create source and processor
    const source = audioContext.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioContext, "pcm-processor");

    // Forward PCM data to service worker as base64
    workletNode.port.onmessage = (event) => {
      if (event.data.type === "pcm") {
        const base64 = arrayBufferToBase64(event.data.data);
        chrome.runtime.sendMessage({
          type: "audio_data",
          data: base64,
        });
      }
    };

    source.connect(workletNode);
    // Don't connect to destination to avoid feedback
    // workletNode.connect(audioContext.destination);

    isRecording = true;
    console.log("[Offscreen] Recording started");
    chrome.runtime.sendMessage({ type: "recording_started" });
  } catch (e) {
    console.error("[Offscreen] Failed to start recording:", e);
    chrome.runtime.sendMessage({
      type: "recording_error",
      error: e.message,
    });
  }
}

/**
 * Stop capturing microphone audio.
 */
function stopRecording() {
  if (!isRecording) return;

  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  isRecording = false;
  console.log("[Offscreen] Recording stopped");
  chrome.runtime.sendMessage({ type: "recording_stopped" });
}

let audioChunksReceived = 0;

/**
 * Play PCM audio data received from the backend (base64 encoded).
 * @param {string} base64Data - Base64 encoded PCM 16-bit 24kHz mono audio
 */
async function playAudio(base64Data) {
  try {
    audioChunksReceived++;
    if (audioChunksReceived % 50 === 1) {
      console.log(`[Offscreen] Audio chunk #${audioChunksReceived}, data length: ${base64Data.length}`);
    }

    if (!playbackContext || playbackContext.state === "closed") {
      playbackContext = new AudioContext({ sampleRate: 24000 });
      console.log("[Offscreen] Created playback AudioContext, state:", playbackContext.state);
    }

    // Resume if suspended (Chrome autoplay policy)
    if (playbackContext.state === "suspended") {
      await playbackContext.resume();
      console.log("[Offscreen] AudioContext resumed, state:", playbackContext.state);
    }

    const pcmData = base64ToArrayBuffer(base64Data);

    // Convert Int16 PCM to Float32
    const int16 = new Int16Array(pcmData);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }

    // Create audio buffer
    const audioBuffer = playbackContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    playbackQueue.push(audioBuffer);

    if (!isPlaying) {
      _playNextInQueue();
    }
  } catch (e) {
    console.error("[Offscreen] Playback error:", e);
  }
}

function _playNextInQueue() {
  if (playbackQueue.length === 0) {
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const buffer = playbackQueue.shift();
  const source = playbackContext.createBufferSource();
  source.buffer = buffer;
  source.connect(playbackContext.destination);
  source.onended = () => _playNextInQueue();
  source.start();
}

/**
 * Stop audio playback and clear queue (for interruption handling).
 */
function stopPlayback() {
  playbackQueue = [];
  isPlaying = false;
  if (playbackContext && playbackContext.state !== "closed") {
    playbackContext.close();
    playbackContext = null;
  }
}

// ============================================================
// Sound Effects System (Web Audio API Synthesis)
// ============================================================

let sfxContext = null;

function getSfxContext() {
  if (!sfxContext || sfxContext.state === "closed") {
    sfxContext = new AudioContext();
  }
  return sfxContext;
}

function playSfx(soundName) {
  try {
    const ctx = getSfxContext();
    const now = ctx.currentTime;

    switch (soundName) {
      case "click": {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      }
      case "scroll": {
        const bufferSize = ctx.sampleRate * 0.15;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const src = ctx.createBufferSource();
        const flt = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        src.buffer = buffer;
        flt.type = "bandpass";
        flt.frequency.setValueAtTime(2000, now);
        flt.frequency.exponentialRampToValueAtTime(500, now + 0.15);
        flt.Q.value = 2;
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        src.connect(flt).connect(gain).connect(ctx.destination);
        src.start(now);
        break;
      }
      case "type": {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
        break;
      }
      case "navigate": {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }
      case "connected": {
        [440, 554, 659].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          const t = now + i * 0.12;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.3);
        });
        break;
      }
      case "disconnected": {
        [523, 392, 330].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          const t = now + i * 0.12;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.25);
        });
        break;
      }
      case "error": {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(150, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }
      case "tab": {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(800, now + 0.06);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
        break;
      }
      default:
        console.log("[Offscreen] Unknown sound:", soundName);
    }
  } catch (e) {
    console.error("[Offscreen] Sound effect error:", e);
  }
}

// Listen for commands from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "start_recording":
      console.log("[Offscreen] Received start_recording");
      startRecording();
      sendResponse({ ok: true });
      break;

    case "stop_recording":
      stopRecording();
      sendResponse({ ok: true });
      break;

    case "play_audio":
      playAudio(message.data);
      sendResponse({ ok: true });
      break;

    case "stop_playback":
      stopPlayback();
      sendResponse({ ok: true });
      break;

    case "play_sound":
      playSfx(message.sound);
      sendResponse({ ok: true });
      break;
  }
  return true;
});

// Notify service worker that offscreen is ready
chrome.runtime.sendMessage({ type: "offscreen_ready" });
