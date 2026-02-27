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

- Python 3.11+
- Google Cloud account with billing enabled
- Google API Key (Gemini API) or Vertex AI access
- Chrome browser (version 116+)

## Setup & Installation

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/accessbot.git
cd accessbot
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp ../.env.example .env
# Edit .env and add your GOOGLE_API_KEY
```

### 3. Run Backend Locally

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

The backend will be available at `ws://localhost:8080/ws`

### 4. Install Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `extension/` directory from this project
5. The AccessBot icon will appear in your toolbar

### 5. Connect and Use

1. Click the AccessBot icon in Chrome toolbar
2. Ensure the backend URL is set to `ws://localhost:8080/ws`
3. Click "Start AccessBot" or press `Alt+A`
4. Grant microphone permission when prompted
5. Start speaking! Try "What's on this page?" or "Click the first link"

## Cloud Deployment

### Deploy to Google Cloud Run

```bash
cd backend

# Set your project ID
export GOOGLE_CLOUD_PROJECT=your-project-id

# Deploy
./deploy.sh
```

After deployment, update the backend URL in the extension settings to the Cloud Run service URL.

### Infrastructure as Code (Terraform)

```bash
cd infra/terraform
terraform init
terraform plan -var="project_id=your-project-id"
terraform apply -var="project_id=your-project-id"
```

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
│   ├── popup/              # Extension popup UI
│   ├── offscreen/          # Audio capture & playback
│   ├── utils/              # WebSocket manager, audio processor
│   └── icons/
├── backend/                # Python Backend
│   ├── main.py             # FastAPI + WebSocket endpoint
│   ├── agent.py            # ADK Agent definition
│   ├── tools/              # Browser action & page analysis tools
│   ├── config.py           # Environment configuration
│   ├── Dockerfile
│   └── deploy.sh           # Cloud Run deployment script
├── infra/                  # Infrastructure as Code
│   └── terraform/
└── docs/                   # Architecture diagrams & docs
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
