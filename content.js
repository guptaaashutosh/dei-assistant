
class VoiceAssistant {
  constructor() {
    this.isListening = false;
    this.recognition = null;
    this.speechSynthesis = window.speechSynthesis;
    this.utterance = null;
    this.settings = {
      speechRate: 1.0,
      voiceURI: null,
      apiChoice: '',
      apiKey: '',
      useAI: true,
      visionApiKey: '', 
      apiSecret: ''
    };
    this.setupVoiceRecognition();
    this.createFeedbackUI();

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(this.handleMessages.bind(this));

    // Check if we should auto-start (based on stored preference)
    chrome.storage.local.get(['autoStart', 'settings'], result => {
      if (result.settings) {
        this.settings = { ...this.settings, ...result.settings };
      }

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
    this.speak(
      'Your AI assistant has been started and is ready to help you navigate this website.'
    );
    this.showFeedback('AI Assistant activated', 'success');
  }

  setupVoiceRecognition() {
    try {
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
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = event => {
        const rawTranscript =
          event.results[event.results.length - 1][0].transcript.trim();
        this.processCommand(rawTranscript.toLowerCase());
      };

      this.recognition.onerror = event => {
        console.error('Speech recognition error:', event.error);
        this.showFeedback(`Error: ${event.error}. Try again.`, 'error');
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          setTimeout(() => {
            this.recognition.start();
          }, 300);
        }
      };
    } catch (error) {
      console.error('Error setting up speech recognition:', error);
      this.showFeedback('Failed to initialize speech recognition', 'error');
    }
  }

  processCommand(transcript) {
    console.log('Processing command:', transcript);

    if (this.commands[transcript]) {
      this.commands[transcript]();
      return;
    }

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

  getVisibleText(limit) {
    const bodyText = document.body.innerText;
    const visibleText = bodyText.substring(0, limit); // Limit the text to a certain length
    return visibleText;
  }

  async summarizeText(prompt) {
    try {
      const response = await fetch(
        'http://localhost:11434/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'deepseek-r1:1.5b',
            messages: [{ role: 'user', content: prompt }]
          })
        }
      );

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      console.log('response : ', response);
      const data = await response.json();
      console.log('data  : ', data);
      return data.choices[0].message.content; // Adjust based on the response structure
    } catch (error) {
      console.error('Error querying DeepSeek:', error);
      return 'Error querying the model. Please try again later.';
    }
  }

  async readPage() {
    // Select relevant elements
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
    const paragraphs = Array.from(document.querySelectorAll('p'));

    // Combine text from headings and paragraphs
    let combinedText = '';

    // Add headings to the combined text
    headings.forEach(heading => {
      combinedText += heading.innerText + '\n'; // Add a newline for better readability
    });

    // Add paragraphs to the combined text
    paragraphs.forEach(paragraph => {
      combinedText += paragraph.innerText + '\n'; // Add a newline for better readability
    });

    // Limit the text to a certain length
    const visibleText = combinedText.substring(0, 1000);

    const summarizedText = await this.summarizeText(visibleText);

    // Speak the summarized text
    if (summarizedText) {
      this.speak(summarizedText);
      console.log('Summarized text:', summarizedText);
    } else {
      this.speak('No useful content found on this page.');
    }

    // this.describeImagesOnPage();
  }

  async describeImagesOnPage() {
    this.showFeedback('Looking for images to describe...', 'info');
    this.speak('Looking for images to describe');

    const images = Array.from(document.querySelectorAll('img')).filter(
      img => img.complete && img.naturalHeight !== 0
    );
    if (images.length === 0) {
      this.speak('No images found on this page.');
      return;
    }

    for (const img of images) {
      const base64Image = await this.getImageAsBase64(img);
      const description = await this.getImageDescription(base64Image);
      this.speak(description);
    }
  }

  async getImageAsBase64(img) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const base64Data = canvas.toDataURL('image/jpeg').split(',')[1];
      resolve(base64Data);
    });
  }

  async getImageDescription(imageBase64) {
    if (
      this.settings.visionApiChoice === 'imagga' &&
      this.settings.visionApiKey &&
      this.settings.apiSecret
    ) {
      return this.getImaggaDescription(imageBase64);
    } else {
      return 'No image description available.';
    }
  }

  async getImaggaDescription(imageBase64) {
    const apiKey = this.settings.visionApiKey; // Your Imagga API key
    const apiSecret = this.settings.apiSecret; // Your Imagga API secret
    const url =
      'https://api.imagga.com/v2/tags?image_url=' +
      encodeURIComponent(`data:image/jpeg;base64,${imageBase64}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: 'Basic ' + btoa(`${apiKey}:${apiSecret}`)
        }
      });
      c;
      const data = await response.json();
      if (data.result && data.result.tags) {
        const tags = data.result.tags.map(tag => tag.tag).join(', ');
        return `This image contains: ${tags}.`;
      }
      return 'No description available for this image.';
    } catch (error) {
      console.error('Imagga API Error:', error);
      return 'Error retrieving image description.';
    }
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
    window.scrollTo({
      top: window.scrollY - window.innerHeight * 0.7,
      behavior: 'auto'
    });
    this.speak('Scrolling up');
  }

  stopReading() {
    if (this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
      this.speak('Stop reading');
      this.showFeedback('Stopped reading', 'info');
    }
  }

  listCommands() {
    const commandList = Object.keys(this.commands).join(', ');
    this.speak(`Available commands: ${commandList}`);
    this.showFeedback(`Available commands: ${commandList}`, 'info', 10000);
  }

  speak(text) {
    console.log('Speaking:', text);
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
      case 'processCommand': // Add this case
        const command = message.command.toLowerCase();
        this.processCommand(command); // Call the processCommand method
        break;
      default:
        console.log('Unknown action:', message.action);
    }
  }
}

// Initialize the voice assistant when the page loads
const voiceAssistant = new VoiceAssistant();
console.log('Voice Assistant initialized');
