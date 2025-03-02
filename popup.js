// popup.js
document.addEventListener('DOMContentLoaded', function () {
  // Check browser compatibility first
  if (
    !('webkitSpeechRecognition' in window) &&
    !('SpeechRecognition' in window)
  ) {
    document.getElementById('compatWarning').style.display = 'block';
    document.getElementById('controlPanel').style.display = 'none';
    return;
  }

  // Toggle button event listener
  const toggleBtn = document.getElementById('toggleBtn');
  const statusText = document.getElementById('statusText');
  const autoStartToggle = document.getElementById('autoStartToggle');

  // Load auto-start setting
  chrome.storage.local.get(['autoStart'], function (result) {
    autoStartToggle.checked = result.autoStart || false;
  });

  // Auto-start toggle event
  autoStartToggle.addEventListener('change', function () {
    chrome.storage.local.set({ autoStart: autoStartToggle.checked });
  });

  // Check initial state (for when popup reopens)
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: 'getStatus' },
      function (response) {
        if (response && response.isListening) {
          toggleBtn.textContent = 'Stop Listening';
          toggleBtn.classList.add('active');
          statusText.textContent = 'Voice assistant is active';
        } else {
          toggleBtn.textContent = 'Start Listening';
          toggleBtn.classList.remove('active');
          statusText.textContent = 'Voice assistant is inactive';
        }
      }
    );
  });

  toggleBtn.addEventListener('click', function () {
    if (toggleBtn.textContent === 'Start Listening') {
      toggleBtn.textContent = 'Stop Listening';
      toggleBtn.classList.add('active');
      statusText.textContent = 'Voice assistant is active';

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'startAssistant' });
      });
    } else {
      toggleBtn.textContent = 'Start Listening';
      toggleBtn.classList.remove('active');
      statusText.textContent = 'Voice assistant is inactive';

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stopAssistant' });
      });
    }
  });

  // Speech rate slider
  const speechRate = document.getElementById('speechRate');
  const rateValue = document.getElementById('rateValue');

  speechRate.addEventListener('input', function () {
    rateValue.textContent = speechRate.value;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateSettings',
        settings: {
          speechRate: parseFloat(speechRate.value)
        }
      });
    });
  });

  // Voice selector
  const voiceSelect = document.getElementById('voiceSelect');

  // Get available voices
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: 'getVoices' },
      function (response) {
        if (response && response.voices) {
          // Clear previous options
          while (voiceSelect.firstChild) {
            voiceSelect.removeChild(voiceSelect.firstChild);
          }

          // Add default option
          const defaultOption = document.createElement('option');
          defaultOption.value = '';
          defaultOption.textContent = 'Default Voice';
          voiceSelect.appendChild(defaultOption);

          // Add available voices
          response.voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.uri;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
          });
        } else {
          console.log('No voices returned or message response failed');

          // Add helpful message when voices can't be retrieved
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'Voices could not be loaded';
          voiceSelect.appendChild(option);
          voiceSelect.disabled = true;
        }
      }
    );
  });

  voiceSelect.addEventListener('change', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateSettings',
        settings: {
          voiceURI: voiceSelect.value
        }
      });
    });
  });

  // Help button
  document.getElementById('helpBtn').addEventListener('click', function () {
    document.getElementById('helpPanel').style.display =
      document.getElementById('helpPanel').style.display === 'none'
        ? 'block'
        : 'none';
  });
});
