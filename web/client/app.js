// Configuration
const DESTINATION = '/public/sigmond-techtarot';
// REPLACE THIS WITH YOUR ACTUAL SIGNALWIRE TOKEN
const STATIC_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiU0FUIiwiY2giOiJwdWMuc2lnbmFsd2lyZS5jb20ifQ..htbs9CftJWJDV5rN.bq37URPcSrpOBSVRczp8QB5Yb84AkDNH4cr1O_U8kIstLT4uJ7BCPaVpE4_qqqviMt7s2owuRRNO9Tx28uXKo7I8i2Df0s5fZm9WrZkgthSwacq8V-9_mPyUMi1Yiha675aZuL2TFot0NrIaiZEt1IEsdEJFtw1SWBie63vUajwMDrY2GU9wN2BozQ6dT_fHUNbNBCbX4lgLaz2lvT0wZ2gf8S0GTCcr799r75h4GY-masEg2-a8CB937Z7UXh1MQhmTbycUQO9v_PSmeRSYL5acz5SMSoMdUd2M4P4QVK3Csyfvd0xJJQkl9tBEenhlI8ipcGsl_YDzvgS6MkLa3FB2NzY8einjHNZ2xYcelifxbC4yzDxHHmjMPmmSuH20zSg7r6VR8IEtVcr0I9Sp6BhKyxoYcivH9IIVhZwF7d618XJE8lWInszxfXBTn_j0zN8Zomgzo7S6-3Ne-_nhvxnIywsoX3Y4tlUx0yrQIljpEsXb2frqryqiv7v94sxqQSHC4UjeG_EgQ5YoUj9yVIgXvZt8J7_5CTL7Pg2jtsytjJecLOLqYdIWupEtkNdE-fhANQMweoamjcXmboeL50AzTYFq.yKhygR6oYAam-9Pe44RSBw';
const BASE_URL = '..';

let client;
let call;
let cardsRevealed = false;
let isMuted = false;
// v4: track every RxJS Subscription so teardown can unsubscribe them all
let subscriptions = [];
let currentLocalStream = null;
let remoteVideoEl = null;
let lastRemoteSig = '';
let teardownDone = false;
const cards = {
    past: null,
    present: null,
    future: null
};

// UI Elements
const connectBtn = document.getElementById('connectBtn');
const hangupBtn = document.getElementById('hangupBtn');
const muteBtn = document.getElementById('muteBtn');
const startMutedCheckbox = document.getElementById('startMuted');
const showLogCheckbox = document.getElementById('showLog');
const statusDiv = document.getElementById('status');
const eventLog = document.getElementById('event-log');
const eventLogHeader = document.getElementById('event-log-header');
const eventEntries = document.getElementById('event-entries');

// Event logging with circular reference handling
function logEvent(message, data = null, isUserEvent = false) {
    const entry = document.createElement('div');
    entry.className = isUserEvent ? 'event-entry user-event' : 'event-entry';
    const time = new Date().toLocaleTimeString();

    let dataStr = '';
    if (data) {
        try {
            // Handle circular references
            const seen = new WeakSet();
            dataStr = JSON.stringify(data, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) {
                        return '[Circular Reference]';
                    }
                    seen.add(value);
                }
                return value;
            }, 2);
        } catch (e) {
            dataStr = 'Error serializing data: ' + e.message;
        }
    }

    entry.innerHTML = `
        <div class="event-time">${time}</div>
        <div>${isUserEvent ? '🔴 USER EVENT: ' : ''}${message}</div>
        ${dataStr ? `<div style="color: #888; margin-left: 10px;">${dataStr}</div>` : ''}
    `;
    eventEntries.appendChild(entry);
    eventEntries.scrollTop = eventEntries.scrollHeight;
}

// Prepare the "Ready to connect" state (no dialing yet)
async function initializeClient() {
    try {
        statusDiv.textContent = 'Ready to connect';
        logEvent('Client ready - click Connect to dial');
    } catch (error) {
        logEvent('Initialization error', { error: error.message });
        statusDiv.textContent = 'Initialization failed';
    }
}

// --- v4 helpers ---------------------------------------------------------

