const btn = document.getElementById("grant-btn");
const status = document.getElementById("status");

btn.addEventListener("click", async () => {
  btn.disabled = true;
  btn.textContent = "Requesting...";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Permission granted - stop the stream
    stream.getTracks().forEach((t) => t.stop());

    status.className = "status success";
    status.textContent = "Microphone access granted! This tab will close automatically...";

    // Notify service worker that permission is granted
    await chrome.runtime.sendMessage({ type: "mic_permission_granted" });

    // Close this tab after a short delay
    setTimeout(() => window.close(), 1500);
  } catch (e) {
    status.className = "status error";
    status.textContent = "Microphone access denied. Please allow microphone access and try again.";
    btn.disabled = false;
    btn.textContent = "Try Again";
  }
});
