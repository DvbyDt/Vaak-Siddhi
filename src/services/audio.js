/**
 * VaakSiddhi — Audio & Speech-to-Text Service
 *
 * Stage 1: Web Speech API (browser built-in, free, no backend needed)
 * Stage 2: MediaRecorder → FastAPI → Whisper (Sanskrit fine-tuned)
 * Stage 3: Self-hosted Whisper on GPU (RunPod/Modal)
 *
 * The `transcribe()` function is the abstraction boundary.
 * Swap its implementation to change providers.
 */

/**
 * Web Speech API controller
 * Returns an object with start/stop methods and result callbacks
 */
export function createSpeechRecognizer({ onResult, onEnd, onError }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn("Web Speech API not supported in this browser. Use Chrome/Edge.");
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "hi-IN"; // Best available for Sanskrit/Devanagari
  recognition.maxAlternatives = 3;

  let finalTranscript = "";
  let isActive = false;
  let shouldRestart = true; // auto-restart on no-speech timeout

  recognition.onstart = () => {
    isActive = true;
    console.log("[VaakSiddhi] Speech recognition started — speak now");
  };

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
      } else {
        interim += transcript;
      }
    }
    console.log("[VaakSiddhi] Heard:", { final: finalTranscript.trim(), interim });
    onResult?.({ final: finalTranscript.trim(), interim: interim.trim() });
  };

  recognition.onend = () => {
    isActive = false;
    // Auto-restart if user hasn't explicitly stopped
    // Chrome's Web Speech API auto-stops after ~5-10s of silence
    if (shouldRestart) {
      console.log("[VaakSiddhi] Recognition ended — auto-restarting (Chrome timeout)");
      try { recognition.start(); } catch (e) {
        console.warn("[VaakSiddhi] Could not restart:", e);
        onEnd?.(finalTranscript.trim());
      }
      return;
    }
    console.log("[VaakSiddhi] Recognition stopped. Final transcript:", finalTranscript.trim());
    onEnd?.(finalTranscript.trim());
  };

  recognition.onerror = (event) => {
    console.error("[VaakSiddhi] Speech error:", event.error);
    if (event.error === "no-speech") {
      // Chrome fires this after ~5-10s of silence — just auto-restart
      onError?.("No speech detected yet — keep speaking or move closer to the mic");
      // onend will fire and auto-restart
      return;
    }
    if (event.error === "not-allowed" || event.error === "audio-capture") {
      shouldRestart = false;
      onError?.("Microphone access denied. Please allow in browser settings and reload.");
      onEnd?.(finalTranscript.trim());
      return;
    }
    if (event.error === "network") {
      onError?.("Network error — speech recognition requires internet in Chrome.");
    }
    if (event.error === "aborted") {
      // Normal when user calls stop()
      return;
    }
  };

  return {
    start: () => {
      finalTranscript = "";
      shouldRestart = true;
      try { recognition.start(); } catch (e) { console.warn("Recognition already started"); }
    },
    stop: () => {
      shouldRestart = false; // prevent auto-restart
      try { recognition.stop(); } catch (e) {}
      return finalTranscript.trim();
    },
    abort: () => {
      shouldRestart = false;
      try { recognition.abort(); } catch (e) {}
    },
    isActive: () => isActive
  };
}

/**
 * Check if speech recognition is available in this browser
 */
export function isSpeechRecognitionAvailable() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Check if microphone permission is granted
 * Returns: 'granted' | 'denied' | 'prompt' | 'unavailable'
 */
export async function checkMicPermission() {
  if (!navigator.permissions) return "unavailable";
  try {
    const result = await navigator.permissions.query({ name: "microphone" });
    return result.state;
  } catch {
    return "unavailable";
  }
}

/**
 * Request microphone access — call before starting recording
 * Returns: true if granted, false if denied
 */
export async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop()); // release immediately
    return true;
  } catch {
    return false;
  }
}

/**
 * Format seconds into MM:SS display string
 */
export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
