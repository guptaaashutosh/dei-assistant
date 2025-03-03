document.addEventListener('DOMContentLoaded', function () {
  const toggleBtn = document.getElementById('toggleBtn');
  const commandInput = document.getElementById('commandInput');
  const submitCommand = document.getElementById('submitCommand');

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

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'processCommand') {
      const command = request.command.toLowerCase();
      voiceAssistant.processCommand(command); // Assuming voiceAssistant is your instance of VoiceAssistant
    }
    // Handle other actions if necessary
  });

  // Handle command submission
  submitCommand.addEventListener('click', function () {
    const command = commandInput.value.trim();
    if (command) {
      setTimeout(() => {
        chrome.tabs.query(
          { active: true, currentWindow: true },
          function (tabs) {
            if (tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'processCommand',
                command: command
              });
            } else {
              console.error('No active tab found.');
            }
          }
        );
      }, 100); // Delay of 100 milliseconds
      commandInput.value = ''; // Clear the input field
    }
  });

  // Optional: Handle Enter key for command submission
  commandInput.addEventListener('keypress', function (event) {
    if (event.key === 'Enter') {
      submitCommand.click(); // Trigger the submit button click
    }
  });
});
