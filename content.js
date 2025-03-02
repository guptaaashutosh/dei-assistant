// content.js - Main script injected into websites

// ========================
// CORE FUNCTIONALITY
// ========================

// Global variables
let isListening = false;
let isSpeaking = false;
let currentUtterance = null;
let recognition = null;
let readingQueue = [];
let currentSettings = {
  speechRate: 1,
  voiceURI: null,
  highlightElements: true
};

// Initialize components
function initVoiceAssistant() {
  // Create overlay UI
  createOverlayUI();

  // Setup speech recognition
  setupSpeechRecognition();

  // Setup speech synthesis
  setupSpeechSynthesis();

  // Load user settings
  loadSettings();

  // Add keyboard shortcuts
  setupKeyboardShortcuts();

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener(handleMessages);
}

// ========================
// SPEECH RECOGNITION
// ========================

function setupSpeechRecognition() {
  // Check browser support
  if (
    !('webkitSpeechRecognition' in window) &&
    !('SpeechRecognition' in window)
  ) {
    updateStatus('Speech recognition not supported in this browser', 'error');
    return;
  }

  // Initialize speech recognition
  recognition = new (window.SpeechRecognition ||
    window.webkitSpeechRecognition)();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US'; // Default language, can be made configurable

  // Setup event handlers
  recognition.onstart = () => {
    isListening = true;
    updateStatus('Listening...', 'active');
  };

  recognition.onend = () => {
    if (isListening) {
      // Restart if it was supposed to be listening but stopped
      recognition.start();
    } else {
      updateStatus('Stopped listening', 'inactive');
    }
  };

  recognition.onresult = handleSpeechResult;

  recognition.onerror = event => {
    console.error('Speech recognition error:', event.error);
    updateStatus(`Error: ${event.error}`, 'error');
  };
}

function handleSpeechResult(event) {
  const transcript = event.results[event.results.length - 1][0].transcript
    .trim()
    .toLowerCase();
  updateTranscription(transcript);

  // Process voice commands
  processVoiceCommand(transcript);
}

