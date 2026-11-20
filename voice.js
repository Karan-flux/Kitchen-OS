(() => {
  const form = document.getElementById("assistantForm");
  const input = document.getElementById("assistantInput");
  const log = document.getElementById("assistantLog");
  const mic = document.getElementById("assistantMic");
  const status = document.getElementById("assistantStatus");
  const assistantPanel = document.getElementById("kitchenAssistant");
  const collapseButton = document.getElementById("assistantCollapse");
  const send = form.querySelector(".assistant-send");
  let pendingAction = null;
  let recognition = null;
  let isListening = false;
  let voiceMode = false;
  let isProcessing = false;
  let isSpeaking = false;
  let restartTimer = null;

  function addMessage(message, role) {
    const bubble = document.createElement("p");
    bubble.className = `assistant-message ${role === "user" ? "assistant-message-user" : "assistant-message-bot"}`;
    bubble.textContent = message;
    log.append(bubble);
    log.scrollTop = log.scrollHeight;
  }

  function speak(message) {
    if (!("speechSynthesis" in window) || !message) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "en-IN";
    isSpeaking = true;
    utterance.onend = () => {
      isSpeaking = false;
      resumeListening();
    };
    utterance.onerror = () => {
      isSpeaking = false;
      resumeListening();
    };
    window.speechSynthesis.speak(utterance);
  }

  function setVoiceMode(enabled, message = "") {
    voiceMode = enabled;
    mic.classList.toggle("listening", enabled);
    mic.setAttribute("aria-pressed", String(enabled));
    mic.setAttribute("aria-label", enabled ? "Stop voice conversation" : "Start voice conversation");
    mic.title = enabled ? "Stop voice conversation" : "Start voice conversation";
    status.textContent = message || (enabled ? "Voice mode on. Listening for your request." : "Voice mode off.");
  }

  function resumeListening() {
    clearTimeout(restartTimer);
    if (!voiceMode || isProcessing || isSpeaking || isListening || !recognition) return;
    restartTimer = setTimeout(() => {
      if (!voiceMode || isProcessing || isSpeaking || isListening) return;
      try {
        recognition.start();
      } catch {
        status.textContent = "Voice mode is ready. Tap the mic to restart listening.";
      }
    }, 350);
  }

  function isConfirmation(message) {
    return /^(yes|yeah|yep|confirm|confirmed|do it|go ahead|haan|ha)[.! ]*$/i.test(message.trim());
  }

  function isRejection(message) {
    return /^(no|nope|cancel|stop|don't|do not)[.! ]*$/i.test(message.trim());
  }

  async function sendMessage(message) {
    const text = message.trim();
    if (!text || send.disabled) return;
    addMessage(text, "user");
    input.value = "";
    send.disabled = true;
    isProcessing = true;

    try {
      let payload;
      if (pendingAction && isConfirmation(text)) {
        payload = { execute: pendingAction };
        pendingAction = null;
      } else if (pendingAction && isRejection(text)) {
        pendingAction = null;
        const reply = "Okay, I cancelled that. No changes were made.";
        addMessage(reply, "assistant");
        speak(reply);
        return;
      } else if (pendingAction) {
        addMessage("Please say yes to confirm or no to cancel the prepared action.", "assistant");
        return;
      } else {
        payload = { text };
      }

      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The assistant could not complete that request.");
      pendingAction = result.pending || null;
      if (result.actionSucceeded) await window.refreshDashboard();
      addMessage(result.reply || "I could not complete that request.", "assistant");
      speak(result.reply || "");
    } catch (error) {
      addMessage(error.message || "The assistant could not reach the kitchen server.", "assistant");
    } finally {
      isProcessing = false;
      send.disabled = false;
      if (!voiceMode) input.focus();
      else resumeListening();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });

  collapseButton.addEventListener("click", () => {
    const compact = assistantPanel.classList.toggle("assistant-compact");
    collapseButton.textContent = compact ? "+" : "−";
    collapseButton.setAttribute("aria-expanded", String(!compact));
    collapseButton.setAttribute("aria-label", compact ? "Show conversation" : "Hide conversation");
    collapseButton.title = compact ? "Show conversation" : "Hide conversation";
    if (!compact) log.scrollTop = log.scrollHeight;
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    mic.disabled = true;
    status.textContent = "Speech recognition is unavailable here. Type your request instead.";
  } else {
    recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => {
      isListening = true;
      mic.classList.add("listening");
      mic.setAttribute("aria-pressed", "true");
      status.textContent = "Voice mode on. Listening...";
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) sendMessage(transcript);
    };
    recognition.onerror = (event) => {
      if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
        setVoiceMode(false, "Microphone access is unavailable. Check browser permissions or type your request.");
      } else {
        status.textContent = "I could not hear that. Listening will resume; you can also type.";
      }
    };
    recognition.onend = () => {
      isListening = false;
      if (!voiceMode) mic.classList.remove("listening");
      resumeListening();
    };
    mic.addEventListener("click", () => {
      if (voiceMode) {
        setVoiceMode(false);
        clearTimeout(restartTimer);
        if (isListening) recognition.stop();
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
        isSpeaking = false;
        return;
      }
      setVoiceMode(true);
      resumeListening();
    });
  }
})();