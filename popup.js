// popup.js
document.addEventListener('DOMContentLoaded', function () {
  // Toggle button event listener
  const toggleBtn = document.getElementById('toggleBtn');
  toggleBtn.addEventListener('click', function () {
    if (toggleBtn.textContent === 'Start Listening') {
      toggleBtn.textContent = 'Stop Listening';
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'startAssistant' });
      });
    } else {
      toggleBtn.textContent = 'Start Listening';
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
          response.voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.uri;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
          });
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
});