function processVoiceCommand(command) {
  // Core reading commands
  if (command === 'read page') {
    readPageContent();
  } else if (command === 'read headings') {
    readElementsByTag(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  } else if (command === 'read links') {
    readElementsByTag(['a']);
  } else if (command.startsWith('read paragraph')) {
    readElementsByTag(['p']);
  } else if (command === 'stop' || command === 'stop reading') {
    stopReading();
  } else if (command === 'pause') {
    pauseReading();
  } else if (command === 'resume') {
    resumeReading();
  }

  // Navigation commands
  else if (command.startsWith('navigate to ')) {
    const target = command.replace('navigate to ', '');
    navigateToElement(target);
  } else if (command.startsWith('click ')) {
    const target = command.replace('click ', '');
    clickElement(target);
  } else if (command.startsWith('scroll down')) {
    window.scrollBy(0, 300);
  } else if (command.startsWith('scroll up')) {
    window.scrollBy(0, -300);
  }

  // Help and control commands
  else if (command === 'help') {
    readAvailableCommands();
  } else if (command === 'stop listening') {
    stopListening();
  }
}

// ========================
// TEXT-TO-SPEECH
// ========================

function setupSpeechSynthesis() {
  if (!('speechSynthesis' in window)) {
    updateStatus('Speech synthesis not supported in this browser', 'error');
    return;
  }

  // Populate available voices once they're loaded
  speechSynthesis.onvoiceschanged = () => {
    const voices = speechSynthesis.getVoices();
    // Send available voices to popup if needed
    chrome.runtime.sendMessage({
      action: 'voicesLoaded',
      voices: voices.map(voice => ({
        name: voice.name,
        lang: voice.lang,
        uri: voice.voiceURI
      }))
    });
  };
}

function speakText(text, options = {}) {
  if (!text) return;

  // Create new utterance
  const utterance = new SpeechSynthesisUtterance(text);

  // Apply settings
  utterance.rate = options.rate || currentSettings.speechRate;

  // Set voice if specified
  if (options.voiceURI || currentSettings.voiceURI) {
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(
      v => v.voiceURI === (options.voiceURI || currentSettings.voiceURI)
    );
    if (voice) utterance.voice = voice;
  }

  // Handle utterance events
  utterance.onstart = () => {
    isSpeaking = true;
    if (options.element && currentSettings.highlightElements) {
      highlightElement(options.element);
    }
  };

  utterance.onend = () => {
    isSpeaking = false;
    removeHighlight();

    // Speak next item in queue if available
    if (readingQueue.length > 0) {
      const nextItem = readingQueue.shift();
      speakText(nextItem.text, nextItem.options);
    } else {
      updateStatus('Ready', 'inactive');
    }
  };

  // Store current utterance
  currentUtterance = utterance;

  // Speak the text
  speechSynthesis.speak(utterance);

  updateStatus('Speaking...', 'active');
}

function stopReading() {
  speechSynthesis.cancel();
  readingQueue = [];
  isSpeaking = false;
  removeHighlight();
  updateStatus('Stopped reading', 'inactive');
}

function pauseReading() {
  if (isSpeaking) {
    speechSynthesis.pause();
    updateStatus('Paused', 'paused');
  }
}

function resumeReading() {
  if (speechSynthesis.paused) {
    speechSynthesis.resume();
    updateStatus('Speaking...', 'active');
  }
}

// ========================
// READING FUNCTIONS
// ========================

function readPageContent() {
  // Get the main content of the page
  // This is a simplified approach and could be improved with more sophisticated content detection
  const mainContent = getMainContent();

  // Split content into manageable chunks
  const paragraphs = getTextParagraphs(mainContent);

  // Clear existing queue
  readingQueue = [];

  // Add each paragraph to the reading queue
  paragraphs.forEach(paragraph => {
    const text = extractReadableText(paragraph);
    if (text.trim()) {
      readingQueue.push({
        text: text,
        options: { element: paragraph }
      });
    }
  });

  // Start reading
  if (readingQueue.length > 0) {
    const firstItem = readingQueue.shift();
    speakText(firstItem.text, firstItem.options);
  } else {
    speakText('No readable content found on this page.');
  }
}

function readElementsByTag(tags) {
  // Find all specified elements
  let elements = [];
  tags.forEach(tag => {
    const foundElements = document.querySelectorAll(tag);
    elements = [...elements, ...Array.from(foundElements)];
  });

  // Clear existing queue
  readingQueue = [];

  // Build reading queue
  elements.forEach(element => {
    const text = extractReadableText(element);
    if (text.trim()) {
      readingQueue.push({
        text: text,
        options: { element: element }
      });
    }
  });

  // Start reading
  if (readingQueue.length > 0) {
    const firstItem = readingQueue.shift();
    speakText(firstItem.text, firstItem.options);
  } else {
    speakText(`No ${tags.join(' or ')} elements found on this page.`);
  }
}

// ========================
// NAVIGATION FUNCTIONS
// ========================

function navigateToElement(targetText) {
  // Find elements containing the target text
  const elements = findElementsByText(targetText);

  if (elements.length > 0) {
    // Focus on the first matching element
    elements[0].focus();

    // Scroll element into view
    elements[0].scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    // Highlight the element
    highlightElement(elements[0]);

    // Announce success
    speakText(`Navigated to ${targetText}`);
  } else {
    speakText(`Could not find ${targetText} on this page.`);
  }
}

function clickElement(targetText) {
  // Find elements containing the target text
  const elements = findElementsByText(targetText);

  if (elements.length > 0) {
    // Click the first matching element
    elements[0].click();

    // Announce success
    speakText(`Clicked on ${targetText}`);
  } else {
    speakText(`Could not find ${targetText} on this page.`);
  }
}

// ========================
// HELPER FUNCTIONS
// ========================

function getMainContent() {
  // Try to find main content area using common selectors
  // This is a simplified approach and could be improved
  const contentSelectors = [
    'main',
    'article',
    '#content',
    '.content',
    '#main',
    '.main'
  ];

  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }

  // Fallback to body if no main content area found
  return document.body;
}

function getTextParagraphs(container) {
  // Get all text-containing elements
  const textElements = [
    ...container.querySelectorAll('p'),
    ...container.querySelectorAll('h1, h2, h3, h4, h5, h6'),
    ...container.querySelectorAll('li')
  ];

  return textElements;
}

