// content.js
class VoiceAssistant {
  constructor() {
    this.isListening = false;
    this.recognition = null;
    this.speechSynthesis = window.speechSynthesis;
    this.utterance = null;
    this.settings = {
      speechRate: 1.0,
      voiceURI: null
    };
    this.setupVoiceRecognition();
    this.createFeedbackUI();

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(this.handleMessages.bind(this));

    // Check if we should auto-start (based on stored preference)
    chrome.storage.local.get(['autoStart'], result => {
      if (result.autoStart) {
        // Delay startup announcement to ensure page is fully loaded
        setTimeout(() => {
          this.startListening();
          this.announceStartup();
        }, 1500);
      }
    });
  }

  announceStartup() {
    const message = 'Your web accessibility assistant has been started and is ready to help you, Please say "help" to assist you.';
    this.speak(message);
    this.showFeedback('AI Assistant activated', 'success');
  }

  setupVoiceRecognition() {
    try {
      // Check if browser supports SpeechRecognition
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this.showFeedback(
          "Your browser doesn't support speech recognition",
          'error'
        );
        return;
      }

      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US'; // Default language

      // Handle recognition results
      this.recognition.onresult = event => {
        const transcript = event.results[event.results.length - 1][0].transcript
          .trim()
          .toLowerCase();
        this.showFeedback(`Heard: ${transcript}`, 'success');
        console.log('Voice recognized:', transcript);
        this.processCommand(transcript);
      };

      // Handle errors
      this.recognition.onerror = event => {
        console.error('Speech recognition error:', event.error);
        this.showFeedback(`Error: ${event.error}. Try again.`, 'error');

        // If permission denied, guide the user
        if (event.error === 'not-allowed') {
          this.showFeedback(
            'Microphone access denied. Please enable microphone permissions.',
            'error'
          );
        }
      };

      // Restart recognition if it ends
      this.recognition.onend = () => {
        console.log('Speech recognition ended');
        if (this.isListening) {
          console.log('Restarting recognition...');
          try {
            this.recognition.start();
            this.showFeedback('Listening again...', 'info');
          } catch (e) {
            console.error('Failed to restart recognition:', e);
            this.isListening = false;
            this.showFeedback(
              'Voice recognition stopped due to an error',
              'error'
            );
          }
        }
      };
    } catch (error) {
      console.error('Error setting up speech recognition:', error);
      this.showFeedback('Failed to initialize speech recognition', 'error');
    }
  }

  startListening() {
    if (!this.recognition) {
      this.setupVoiceRecognition();
      if (!this.recognition) return;
    }

    try {
      this.recognition.start();
      this.isListening = true;
      this.showFeedback(
        "Voice Assistant activated. Try saying 'help' for commands.",
        'success'
      );
      console.log('Voice recognition started');

      // Save auto-start preference
      chrome.storage.local.set({ autoStart: true });
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.showFeedback(
        'Could not start voice recognition. Try refreshing the page.',
        'error'
      );
    }
  }

  stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
        this.isListening = false;
        this.showFeedback('Voice Assistant deactivated', 'info');
        console.log('Voice recognition stopped');

        // Clear auto-start preference
        chrome.storage.local.set({ autoStart: false });
      } catch (error) {
        console.error('Error stopping speech recognition:', error);
      }
    }
  }

  processCommand(transcript) {
    // Display the transcript for debugging
    console.log('Processing command:', transcript);

    // Check for exact commands first
    if (this.commands[transcript]) {
      this.commands[transcript]();
      return;
    }

    // Check for commands that start with specific phrases
    for (const [cmdPrefix, handler] of Object.entries(this.commands)) {
      if (transcript.startsWith(cmdPrefix) && cmdPrefix !== transcript) {
        const parameter = transcript.substring(cmdPrefix.length).trim();
        handler(parameter);
        return;
      }
    }

    this.showFeedback(
      `Command not recognized: "${transcript}". Try saying "help" for available commands.`,
      'warning'
    );
  }

  commands = {
    'read page': this.readPage.bind(this),
    'read headings': this.readHeadings.bind(this),
    'navigate to': this.navigateTo.bind(this),
    click: this.clickElement.bind(this),
    'stop reading': this.stopReading.bind(this),
    'scroll down': this.scrollDown.bind(this),
    'scroll up': this.scrollUp.bind(this),
    help: this.listCommands.bind(this)
  };

  // Command handlers
  readPage() {
    const text = document.body.innerText;
    this.speak('Reading page content: ' + text);
  }

  readHeadings() {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headings.length === 0) {
      this.speak('No headings found on this page.');
      return;
    }

    let headingText = 'Page headings: ';
    headings.forEach((heading, index) => {
      headingText += `${index + 1}. ${heading.innerText}. `;
    });

    this.speak(headingText);
  }

  navigateTo(target) {
    if (!target) return;

    const links = Array.from(document.querySelectorAll('a'));
    const closestLink = links.find(link =>
      link.innerText.toLowerCase().includes(target.toLowerCase())
    );

    if (closestLink) {
      this.speak(`Navigating to ${closestLink.innerText}`);
      setTimeout(() => {
        closestLink.click();
      }, 2000);
    } else {
      this.speak(`Could not find a link matching "${target}"`);
    }
  }

  clickElement(target) {
    if (!target) return;

    const elements = Array.from(
      document.querySelectorAll(
        'button, [role="button"], input[type="submit"], input[type="button"]'
      )
    );
    const matchingElement = elements.find(
      el =>
        el.innerText?.toLowerCase().includes(target.toLowerCase()) ||
        el.value?.toLowerCase().includes(target.toLowerCase()) ||
        el
          .getAttribute('aria-label')
          ?.toLowerCase()
          .includes(target.toLowerCase())
    );

    if (matchingElement) {
      this.speak(
        `Clicking ${
          matchingElement.innerText || matchingElement.value || 'element'
        }`
      );
      setTimeout(() => {
        matchingElement.click();
      }, 1000);
    } else {
      this.speak(`Could not find a clickable element matching "${target}"`);
    }
  }

  scrollDown() {
    window.scrollTo({
      top: window.scrollY + window.innerHeight * 0.7,
      behavior: 'smooth'
    });
    this.speak('Scrolling down');
  }

  scrollUp() {
    window.scrollTo({ top: window.scrollY - window.innerHeight * 0.7, behavior: 'auto' });
    this.speak('Scrolling up');
  }

  stopReading() {
    if (this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
      this.showFeedback('Stopped reading', 'info');
    }
  }

  listCommands() {
    const commandList = Object.keys(this.commands).join(', ');
    this.speak(`Available commands: ${commandList}`);
    this.showFeedback(`Available commands: ${commandList}`, 'info', 10000);
  }

  speak(text) {
    // Cancel any ongoing speech
    if (this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
    }

    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.rate = this.settings.speechRate;

    // Set voice if specified
    if (this.settings.voiceURI) {
      const voices = this.speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === this.settings.voiceURI);
      if (voice) {
        this.utterance.voice = voice;
      }
    }

    this.speechSynthesis.speak(this.utterance);
  }

  createFeedbackUI() {
    const feedbackDiv = document.createElement('div');
    feedbackDiv.id = 'voice-assistant-feedback';
    feedbackDiv.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      max-width: 300px;
      display: none;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    `;
    document.body.appendChild(feedbackDiv);
  }

  showFeedback(message, type = 'info', duration = 3000) {
    const feedbackDiv = document.getElementById('voice-assistant-feedback');
    if (!feedbackDiv) return;

    // Set colors based on message type
    let bgColor;
    switch (type) {
      case 'success':
        bgColor = 'rgba(40, 167, 69, 0.9)';
        break;
      case 'error':
        bgColor = 'rgba(220, 53, 69, 0.9)';
        break;
      case 'warning':
        bgColor = 'rgba(255, 193, 7, 0.9)';
        break;
      default:
        bgColor = 'rgba(0, 0, 0, 0.8)';
    }

    feedbackDiv.style.backgroundColor = bgColor;
    feedbackDiv.textContent = message;
    feedbackDiv.style.display = 'block';

    // Hide the message after duration
    setTimeout(() => {
      feedbackDiv.style.display = 'none';
    }, duration);
  }

  handleMessages(message, sender, sendResponse) {
    console.log('Message received:', message);

    switch (message.action) {
      case 'startAssistant':
        this.startListening();
        // Announce when manually started
        this.announceStartup();
        break;
      case 'stopAssistant':
        this.stopListening();
        break;
      case 'updateSettings':
        this.settings = { ...this.settings, ...message.settings };
        break;
      case 'getVoices':
        const voices = this.speechSynthesis.getVoices();
        sendResponse({
          voices: voices.map(v => ({
            name: v.name,
            lang: v.lang,
            uri: v.voiceURI
          }))
        });
        break;
      case 'getStatus':
        sendResponse({ isListening: this.isListening });
        break;
      default:
        console.log('Unknown action:', message.action);
    }
  }
}

// Initialize the voice assistant when the page loads
const voiceAssistant = new VoiceAssistant();
console.log('Voice Assistant initialized');
