/**
 * VaakSiddhi — Audio & Speech-to-Text Service
 */

/**
 * Web Speech API controller.
 * Collects all alternatives (up to 3) from every result segment.
 * NOTE: Chrome's Web Speech API requires an internet connection — it streams
 * audio to Google's servers. If offline, use the manual text fallback instead.
 */
export function createSpeechRecognizer({ onResult, onEnd, onError }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("[VaakSiddhi] Web Speech API not supported. Use Chrome/Edge.");
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous      = true;
  recognition.interimResults  = true;
  recognition.lang            = "hi-IN"; // best available for Sanskrit phonemes
  recognition.maxAlternatives = 3;       // collect all 3 alternatives per result

  let primaryTranscript = "";
  let allAlternatives   = new Set();
  let shouldRestart     = true;
  let isActive          = false;
  let gotAnyAudio       = false; // guard against firing onEnd with empty transcript

  recognition.onstart = () => { isActive = true; };

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        gotAnyAudio = true;
        // Collect ALL alternatives, not just [0]
        for (let j = 0; j < event.results[i].length; j++) {
          const alt = event.results[i][j].transcript.trim();
          if (alt) allAlternatives.add(alt);
        }
        primaryTranscript += event.results[i][0].transcript + " ";
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    onResult?.({ final: primaryTranscript.trim(), interim: interim.trim() });
  };

  recognition.onend = () => {
    isActive = false;
    if (shouldRestart) {
      try { recognition.start(); return; } catch {}
    }
    // Only fire onEnd if we actually captured something
    if (!gotAnyAudio) return;
    const transcript   = primaryTranscript.trim();
    const alternatives = [...allAlternatives].filter(a => a !== transcript);
    console.log("[VaakSiddhi] Final:", transcript, "| Alternatives:", alternatives);
    onEnd?.({ transcript, alternatives });
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted") return; // normal on manual stop()
    if (event.error === "no-speech") {
      onError?.("No speech detected yet — keep speaking or move closer to the mic");
      return;
    }
    if (event.error === "not-allowed" || event.error === "audio-capture") {
      shouldRestart = false;
      onError?.("Microphone access denied. Please allow in browser settings and reload.");
      return;
    }
    if (event.error === "network") {
      shouldRestart = false;
      onError?.("Speech recognition needs internet (Chrome streams audio to Google). Use the text box below instead.");
      onEnd?.({ transcript: primaryTranscript.trim(), alternatives: [...allAlternatives] });
    }
  };

  return {
    start() {
      primaryTranscript = "";
      allAlternatives   = new Set();
      shouldRestart     = true;
      gotAnyAudio       = false;
      try { recognition.start(); } catch {}
    },
    stop() {
      shouldRestart = false;
      try { recognition.stop(); } catch {}
    },
    abort() {
      shouldRestart = false;
      try { recognition.abort(); } catch {}
    },
    isActive: () => isActive,
  };
}

/**
 * Records raw audio for playback using MediaRecorder.
 * Run this in parallel with createSpeechRecognizer — they share the mic
 * without conflicting because MediaRecorder doesn't use Web Speech API.
 *
 * Usage:
 *   const recorder = createAudioRecorder();
 *   await recorder.start();
 *   const blobUrl = await recorder.stop(); // returns a URL you can pass to <audio src>
 *   recorder.release();                    // call when done with the URL
 */
export function createAudioRecorder() {
  let mediaRecorder = null;
  let stream        = null;
  let chunks        = [];

  return {
    async start() {
      try {
        // Reuse an existing mic stream — avoids a second permission prompt
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];

        // Pick the best supported format
        const mimeType = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "audio/mp4",
        ].find(t => MediaRecorder.isTypeSupported(t)) || "";

        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        mediaRecorder.ondataavailable = e => { if (e.data?.size > 0) chunks.push(e.data); };
        mediaRecorder.start(200); // collect in 200ms chunks for smooth playback
        return true;
      } catch {
        return false;
      }
    },

    stop() {
      return new Promise(resolve => {
        if (!mediaRecorder || mediaRecorder.state === "inactive") {
          resolve(null);
          return;
        }
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
          // Return both blob (for AI audio analysis) and url (for in-page playback)
          resolve({ blob, url: URL.createObjectURL(blob) });
        };
        mediaRecorder.stop();
        // Release mic tracks so the browser indicator turns off
        stream?.getTracks().forEach(t => t.stop());
      });
    },

    abort() {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.ondataavailable = null;
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
      }
      stream?.getTracks().forEach(t => t.stop());
    },

    /** Call this when you navigate away to free the blob URL memory */
    release(url) {
      if (url) URL.revokeObjectURL(url);
    },
  };
}

export function isSpeechRecognitionAvailable() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch {
    return false;
  }
}

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