// Track an RxJS subscription for later teardown
function track(sub) {
    if (sub) subscriptions.push(sub);
    return sub;
}

// Build a stable signature for a stream's track set (kind:id, sorted)
function streamSignature(stream) {
    return stream.getTracks().map(t => t.kind + ':' + t.id).sort().join(',');
}

// Gate the dial on the client actually connecting.
// isConnected$ replays synchronously on subscribe (settle via flag, defer the
// unsubscribe) and never errors on bad creds (add a timeout or the UI hangs).
function waitForConnected(swClient, timeoutMs) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let sub = null;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            if (sub) { try { sub.unsubscribe(); } catch (e) {} }
            reject(new Error('Timed out waiting for SignalWire connection'));
        }, timeoutMs);
        sub = swClient.isConnected$.subscribe(connected => {
            if (connected && !settled) {
                settled = true;
                clearTimeout(timer);
                setTimeout(() => { if (sub) { try { sub.unsubscribe(); } catch (e) {} } }, 0);
                resolve();
            }
        });
    });
}

// Render the remote (Sigmond avatar) stream ourselves. Leave it UNMUTED — it
// carries the remote audio, and connect is user-gesture-initiated so
// autoplay-with-sound is allowed. Re-attach whenever the track set changes: the
// SDK re-emits the same MediaStream as tracks arrive and Chromium may otherwise
// never render a late video track.
function attachRemoteStream(stream) {
    if (!stream) return;
    const container = document.getElementById('video-container');
    if (!container) return;

    if (!remoteVideoEl) {
        remoteVideoEl = document.createElement('video');
        remoteVideoEl.autoplay = true;
        remoteVideoEl.playsInline = true;
        remoteVideoEl.setAttribute('playsinline', '');
        remoteVideoEl.style.width = '100%';
        remoteVideoEl.style.height = '100%';
        remoteVideoEl.style.objectFit = 'cover';
        container.appendChild(remoteVideoEl);
    }

    const sig = streamSignature(stream);
    if (sig !== lastRemoteSig) {
        lastRemoteSig = sig;
        remoteVideoEl.srcObject = stream;
        remoteVideoEl.play().catch(err =>
            logEvent('Remote video play() blocked', { error: err.message }));
        logEvent('Remote stream attached', { tracks: sig });
    }
}

// Local self-preview. MUTED so the seeker never monitors their own mic.
function attachLocalStream(stream) {
    currentLocalStream = stream || null;
    if (!stream) return;
    const localVideoContainer = document.getElementById('local-video-container');
    const localVideo = document.getElementById('local-video');
    if (localVideo && localVideo.srcObject !== stream) {
        localVideo.srcObject = stream;
        localVideo.muted = true;
        if (localVideo.play) localVideo.play().catch(() => {});
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length) {
            const s = videoTracks[0].getSettings();
            logEvent('Local video preview started', {
                label: videoTracks[0].label, width: s.width, height: s.height
            });
        }
    }
    if (localVideoContainer) {
        localVideoContainer.style.display = 'block';
        localVideoContainer.classList.add('connected');
    }
}

// UI transition when the call reaches 'connected'
function onConnected() {
    statusDiv.textContent = 'Connected to Sigmond';
    connectBtn.style.display = 'none';
    hangupBtn.style.display = 'inline-block';
    muteBtn.style.display = 'inline-block';

    const controlsContainer = document.querySelector('.controls-container');
    if (controlsContainer) controlsContainer.classList.add('connected');

    // Make buttons ultra compact on mobile
    if (window.innerWidth <= 768) {
        hangupBtn.textContent = '✕';
        muteBtn.textContent = '🔇';
    }

    // Hide the deck placeholder
    const deckPlaceholder = document.getElementById('deck-placeholder');
    if (deckPlaceholder) deckPlaceholder.style.display = 'none';

    // Honor "start muted" once we are connected
    if (startMutedCheckbox && startMutedCheckbox.checked && !isMuted) {
        toggleMute();
    }
}

// --- Connection (v4) ----------------------------------------------------

