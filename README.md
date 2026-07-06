# SignalWire Tarot Reading Application

A mystical tarot reading application featuring Sigmond, an AI-powered tarot reader that provides three-card readings (Past, Present, Future) using a tech-themed tarot deck.

## Overview

This application combines SignalWire's AI Agent technology with WebRTC video calling to create an interactive tarot reading experience. Users connect via video call to Sigmond, who performs personalized tarot readings using a custom tech-themed deck.

## Features

- **AI-Powered Tarot Reader**: Sigmond uses ElevenLabs' Adam voice for a mystical experience
- **Three-Card Spread**: Traditional Past, Present, Future reading format
- **Tech-Themed Tarot Deck**: Custom deck featuring programming and technology concepts
- **Interactive Web Interface**: Real-time card display with flip animations
- **Video Call Integration**: Face-to-face readings via SignalWire WebRTC
- **Mute Controls**: Option to start muted or toggle mute during the call
- **Event Logging**: Optional debug log for monitoring call events

## Project Structure

```
tarot/
├── bot/                        # Bot implementation
│   ├── sigmond_tarot_steps.py # Main AI agent
│   ├── bot.sh                  # Control script for starting/stopping
│   └── signalwire_ai_knowledge_prompt.md # SignalWire knowledge base
├── web/                        # Web interface and media files
│   ├── client/                 # Frontend application
│   │   ├── index.html          # Main UI
│   │   ├── app.js              # JavaScript logic
│   │   └── signalwire.js       # SignalWire SDK
│   ├── card_images/            # Tarot card images
│   │   ├── Major/              # Major Arcana cards
│   │   ├── CloudDevelopers/
│   │   ├── Docker/
│   │   ├── FreeSWITCHDevs/
│   │   ├── Linux/
│   │   └── tarot_back.jpg      # Card back design
│   ├── tarot_deck.json         # Card definitions and meanings
│   ├── sigmond_tarot_idle.mp4  # Dealer idle video
│   ├── sigmond_tarot_talking.mp4 # Dealer talking video
│   └── bgmusic.mp3             # Background music
└── README.md                   # This file
```

## Setup

### Environment Variables

**Required**:
- `TAROT_WEB_ROOT`: URL where tarot media files are hosted (e.g., `https://your-domain.com/path/to/tarot`)

**Optional**:
- `TAROT_POST_PROMPT_URL`: URL for post-prompt webhook (if you want conversation summaries)
- `SWML_DEV_USERNAME`: Basic auth username (defaults to auto-generated)
- `SWML_DEV_PASSWORD`: Basic auth password (defaults to auto-generated)

### Running with HTTPS

To run the bot with HTTPS enabled, set the following environment variables:

```bash
export SWML_SSL_ENABLED=true
export SWML_SSL_CERT_PATH=/path/to/cert.pem
export SWML_SSL_KEY_PATH=/path/to/key.pem
export SWML_DOMAIN=yourdomain.com
```

The SignalWire Agents SDK provides comprehensive security features including:
- SSL/TLS encryption
- Basic authentication (enabled by default)
- HSTS headers
- CORS configuration
- Rate limiting
- Request size limits

For complete security configuration options, see the [SignalWire Python SDK documentation](https://github.com/signalwire/signalwire-python).

### Bot Setup

1. Navigate to the bot directory:
   ```bash
   cd bot
   ```

2. Install dependencies:
   ```bash
   pip install signalwire-sdk
   ```

3. Set required environment variable:
   ```bash
   export TAROT_WEB_ROOT="https://your-domain.com/path/to/tarot"
   ```

4. Run Sigmond using the control script:
   ```bash
   ./bot.sh start    # Start Sigmond on default port
   ./bot.sh restart  # Restart Sigmond
   ./bot.sh status   # Check if Sigmond is running
   ./bot.sh logs     # View logs
   ./bot.sh stop     # Stop Sigmond
   ```

   Or run directly:
   ```bash
   # HTTP mode (default)
   python sigmond_tarot_steps.py --port 3000
   
   # HTTPS mode
   export SWML_SSL_ENABLED=true
   export SWML_SSL_CERT_PATH=/path/to/cert.pem
   export SWML_SSL_KEY_PATH=/path/to/key.pem
   export SWML_DOMAIN=yourdomain.com
   python sigmond_tarot_steps.py --port 3000
   ```

### Web Interface Setup

1. Update the SignalWire token in `web/client/app.js`:
   ```javascript
   const STATIC_TOKEN = 'YOUR_SIGNALWIRE_TOKEN_HERE';
   ```

2. Serve the web directory using any web server:
   ```bash
   cd web
   python -m http.server 8080
   ```

3. Access the application at `http://localhost:8080/client/`

## How It Works

1. **User Connection**: Users click "Connect to Sigmond" to initiate a video call
2. **Introduction**: Sigmond introduces himself and explains the reading process
3. **Card Drawing**: When ready, Sigmond draws three cards using the `draw_cards` function
4. **Visual Display**: Cards appear on screen with dealing animations
5. **Interpretation**: Sigmond interprets each card considering:
   - Card position (Past/Present/Future)
   - Upright or reversed orientation
   - Tech-themed symbolism
6. **Interactive Elements**: Users can click cards to flip them back and forth

## Tarot Deck

The tech-themed tarot deck includes:
- **Major Arcana**: Technology concepts like "The Debugger", "Lord of Legacy Code", "Infinite Loop"
- **Minor Arcana Suits**:
  - **Cloud Developers**: Representing ideas and communication
  - **Docker**: Representing emotions and containers
  - **FreeSWITCH Devs**: Representing material concerns
  - **Linux**: Representing action and energy

Each card includes upright and reversed meanings tailored to technology themes.

## Configuration

- **Bot Port**: Configure with `--port` flag (default: 3000)
- **SignalWire Token**: Update `STATIC_TOKEN` in app.js
- **Destination**: Update `DESTINATION` in app.js for SignalWire routing
- **Card Images**: Uses relative paths (../card_images from client directory)

## Features in Detail

### Mute Functionality
- Checkbox to start calls muted
- Toggle mute button during calls
- Uses native WebRTC audio track control

### Event Logging
- Optional debug log checkbox
- Shows SignalWire events and user interactions
- Collapsible interface

### Card Display
- Automatic card flipping after dealing
- Click cards to toggle between front and back
- Reversed cards display upside-down
- Smooth animations and transitions

## Technical Details

- **SignalWire SDK**: Uses Fabric API for WebRTC connections
- **AI Agent**: Python-based using SignalWire Agents framework
- **Voice**: ElevenLabs Adam voice for natural speech
- **SWML**: SignalWire Markup Language for user events
- **Frontend**: Vanilla JavaScript with responsive CSS

## Learning Resources

For more information on SignalWire technologies:
- [SignalWire Python SDK (GitHub)](https://github.com/signalwire/signalwire-python) - Unified Python SDK for building AI agents
- [SignalWire AI Documentation](https://developer.signalwire.com/ai/) - AI Agent guides and tutorials
- [SWML Documentation](https://developer.signalwire.com/swml/) - SignalWire Markup Language reference
- [Browser SDK Documentation](https://developer.signalwire.com/sdks/browser-sdk/) - JavaScript SDK for WebRTC