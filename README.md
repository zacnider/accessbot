# AccessBot - AI-Powered Voice Web Navigator for Visually Impaired Users

AccessBot is an AI-powered Chrome extension that helps visually impaired users navigate the web using natural voice commands. It uses Google's Gemini Live API to analyze screenshots in real-time, understand user voice commands, and execute browser actions autonomously.

**Category:** UI Navigator | **Hackathon:** Gemini Live Agent Challenge

## Features

- **Voice Navigation** - Speak naturally to browse the web. "Go to Google", "Click the search button", "Scroll down"
- **Screen Analysis** - Gemini AI visually analyzes each page and describes content, layout, and interactive elements
- **Smart Actions** - Click buttons, fill forms, scroll pages, and navigate links through voice commands
- **Interruption Support** - Interrupt the assistant at any time with a new command (barge-in)
- **Multi-language** - Speak in Turkish, English, German, or any supported language
- **Form Assistance** - Step-by-step voice-guided form filling
- **Visual Highlighting** - Active elements are visually highlighted for low-vision users
- **Keyboard Shortcuts** - `Alt+A` to toggle, `Alt+S` to describe current page

## Architecture

```
Chrome Extension (Frontend)
  |-- Service Worker (WebSocket + Screenshot 1FPS + Audio stream)
  |-- Content Script (DOM actions: click, scroll, type, navigate)
  |-- Offscreen Document (Microphone capture + Audio playback)
  |
  | WebSocket (audio PCM 16kHz + screenshots JPEG + action results)
  v
Python Backend (FastAPI + Google ADK) -- Google Cloud Run
  |-- ADK Runner + Agent (bidi-streaming)
  |-- LiveRequestQueue (audio + image blobs)
  |-- Tool definitions (click, scroll, type, navigate, page analysis)
  |
  | ADK run_live()
  v
Gemini 2.0 Flash Live API
  |-- Real-time screenshot analysis
  |-- Voice input/output (natural conversation)
  |-- Function calling (browser action commands)
  |-- VAD + Barge-in (interruption handling)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Model | Gemini 2.0 Flash (Live API) |
| Agent Framework | Google ADK (Agent Development Kit) |
| Backend | Python + FastAPI + WebSocket |
| Hosting | Google Cloud Run |
| Frontend | Chrome Extension (Manifest V3) |
| Audio | WebAudio API + AudioWorklet (PCM 16kHz/24kHz) |
| Screenshots | chrome.tabs.captureVisibleTab (JPEG, 1 FPS) |

## Prerequisites

- Chrome browser (version 116+)
- A free Gemini API key from [AI Studio](https://aistudio.google.com/apikey)

## Reproducible Testing Instructions

### Step 1: Get a Gemini API Key

1. Go to [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated key

### Step 2: Install the Chrome Extension

1. Clone this repository:
   ```bash
   git clone https://github.com/zacnider/accessbot.git
   cd accessbot
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **"Developer mode"** (top right toggle)
4. Click **"Load unpacked"**
5. Select the `extension/` folder from this project
6. The AccessBot icon will appear in your toolbar

### Step 3: Configure and Start

1. Click the AccessBot icon to open the Side Panel
2. Paste your **Gemini API Key** in the Settings section
3. Choose your preferred **language** and **speech rate**
4. Click **"Start AccessBot"** or press `Alt+A`
5. Grant **microphone permission** when prompted

### Step 4: Test the Features

Try these voice commands on any webpage:

| Test | What to Say | Expected Result |
|------|------------|-----------------|
| Page Description | "What's on this page?" | AI describes the visible content |
| Read Content | "Read the main text" | AI reads the page text aloud |
| Click Element | "Click the search button" | AI finds and clicks the element |
| Navigate | "Go to wikipedia.org" | Browser navigates to the URL |
| Scroll | "Scroll down" | Page scrolls down |
| Tab Management | "What tabs do I have open?" | AI lists all open tabs |
| Form Fill | "Type hello in the search box" | AI types text into the field |

You can also use the **quick action buttons** in the Side Panel:
- **Describe** - Captures and describes the current page
- **Read** - Reads all text content on the page
- **Elements** - Lists all interactive elements (buttons, links, inputs)
- **Tabs** - Shows all open browser tabs

### Step 5: Run Backend Locally (Optional)

The extension connects to our hosted Cloud Run backend by default. To run locally:

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

Then update `BACKEND_URL` in `extension/service-worker.js` to `ws://localhost:8080/ws`.

## Voice Commands (Examples)

| Command | Action |
|---------|--------|
| "What's on this page?" | Describes the current page |
| "Read the headings" | Lists all headings on the page |
| "Click the login button" | Finds and clicks the login button |
| "Scroll down" | Scrolls down the page |
| "Go to google.com" | Navigates to Google |
| "Type hello in the search box" | Types text in a search field |
| "Go back" | Returns to the previous page |
| "What links are available?" | Lists clickable links |
| "Fill in the form" | Starts guided form filling |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+A` | Toggle AccessBot on/off |
| `Alt+S` | Describe current page |

## Project Structure

```
accessbot/
├── extension/              # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── service-worker.js   # WebSocket, screenshots, audio routing
│   ├── content-script.js   # DOM actions & page analysis
│   ├── sidepanel/          # Side Panel UI (settings, transcript)
│   ├── offscreen/          # Audio capture & playback
│   ├── utils/              # WebSocket manager, audio processor
│   └── icons/
├── backend/                # Python Backend (Cloud Run)
│   ├── main.py             # FastAPI + WebSocket + ADK Agent
│   ├── Dockerfile
│   └── requirements.txt
└── README.md
```

## Technologies Used

- **Google Gemini 2.0 Flash Live API** - Real-time multimodal AI (vision + audio)
- **Google ADK** - Agent Development Kit for building AI agents
- **Google Cloud Run** - Serverless container hosting with WebSocket support
- **FastAPI** - Modern Python web framework with WebSocket support
- **Chrome Extension Manifest V3** - Modern Chrome extension platform
- **WebAudio API** - Low-latency audio processing in the browser

## License

MIT License

---

Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) hackathon.