async function connectToCall() {
    try {
        // Disable button and show connecting state
        connectBtn.disabled = true;
        connectBtn.textContent = '⏳ Connecting...';
        connectBtn.style.cssText = 'background: linear-gradient(45deg, #808080, #606060) !important;';

        // Reset per-connection state
        eventEntries.innerHTML = '';
        teardownDone = false;
        subscriptions = [];
        remoteVideoEl = null;
        lastRemoteSig = '';
        currentLocalStream = null;
        logEvent('Starting new connection...');

        if (!STATIC_TOKEN || STATIC_TOKEN === 'YOUR_SIGNALWIRE_TOKEN_HERE') {
            throw new Error('Please update STATIC_TOKEN with your actual SignalWire token');
        }

        // UMD global is window.SignalWire
        const SignalWireSDK = window.SignalWire || SignalWire;
        if (!SignalWireSDK || typeof SignalWireSDK.SignalWire !== 'function') {
            throw new Error('SignalWire v4 SDK not loaded');
        }

        statusDiv.textContent = 'Initializing client...';
        logEvent('Using static token', { tokenLength: STATIC_TOKEN.length });

        // v4: constructor auto-connects; class, not factory. A guest SAT works as
        // a plain bearer via StaticCredentialProvider.
        client = new SignalWireSDK.SignalWire(
            new SignalWireSDK.StaticCredentialProvider({ token: STATIC_TOKEN })
        );

        // v4: surface SDK errors/warnings (replaces logLevel: 'debug')
        track(client.errors$.subscribe(e =>
            logEvent('SDK error', { code: e && e.code, message: e && e.message })));
        track(client.warnings$.subscribe(w =>
            logEvent('SDK warning', { code: w && w.code, message: w && w.message })));

        statusDiv.textContent = 'Connecting to SignalWire...';
        await waitForConnected(client, 15000);
        logEvent('Client connected');

        statusDiv.textContent = 'Dialing...';
        // video: true  -> send the seeker's camera (the agent has vision enabled and
        //                 comments on the seeker's appearance via get_visual_input)
        // receiveVideo  -> receive Sigmond's avatar video
        call = await client.dial(DESTINATION, {
            audio: true,
            video: true,
            receiveAudio: true,
            receiveVideo: true,
            userVariables: {
                userName: 'Tarot Reader',
                interface: 'sw-js-v4-static',
                extension: 'sigmond_tarot'
            }
        });
        logEvent('Dial initiated', { destination: DESTINATION });

        // Remote avatar video + audio
        track(call.remoteStream$.subscribe(stream => attachRemoteStream(stream)));

        // Local self-preview
        track(call.localStream$.subscribe(stream => attachLocalStream(stream)));

        // Single user_event subscription. SWML user_event wraps its payload under
        // `.event`; add_action('user_event', {...}) would be flat — tolerate both.
        track(call.subscribe('user_event').subscribe(evt => {
            const params = (evt && evt.params) ? evt.params : evt;
            const payload = (params && params.event) ? params.event : params;
            logEvent('user_event', payload, true);
            handleUserEvent(payload);
        }));

        // Call lifecycle
        track(call.status$.subscribe({
            next: (status) => {
                logEvent('call.status', { status });
                if (status === 'connected') {
                    onConnected();
                } else if (status === 'disconnected' || status === 'failed' || status === 'destroyed') {
                    handleDisconnect();
                }
            },
            // The SDK completes the subject on destroy, sometimes without a
            // terminal status — treat completion as a teardown too.
            complete: () => handleDisconnect()
        }));

    } catch (error) {
        logEvent('Connection error', { error: error.message });
        statusDiv.textContent = 'Connection failed: ' + error.message;
        handleDisconnect();
    }
}

