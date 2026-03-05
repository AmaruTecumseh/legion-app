// ============================================
// VOICE MOD v1.0
// Text-to-Speech via Web Speech API (zero download)
// Speech-to-text input via SpeechRecognition API
// Multiple voice personalities
// ============================================
(function() {
'use strict';

const VoiceMod = {
    synth: window.speechSynthesis,
    recognition: null,
    voices: [],
    selectedVoice: null,
    isSpeaking: false,
    isListening: false,
    rate: 0.95,
    pitch: 1.0,
    volume: 1.0,
    autoSpeak: false,

    voiceProfiles: [
        { name: 'Warm (Default)',    rateAdj: 0,     pitchAdj: 0,    desc: 'Natural, friendly' },
        { name: 'Deep Sage',         rateAdj: -0.15, pitchAdj: -0.2, desc: 'Slow, authoritative' },
        { name: 'Energetic',         rateAdj: 0.2,   pitchAdj: 0.1,  desc: 'Fast, upbeat' },
        { name: 'Glitchy Bot',       rateAdj: 0.1,   pitchAdj: 0.3,  desc: 'Robotic, clipped' },
        { name: 'Whisperer',         rateAdj: -0.1,  pitchAdj: -0.1, desc: 'Soft, quiet' },
    ],
    activeProfile: 0,

    async init() {
        LEGION.log('Voice: init');
        if (!this.synth) { LEGION.log('Voice: TTS not supported'); return; }

        // Load voices
        this.voices = this.synth.getVoices();
        if (this.voices.length === 0) {
            this.synth.addEventListener('voiceschanged', () => {
                this.voices = this.synth.getVoices();
                this._pickBestVoice();
            });
        } else {
            this._pickBestVoice();
        }

        // Setup speech recognition if available
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
            this.recognition = new SR();
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
        }

        // Listen for LEGION chat events to auto-speak
        document.addEventListener('legion-response', (e) => {
            if (this.autoSpeak && e.detail && e.detail.text) {
                this.speak(e.detail.text);
            }
        });
    },

    _pickBestVoice() {
        // Prefer English voices, prefer "enhanced" or "premium" quality
        const eng = this.voices.filter(v => v.lang.startsWith('en'));
        this.selectedVoice = eng.find(v => v.name.includes('Enhanced') || v.name.includes('Premium'))
            || eng.find(v => v.localService)
            || eng[0]
            || this.voices[0]
            || null;
        LEGION.log('Voice: selected', this.selectedVoice?.name);
    },

    speak(text, profile) {
        if (!this.synth) return;
        this.synth.cancel();

        const p = this.voiceProfiles[profile !== undefined ? profile : this.activeProfile];
        const cleanText = text
            .replace(/```[\s\S]*?```/g, 'code block omitted')
            .replace(/[#*`_~]/g, '')
            .replace(/https?:\/\/\S+/g, 'link')
            .slice(0, 800); // Don't read huge blocks

        const utt = new SpeechSynthesisUtterance(cleanText);
        if (this.selectedVoice) utt.voice = this.selectedVoice;
        utt.rate   = Math.max(0.1, Math.min(2, this.rate + (p?.rateAdj || 0)));
        utt.pitch  = Math.max(0, Math.min(2, this.pitch + (p?.pitchAdj || 0)));
        utt.volume = this.volume;

        utt.onstart = () => {
            this.isSpeaking = true;
            LEGION.blob && LEGION.blob.setEnergy(0.7);
            this._updateSpeakBtn(true);
        };
        utt.onend = utt.onerror = () => {
            this.isSpeaking = false;
            LEGION.blob && LEGION.blob.setEnergy(0);
            this._updateSpeakBtn(false);
        };

        this.synth.speak(utt);
    },

    stopSpeaking() {
        if (this.synth) this.synth.cancel();
        this.isSpeaking = false;
        this._updateSpeakBtn(false);
    },

    startListening(onResult, onEnd) {
        if (!this.recognition) return;
        this.recognition.onresult = (e) => {
            const transcript = Array.from(e.results)
                .map(r => r[0].transcript).join('');
            const isFinal = e.results[e.results.length - 1].isFinal;
            if (onResult) onResult(transcript, isFinal);
        };
        this.recognition.onend = () => {
            this.isListening = false;
            if (onEnd) onEnd();
        };
        this.recognition.onerror = (e) => {
            this.isListening = false;
            LEGION.log('Speech recognition error:', e.error);
            if (onEnd) onEnd();
        };
        this.recognition.start();
        this.isListening = true;
    },

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
        }
    },

    _updateSpeakBtn(speaking) {
        const btn = document.getElementById('voice-speak-toggle');
        if (btn) {
            btn.textContent = speaking ? '&#x23F9; Stop' : '&#x25B6; Test Speak';
            btn.classList.toggle('active', speaking);
        }
    },

    async render() {
        const container = document.getElementById('mod-content');
        const ttsSupported = !!this.synth;
        const sttSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        const voiceList = this.voices.filter(v => v.lang.startsWith('en')).slice(0, 20);

        container.innerHTML = `
            <div class="voice-mod">
                <div class="voice-topbar">
                    <h2>&#x1F50A; Voice</h2>
                    <div id="local-model-status" class="model-status-badge" data-status="${LEGION.inference?.getStatus?.() || 'idle'}">
                        ${this._modelStatusText()}
                    </div>
                </div>

                <div class="voice-section">
                    <div class="voice-section-title">Text-to-Speech ${ttsSupported ? '<span class="badge-ok">Available</span>' : '<span class="badge-no">Not supported</span>'}</div>
                    ${ttsSupported ? `
                        <div class="voice-row">
                            <label class="voice-label">Voice Profile</label>
                            <select id="voice-profile-select" class="voice-select">
                                ${this.voiceProfiles.map((p,i) => `<option value="${i}" ${i===this.activeProfile?'selected':''}>${p.name} — ${p.desc}</option>`).join('')}
                            </select>
                        </div>
                        <div class="voice-row">
                            <label class="voice-label">System Voice</label>
                            <select id="voice-system-select" class="voice-select">
                                ${voiceList.length > 0 ? voiceList.map(v => `<option value="${v.name}" ${this.selectedVoice?.name===v.name?'selected':''}>${v.name}</option>`).join('') : '<option>Loading voices...</option>'}
                            </select>
                        </div>
                        <div class="voice-row">
                            <label class="voice-label">Speed <span id="rate-val">${this.rate.toFixed(1)}x</span></label>
                            <input type="range" id="voice-rate" min="0.5" max="2" step="0.05" value="${this.rate}" class="voice-slider">
                        </div>
                        <div class="voice-row">
                            <label class="voice-label">Pitch <span id="pitch-val">${this.pitch.toFixed(1)}</span></label>
                            <input type="range" id="voice-pitch" min="0.5" max="1.5" step="0.05" value="${this.pitch}" class="voice-slider">
                        </div>
                        <div class="voice-row">
                            <label class="voice-label">Auto-speak responses</label>
                            <button class="s-toggle ${this.autoSpeak?'on':''}" id="auto-speak-toggle"></button>
                        </div>
                        <div class="voice-row">
                            <button id="voice-speak-toggle" class="voice-btn primary">&#x25B6; Test Speak</button>
                            <button id="voice-stop-btn" class="voice-btn">&#x23F9; Stop</button>
                        </div>
                        <textarea id="voice-test-input" class="voice-test-input" rows="3" placeholder="Type something to hear it...">Hello, I am LEGION. Your AI assistant is ready.</textarea>
                    ` : '<p style="color:var(--dim);font-size:.85rem;padding:12px 0">TTS not available on this device/browser.</p>'}
                </div>

                <div class="voice-section">
                    <div class="voice-section-title">Speech Input ${sttSupported ? '<span class="badge-ok">Available</span>' : '<span class="badge-no">Not supported</span>'}</div>
                    ${sttSupported ? `
                        <p style="font-size:.82rem;color:var(--dim);margin-bottom:10px">Hold the mic button in Chat to dictate messages.</p>
                        <button id="voice-test-mic" class="voice-btn primary">&#x1F3A4; Test Microphone</button>
                        <div id="voice-transcript" class="voice-transcript" style="display:none"></div>
                    ` : '<p style="color:var(--dim);font-size:.85rem">Speech recognition not available on this device.</p>'}
                </div>

                <div class="voice-section">
                    <div class="voice-section-title">Local AI Model</div>
                    <div id="local-model-status" class="model-status-badge" data-status="${LEGION.inference?.getStatus?.() || 'idle'}">
                        ${this._modelStatusText()}
                    </div>
                    <p style="font-size:.82rem;color:var(--dim);margin:8px 0">SmolLM 135M downloads once and caches forever. Makes responses instant and offline.</p>
                    <div class="voice-row">
                        <div class="model-progress-wrap">
                            <div id="model-progress-bar" class="model-progress-bar" style="width:${LEGION.inference?.loadProgress || 0}%"></div>
                        </div>
                        <span id="model-pct" style="font-size:.72rem;color:var(--dim);font-family:var(--mono);flex-shrink:0">${LEGION.inference?.loadProgress || 0}%</span>
                    </div>
                    <button id="load-model-btn" class="voice-btn primary" ${LEGION.inference?.isReady() ? 'disabled' : ''}>
                        ${LEGION.inference?.isReady() ? '&#x2713; Model Ready' : LEGION.inference?.getStatus() === 'loading' ? 'Downloading...' : '&#x2B73; Load Local Model'}
                    </button>
                </div>
            </div>
        `;
        this.attachListeners();
        this._pollModelProgress();
    },

    _modelStatusText() {
        const s = LEGION.inference?.getStatus?.() || 'idle';
        if (s === 'ready')   return '&#x25CF; Local AI ready';
        if (s === 'loading') return '&#x25CC; Downloading...';
        if (s === 'failed')  return '&#x25CF; Cloud only';
        return '&#x25CB; Not loaded';
    },

    _pollModelProgress() {
        if (!LEGION.inference) return;
        const poll = setInterval(() => {
            const prog = document.getElementById('model-progress-bar');
            const pct = document.getElementById('model-pct');
            const btn = document.getElementById('load-model-btn');
            const status = document.getElementById('local-model-status');
            if (!prog) { clearInterval(poll); return; }
            const p = LEGION.inference.loadProgress;
            if (prog) prog.style.width = p + '%';
            if (pct) pct.textContent = p + '%';
            if (status) status.textContent = this._modelStatusText();
            if (LEGION.inference.isReady() && btn) {
                btn.textContent = '&#x2713; Model Ready';
                btn.disabled = true;
                clearInterval(poll);
            }
        }, 500);
    },

    attachListeners() {
        const el = id => document.getElementById(id);

        el('voice-profile-select')?.addEventListener('change', e => {
            this.activeProfile = parseInt(e.target.value);
        });

        el('voice-system-select')?.addEventListener('change', e => {
            this.selectedVoice = this.voices.find(v => v.name === e.target.value) || this.selectedVoice;
        });

        el('voice-rate')?.addEventListener('input', e => {
            this.rate = parseFloat(e.target.value);
            const val = el('rate-val');
            if (val) val.textContent = this.rate.toFixed(1) + 'x';
        });

        el('voice-pitch')?.addEventListener('input', e => {
            this.pitch = parseFloat(e.target.value);
            const val = el('pitch-val');
            if (val) val.textContent = this.pitch.toFixed(1);
        });

        el('auto-speak-toggle')?.addEventListener('click', function() {
            this.classList.toggle('on');
            VoiceMod.autoSpeak = this.classList.contains('on');
        });

        el('voice-speak-toggle')?.addEventListener('click', () => {
            const text = el('voice-test-input')?.value || 'Hello from LEGION.';
            if (this.isSpeaking) { this.stopSpeaking(); }
            else { this.speak(text); }
        });

        el('voice-stop-btn')?.addEventListener('click', () => this.stopSpeaking());

        el('voice-test-mic')?.addEventListener('click', () => {
            const btn = el('voice-test-mic');
            const trans = el('voice-transcript');
            if (this.isListening) {
                this.stopListening();
                if (btn) btn.textContent = '&#x1F3A4; Test Microphone';
                return;
            }
            if (btn) btn.textContent = '&#x23F9; Stop Listening';
            if (trans) { trans.style.display = 'block'; trans.textContent = 'Listening...'; }
            this.startListening(
                (t, final) => { if (trans) trans.textContent = t; },
                () => { if (btn) btn.textContent = '&#x1F3A4; Test Microphone'; }
            );
        });

        el('load-model-btn')?.addEventListener('click', () => {
            if (LEGION.inference && LEGION.inference.loadStatus === 'idle') {
                LEGION.inference.startBackgroundLoad();
                const btn = el('load-model-btn');
                if (btn) btn.textContent = 'Downloading...';
            }
        });
    },

    destroy() {
        this.stopSpeaking();
        this.stopListening();
    }
};

window.VoiceMod = VoiceMod;
LEGION.registerMod('voice', VoiceMod);
})();