function extractReadableText(element) {
  // Get visible text content with special handling for certain elements
  if (!element) return '';

  // Special handling for links and buttons
  if (element.tagName === 'A') {
    return `Link: ${element.textContent.trim()}`;
  } else if (element.tagName === 'BUTTON') {
    return `Button: ${element.textContent.trim()}`;
  } else if (element.tagName.match(/^H[1-6]$/)) {
    return `Heading ${element.tagName[1]}: ${element.textContent.trim()}`;
  }

  // Get element's direct text, excluding nested elements' text
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent.trim() + ' ';
    }
  }

  // If no direct text, use all text
  if (!text.trim()) {
    text = element.textContent.trim();
  }

  return text;
}

function findElementsByText(targetText) {
  const lowerTarget = targetText.toLowerCase();

  // Elements that can be interacted with
  const interactiveElements = [
    ...document.querySelectorAll('a'),
    ...document.querySelectorAll('button'),
    ...document.querySelectorAll('input'),
    ...document.querySelectorAll('select'),
    ...document.querySelectorAll('[role="button"]')
  ];

  // Filter elements containing the target text
  return interactiveElements.filter(element => {
    const text = element.textContent.toLowerCase();
    const value = element.value ? element.value.toLowerCase() : '';
    const placeholder = element.placeholder
      ? element.placeholder.toLowerCase()
      : '';
    const ariaLabel = element.getAttribute('aria-label')
      ? element.getAttribute('aria-label').toLowerCase()
      : '';

    return (
      text.includes(lowerTarget) ||
      value.includes(lowerTarget) ||
      placeholder.includes(lowerTarget) ||
      ariaLabel.includes(lowerTarget)
    );
  });
}

function highlightElement(element) {
  if (!element) return;

  // Remove any existing highlights
  removeHighlight();

  // Add highlight class
  element.classList.add('voice-reader-highlight');

  // If element is not in viewport, scroll to it
  const rect = element.getBoundingClientRect();
  const isInViewport =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth;

  if (!isInViewport) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }
}

function removeHighlight() {
  // Remove highlight from all elements
  document.querySelectorAll('.voice-reader-highlight').forEach(el => {
    el.classList.remove('voice-reader-highlight');
  });
}

// ========================
// UI FUNCTIONS
// ========================

function createOverlayUI() {
  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'accessibilityOverlay';
  overlay.className = 'accessibility-overlay';

  // Add HTML content
  overlay.innerHTML = `
    <div class="overlay-header">
      <h2>Voice Assistant</h2>
      <button id="minimizeOverlay" class="overlay-button">_</button>
      <button id="closeOverlay" class="overlay-button">×</button>
    </div>
    <div class="overlay-content">
      <div id="statusIndicator" class="status-indicator">
        <div class="indicator-light"></div>
        <span id="statusText">Ready</span>
      </div>
      <div id="transcription" class="transcription">
        <p>Say "Help" for available commands</p>
      </div>
      <div id="readingProgress" class="reading-progress">
        <div class="current-element"></div>
      </div>
    </div>
  `;

  // Add to page
  document.body.appendChild(overlay);

  // Add event listeners
  document
    .getElementById('minimizeOverlay')
    .addEventListener('click', minimizeOverlay);
  document
    .getElementById('closeOverlay')
    .addEventListener('click', closeOverlay);

  // Add styles
  addOverlayStyles();
}

function updateStatus(message, state) {
  const statusElement = document.getElementById('statusText');
  const indicatorElement = document.querySelector('.indicator-light');

  if (statusElement) {
    statusElement.textContent = message;
  }

  if (indicatorElement) {
    // Remove existing state classes
    indicatorElement.classList.remove('active', 'inactive', 'error', 'paused');

    // Add new state class
    if (state) {
      indicatorElement.classList.add(state);
    }
  }
}

function updateTranscription(text) {
  const transcriptionElement = document.getElementById('transcription');

  if (transcriptionElement) {
    transcriptionElement.innerHTML = `<p>${text}</p>`;
  }
}

function minimizeOverlay() {
  const overlay = document.getElementById('accessibilityOverlay');
  overlay.classList.add('minimized');
}