function handleDisconnect() {
    if (teardownDone) return;
    teardownDone = true;

    // Unsubscribe every tracked RxJS subscription
    subscriptions.forEach(s => { try { s.unsubscribe(); } catch (e) {} });
    subscriptions = [];

    // Local preview cleanup — tracks are owned by the call, so just detach
    const localVideoContainer = document.getElementById('local-video-container');
    const localVideo = document.getElementById('local-video');
    if (localVideo && localVideo.srcObject) {
        localVideo.srcObject = null;
    }
    if (localVideoContainer) {
        localVideoContainer.style.display = 'none';
        localVideoContainer.classList.remove('connected');
    }
    currentLocalStream = null;

    // Remote video cleanup
    const videoContainer = document.getElementById('video-container');
    if (videoContainer) {
        videoContainer.querySelectorAll('video').forEach(v => {
            v.srcObject = null;
            v.remove();
        });
    }
    remoteVideoEl = null;
    lastRemoteSig = '';

    // Disconnect the client
    if (client) {
        try { client.disconnect(); } catch (e) {}
        client = null;
    }
    call = null;

    statusDiv.textContent = 'Disconnected';
    // Reset connect button
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect';
    connectBtn.style.cssText = '';
    connectBtn.style.display = 'inline-block';
    hangupBtn.style.display = 'none';
    muteBtn.style.display = 'none';
    muteBtn.textContent = 'Mute';
    isMuted = false;
    clearCards();

    // Remove connected class to restore normal spacing
    const controlsContainer = document.querySelector('.controls-container');
    if (controlsContainer) controlsContainer.classList.remove('connected');

    // Restore button text
    hangupBtn.textContent = 'Leave';
    muteBtn.textContent = 'Mute';

    // Show the deck placeholder again
    const deckPlaceholder = document.getElementById('deck-placeholder');
    if (deckPlaceholder) deckPlaceholder.style.display = 'block';

    logEvent('Disconnected - ready for new connection');
}

async function hangup() {
    if (call) {
        try {
            await call.hangup();
        } catch (e) {
            logEvent('Hangup error', { error: e.message });
        }
    }
    handleDisconnect();
}

function handleUserEvent(eventData) {
    logEvent('Processing user event', eventData, true);

    // Also log to console for debugging
    console.log('🎯 USER EVENT RECEIVED IN HANDLER:');
    console.log('Event Data:', eventData);
    console.log('Event Type:', eventData?.type);
    console.log('Event Payload:', eventData?.payload);
    console.log('Full Event Object:', JSON.stringify(eventData, null, 2));
    console.log('----------------------------');

    if (eventData.type === 'show_tarot_cards' && eventData.reading) {
        console.log('📋 Showing tarot cards:', eventData.reading);
        logEvent('Showing tarot cards', null, true);
        if (!cardsRevealed) {
            revealCardArea();
        }
        setTimeout(() => {
            dealCards(eventData.reading);
        }, cardsRevealed ? 0 : 800);
    } else if (eventData.type === 'flip_card') {
        console.log('🔄 Flipping card:', eventData.position);
        logEvent(`Flipping ${eventData.position} card`, null, true);
        flipCard(eventData.position);
    } else if (eventData.type === 'clear_cards') {
        console.log('🧹 Clearing cards');
        logEvent('Clearing cards', null, true);
        clearCards();
    } else {
        console.log('❓ Unknown user event type:', eventData.type);
        logEvent(`Unknown event type: ${eventData.type}`, null, true);
    }
}

function dealCards(reading) {
    const positions = ['past', 'present', 'future'];

    positions.forEach((position, index) => {
        setTimeout(() => {
            if (reading[position]) {
                createCard(position, reading[position]);
                // Automatically flip the card after a short delay
                setTimeout(() => {
                    flipCard(position);
                }, 400);
            }
        }, index * 600);
    });
}

function createCard(position, cardData) {
    const slot = document.getElementById(`${position}-slot`);
    const placeholder = slot.querySelector('.card-placeholder');

    // Remove existing card if present
    const existingCard = document.getElementById(`${position}-card`);
    if (existingCard) {
        existingCard.remove();
    }

    cards[position] = cardData;

    // Log card data for debugging
    logEvent(`Creating ${position} card`, {
        name: cardData.name,
        image: cardData.image,
        reversed: cardData.reversed
    });

    const card = document.createElement('div');
    card.className = 'tarot-card dealing';
    card.id = `${position}-card`;

    const cardBack = document.createElement('div');
    cardBack.className = 'card-face card-back';

    const cardFront = document.createElement('div');
    cardFront.className = 'card-face card-front';

    // Construct the full image URL
    const imageUrl = cardData.image.startsWith('http') ? cardData.image : `${BASE_URL}/${cardData.image}`;

    // Log the constructed URL
    logEvent(`Image URL for ${position}`, { url: imageUrl });

    // Apply rotation if card is reversed (upside down) - combine with scale
    const imageStyle = cardData.reversed ? 'transform: scale(1.06) rotate(180deg);' : '';

    cardFront.innerHTML = `
        <img class="card-image${cardData.reversed ? ' reversed' : ''}" src="${imageUrl}" alt="${cardData.name}" style="${imageStyle}"
             onload="console.log('Image loaded:', '${imageUrl}')"
             onerror="console.log('Image failed:', '${imageUrl}'); this.src='data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"150\" viewBox=\"0 0 100 150\"%3E%3Crect width=\"100\" height=\"150\" fill=\"%23ddd\"%2F%3E%3Ctext x=\"50\" y=\"75\" text-anchor=\"middle\" fill=\"%23666\" font-size=\"12\"%3E${encodeURIComponent(cardData.name)}%3C/text%3E%3C/svg%3E'">
    `;

    card.appendChild(cardBack);
    card.appendChild(cardFront);

    placeholder.style.display = 'none';
    slot.appendChild(card);
}

function flipCard(position) {
    const card = document.getElementById(`${position}-card`);
    if (card) {
        // Toggle the flip state
        card.classList.toggle('flipped');
    }
}

function revealCardArea() {
    const tarotTable = document.getElementById('tarot-table');

    tarotTable.classList.remove('hidden');
    tarotTable.classList.add('visible');
    cardsRevealed = true;
}

function hideCardArea() {
    const tarotTable = document.getElementById('tarot-table');

    tarotTable.classList.remove('visible');
    tarotTable.classList.add('hidden');
    cardsRevealed = false;
}

function clearCards() {
    ['past', 'present', 'future'].forEach(position => {
        const slot = document.getElementById(`${position}-slot`);
        const card = document.getElementById(`${position}-card`);
        const placeholder = slot.querySelector('.card-placeholder');

        if (card) {
            card.remove();
        }
        if (placeholder) {
            placeholder.style.display = 'flex';
        }

        cards[position] = null;
    });
    setTimeout(() => {
        hideCardArea();
    }, 1000);
}

// Mute/unmute — v4: server-side self.mute()/unmute() with a local-track fallback
async function toggleMute() {
    try {
        if (!call) {
            logEvent('No active call to mute');
            return;
        }
        const wantMuted = !isMuted;
        let ok = false;
        try {
            if (wantMuted) {
                await call.self.mute();
            } else {
                await call.self.unmute();
            }
            ok = true;
        } catch (e) {
            logEvent('Server mute failed, falling back to local track', { error: e.message });
        }

        if (!ok) {
            // Local fallback: toggle the outbound audio tracks
            const stream = currentLocalStream;
            const tracks = stream ? stream.getAudioTracks() : [];
            tracks.forEach(t => { t.enabled = !wantMuted; });
        }

        isMuted = wantMuted;
        const controlPanel = document.getElementById('control-panel');
        if (window.innerWidth <= 768 && controlPanel && controlPanel.classList.contains('connected')) {
            muteBtn.textContent = isMuted ? '🔊' : '🔇';
        } else {
            muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
        }
        logEvent(isMuted ? 'Microphone muted' : 'Microphone unmuted');
    } catch (error) {
        logEvent('Mute toggle error', { error: error.message });
    }
}

// Event listeners
connectBtn.addEventListener('click', connectToCall);
hangupBtn.addEventListener('click', hangup);
muteBtn.addEventListener('click', toggleMute);

// Toggle event log visibility based on checkbox
showLogCheckbox.addEventListener('change', () => {
    if (showLogCheckbox.checked) {
        eventLog.style.display = 'block';
    } else {
        eventLog.style.display = 'none';
    }
});

// Toggle event log collapsed state
eventLogHeader.addEventListener('click', () => {
    eventLog.classList.toggle('collapsed');
});

// Initialize on load (but don't connect)
window.addEventListener('load', () => {
    logEvent('Page loaded');
    initializeClient();
});