function closeOverlay() {
  stopListening();
  stopReading();

  const overlay = document.getElementById('accessibilityOverlay');
  overlay.style.display = 'none';
}

function addOverlayStyles() {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    .accessibility-overlay {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 300px;
      background-color: #fff;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      z-index: 9999;
      font-family: Arial, sans-serif;
      transition: all 0.3s ease;
    }
    
    .accessibility-overlay.minimized {
      height: 40px;
      overflow: hidden;
    }
    
    .overlay-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background-color: #4285f4;
      color: white;
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;
    }
    
    .overlay-header h2 {
      margin: 0;
      font-size: 16px;
    }
    
    .overlay-button {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      margin-left: 8px;
    }
    
    .overlay-content {
      padding: 12px;
    }
    
    .status-indicator {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
    }
    
    .indicator-light {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
      background-color: #ccc;
    }
    
    .indicator-light.active {
      background-color: #4caf50;
      box-shadow: 0 0 5px #4caf50;
    }
    
    .indicator-light.inactive {
      background-color: #ccc;
    }
    
    .indicator-light.error {
      background-color: #f44336;
      box-shadow: 0 0 5px #f44336;
    }
    
    .indicator-light.paused {
      background-color: #ff9800;
      box-shadow: 0 0 5px #ff9800;
    }
    
    .transcription {
      padding: 8px;
      background-color: #f5f5f5;
      border-radius: 4px;
      margin-bottom: 12px;
      min-height: 60px;
      max-height: 100px;
      overflow-y: auto;
    }
    
    .voice-reader-highlight {
      outline: 3px solid #4285f4 !important;
      background-color: rgba(66, 133, 244, 0.1) !important;
    }
  `;

  document.head.appendChild(styleSheet);
}

function toggleVoiceAssistant() {
  if (isListening) {
    stopListening();
  } else {
    startListening();
  }
}

function startListening() {
  if (!recognition) return;

  recognition.start();
  isListening = true;
}

function stopListening() {
  if (!recognition) return;

  recognition.stop();
  isListening = false;
  updateStatus('Ready', 'inactive');
}

function readAvailableCommands() {
  const commands = [
    'Available commands:',
    'Read page - Reads the main content of the page',
    'Read headings - Reads all headings on the page',
    'Read links - Reads all links on the page',
    'Read paragraph - Reads all paragraphs on the page',
    'Navigate to [text] - Navigates to element containing the text',
    'Click [text] - Clicks element containing the text',
    'Scroll down - Scrolls page down',
    'Scroll up - Scrolls page up',
    'Stop - Stops reading',
    'Pause - Pauses reading',
    'Resume - Resumes reading',
    'Stop listening - Stops voice recognition',
    'Help - Lists available commands'
  ].join('. ');

  speakText(commands);
}

// ========================
// SETTINGS & COMMUNICATION
// ========================

function loadSettings() {
  chrome.storage.sync.get(
    {
      speechRate: 1,
      voiceURI: null,
      highlightElements: true
    },
    function (items) {
      currentSettings = items;
    }
  );
}

function handleMessages(message, sender, sendResponse) {
  if (message.action === 'startAssistant') {
    if (!document.getElementById('accessibilityOverlay')) {
      createOverlayUI();
    }
    document.getElementById('accessibilityOverlay').style.display = 'block';
    startListening();
  } else if (message.action === 'stopAssistant') {
    stopListening();
    stopReading();
  } else if (message.action === 'updateSettings') {
    currentSettings = { ...currentSettings, ...message.settings };
    // Save to storage
    chrome.storage.sync.set(message.settings);
  } else if (message.action === 'getVoices') {
    const voices = speechSynthesis.getVoices();
    sendResponse({
      voices: voices.map(voice => ({
        name: voice.name,
        lang: voice.lang,
        uri: voice.voiceURI
      }))
    });
    return true; // Indicates async response
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', event => {
    // Alt+Shift+V to toggle voice assistant
    if (event.altKey && event.shiftKey && event.key === 'V') {
      toggleVoiceAssistant();
    }

    // Alt+Shift+S to stop reading
    if (event.altKey && event.shiftKey && event.key === 'S') {
      stopReading();
    }
  });
}

// Initialize when document is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVoiceAssistant);
} else {
  initVoiceAssistant();
}
