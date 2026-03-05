// ============================================
// CHAT MOD v3.1
// - SmolLM local-first (falls back to worker)
// - Async council refinement in background
// - Mic button for speech input
// - Fires 'legion-response' for voice autoplay
// - RAG memory context injection
// ============================================
(function() {
'use strict';

const ChatMod = {
    sessions: [],
    activeId: null,
    streaming: false,
    sidebarOpen: false,
    lastFailedMsg: null,
    retryCount: 0,
    maxRetry: 3,

    fillerWords: new Set(['umm','hmm','uh','well','so','like','right','actually','basically']),

    async init() {
        LEGION.log('Chat: init');
        try {
            const stored = await LEGION.loadFromStorage('chat_sessions_v2');
            if (stored && stored.length > 0) {
                const rec = stored[stored.length - 1];
                this.sessions = (rec && rec.sessions) ? rec.sessions : [];
            }
        } catch(e) {}
        if (this.sessions.length === 0) this.sessions = [this.newSession()];
        this.activeId = this.sessions[0].id;
    },

    onLocalModelReady() {
        // Called by inference engine when SmolLM finishes loading
        const badge = document.getElementById('local-model-badge');
        if (badge) {
            badge.textContent = '⚡ Local';
            badge.className = 'local-badge ready';
        }
    },

    newSession() {
        return {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2),
            title: 'New Chat', messages: [],
            createdAt: Date.now(), updatedAt: Date.now()
        };
    },

    get active() { return this.sessions.find(s => s.id === this.activeId) || this.sessions[0]; },

    async render() {
        const container = document.getElementById('mod-content');
        const localReady = LEGION.inference && LEGION.inference.isReady();
        const sttAvail = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

        container.innerHTML = `
            <div class="chat-wrap">
                <div class="chat-sidebar ${this.sidebarOpen ? '' : 'hidden'}" id="chat-sidebar">
                    <div class="sidebar-hdr">
                        <span>Conversations</span>
                        <button class="sidebar-new-btn" id="new-session-btn">+ New</button>
                    </div>
                    <div class="session-list" id="session-list">${this.renderSessionList()}</div>
                </div>

                <div class="chat-main">
                    <div class="chat-topbar">
                        <button class="icon-btn" id="sidebar-toggle-btn">&#x2261;</button>
                        <div class="chat-title" id="chat-title">${this.esc(this.active.title)}</div>
                        <span id="local-model-badge" class="local-badge ${localReady ? 'ready' : 'loading'}">
                            ${localReady ? '&#x26A1; Local' : '&#x2601; Cloud'}
                        </span>
                        <button class="icon-btn" id="clear-chat-btn">&#x2715;</button>
                    </div>

                    <div class="messages-container" id="messages">${this.renderMessages()}</div>

                    <div class="council-bar hidden" id="council-bar">
                        <div class="council-spinner"></div>
                        <span id="council-status">Council refining response...</span>
                    </div>

                    <div class="retry-banner hidden" id="retry-banner">
                        <span id="retry-text">Request failed</span>
                        <button class="retry-action-btn" id="retry-btn">Retry</button>
                    </div>

                    <div class="chat-input-container">
                        ${sttAvail ? `<button class="mic-btn" id="mic-btn" title="Voice input">&#x1F3A4;</button>` : ''}
                        <textarea id="chat-input" rows="1" placeholder="Message LEGION..."></textarea>
                        <button class="send-btn" id="send-btn">&#x2191;</button>
                    </div>
                </div>
            </div>
        `;
        this.attachListeners();
        this.scrollToBottom();
    },

    renderSessionList() {
        if (!this.sessions.length) return '<div class="session-empty">No conversations yet</div>';
        return this.sessions.slice().reverse().map(s => `
            <div class="session-item ${s.id === this.activeId ? 'active' : ''}" data-sid="${s.id}">
                <div class="session-info">
                    <div class="session-title">${this.esc(s.title)}</div>
                    <div class="session-meta">${s.messages.length} msgs &middot; ${this.relTime(s.updatedAt)}</div>
                </div>
                <button class="session-del" data-del="${s.id}">&#x2715;</button>
            </div>
        `).join('');
    },

    relTime(ts) {
        const d = Date.now() - ts;
        if (d < 60000) return 'just now';
        if (d < 3600000) return Math.floor(d/60000) + 'm ago';
        if (d < 86400000) return Math.floor(d/3600000) + 'h ago';
        return Math.floor(d/86400000) + 'd ago';
    },

    renderMessages() {
        if (!this.active || !this.active.messages.length) {
            return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;text-align:center;color:var(--dim);padding:40px">
                <div style="font-size:3rem;opacity:.15">&#x267E;</div>
                <div style="font-size:1.5rem;font-weight:900;letter-spacing:.35em;color:var(--dim2)">LEGION</div>
                <p style="font-size:.85rem;line-height:1.7;max-width:260px">Ask anything. Complex questions get routed to the Council while you read the initial response.</p>
            </div>`;
        }
        return this.active.messages.map(m => this.renderMsg(m)).join('');
    },

    renderMsg(m) {
        const time = new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
        const refined = m.refined ? '<span class="refined-badge">&#x2713; Refined</span>' : '';
        const local = m.local ? '<span class="refined-badge" style="color:var(--acc)">&#x26A1; Local</span>' : '';
        return `<div class="message ${m.role}">
            <div class="bubble ${m.streaming?'streaming':''}">${this.formatMD(m.content)}${m.streaming?'<span class="cursor-blink">&#x2588;</span>':''}${refined}${local}</div>
            <div class="msg-time">${time}</div>
        </div>`;
    },

    attachListeners() {
        const $ = id => document.getElementById(id);

        $('sidebar-toggle-btn').addEventListener('click', () => {
            this.sidebarOpen = !this.sidebarOpen;
            const s = $('chat-sidebar');
            if (s) s.classList.toggle('hidden', !this.sidebarOpen);
        });

        $('new-session-btn').addEventListener('click', () => {
            const s = this.newSession();
            this.sessions.unshift(s);
            this.activeId = s.id;
            this.saveSessions();
            this.render();
        });

        $('clear-chat-btn').addEventListener('click', () => {
            if (!this.active.messages.length) return;
            if (!confirm('Clear this conversation?')) return;
            this.active.messages = [];
            this.saveSessions();
            this.refreshMessages();
        });

        $('session-list').addEventListener('click', e => {
            const del = e.target.dataset.del;
            const sid = e.target.closest('.session-item')?.dataset.sid;
            if (del) { e.stopPropagation(); this.deleteSession(del); return; }
            if (sid && sid !== this.activeId) { this.activeId = sid; this.render(); }
        });

        const input = $('chat-input');
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
        });
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });

        $('send-btn').addEventListener('click', () => this.send());
        $('retry-btn').addEventListener('click', () => {
            $('retry-banner').className = 'retry-banner hidden';
            if (this.lastFailedMsg) {
                $('chat-input').value = this.lastFailedMsg;
                this.send();
            }
        });

        // Mic button
        const micBtn = $('mic-btn');
        if (micBtn) {
            const voiceMod = LEGION.state.loadedMods['voice'];
            if (voiceMod && voiceMod.recognition) {
                let listening = false;
                micBtn.addEventListener('click', () => {
                    if (listening) {
                        voiceMod.stopListening();
                        micBtn.classList.remove('active');
                        listening = false;
                        return;
                    }
                    listening = true;
                    micBtn.classList.add('active');
                    voiceMod.startListening(
                        (text, final) => {
                            input.value = text;
                            if (final) { listening = false; micBtn.classList.remove('active'); this.send(); }
                        },
                        () => { listening = false; micBtn.classList.remove('active'); }
                    );
                });
            } else {
                micBtn.style.opacity = '0.3';
            }
        }
    },

    async send() {
        if (this.streaming) return;
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        this.lastFailedMsg = text;
        input.value = '';
        input.style.height = 'auto';

        const memContext = LEGION.queryMemory(text);
        this.active.messages.push({ role: 'user', content: text, timestamp: Date.now() });
        if (this.active.messages.length === 1) this.autoTitle(text);

        this.streaming = true;
        document.getElementById('send-btn').disabled = true;
        document.getElementById('retry-banner').className = 'retry-banner hidden';
        LEGION.setThinking(true, false);
        LEGION.blob && LEGION.blob.setMood('thinking');

        const msgId = 'msg-' + Date.now();
        const placeholder = { id: msgId, role: 'assistant', content: '', streaming: true, timestamp: Date.now() };
        this.active.messages.push(placeholder);
        this.refreshMessages();

        const history = this.active.messages
            .filter(m => !m.streaming && m.role && m.content)
            .slice(-12).map(m => ({ role: m.role, content: m.content }));

        let apiMsg = text;
        if (memContext.length > 0) {
            const ctx = memContext.map(m => '[Memory: ' + (m.text||'').slice(0,120) + ']').join('\n');
            apiMsg = ctx + '\n\nUser: ' + text;
        }

        const complexity = LEGION.inference ? LEGION.inference.scoreComplexity(text) : 0.5;
        let usedLocal = false;

        try {
            // Try local SmolLM first if ready
            if (LEGION.inference && LEGION.inference.isReady()) {
                LEGION.log('Chat: using local SmolLM');
                const localResp = await LEGION.inference.generateLocal(text, history);
                if (localResp) {
                    usedLocal = true;
                    await this.animateText(localResp, placeholder, true);
                    const idx = this.active.messages.findIndex(m => m.id === msgId);
                    if (idx !== -1) {
                        this.active.messages[idx] = { ...this.active.messages[idx], content: localResp, streaming: false, local: true };
                    }
                    this.refreshMessages();

                    // Fire event for voice auto-speak
                    document.dispatchEvent(new CustomEvent('legion-response', { detail: { text: localResp } }));
                }
            }

            // If local didn't work, stream from worker
            if (!usedLocal) {
                await this.streamFromWorker(apiMsg, history, placeholder, msgId);
            }

            // Always run council in background for complex queries
            if (complexity > 0.4) {
                this.runCouncil(text, msgId);
            }

            // Save to memory
            const finalMsg = this.active.messages.find(m => m.id === msgId);
            if (finalMsg && !finalMsg.streaming) {
                LEGION.saveMemory({ userMsg: text, assistantMsg: finalMsg.content, ts: Date.now() });
            }

        } catch(err) {
            LEGION.log('Chat send error:', err.message);
            const idx = this.active.messages.findIndex(m => m.id === msgId);
            if (idx !== -1) {
                this.active.messages[idx] = { ...placeholder, content: 'Error: ' + err.message, streaming: false, error: true };
            }
            this.refreshMessages();
            const banner = document.getElementById('retry-banner');
            const rtxt = document.getElementById('retry-text');
            if (banner) banner.className = 'retry-banner';
            if (rtxt) rtxt.textContent = err.message;
        } finally {
            this.streaming = false;
            document.getElementById('send-btn').disabled = false;
            LEGION.setThinking(false);
            LEGION.blob && LEGION.blob.setMood('idle');
            this.saveSessions();
        }
    },

    async streamFromWorker(message, history, placeholder, msgId) {
        const url = LEGION.state.config.cloudflare_worker.url;
        let attempts = 0;
        while (attempts < this.maxRetry) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'chat', message, history, stream: true })
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const ct = res.headers.get('Content-Type') || '';
                if (ct.includes('text/event-stream')) {
                    await this.readSSE(res, placeholder, msgId);
                } else {
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    await this.animateText(data.response || '', placeholder, false);
                    const idx = this.active.messages.findIndex(m => m.id === msgId);
                    if (idx !== -1) this.active.messages[idx] = { ...this.active.messages[idx], content: data.response || '', streaming: false };
                    this.refreshMessages();
                    document.dispatchEvent(new CustomEvent('legion-response', { detail: { text: data.response } }));
                }
                return; // success
            } catch(err) {
                attempts++;
                if (attempts >= this.maxRetry) throw err;
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts - 1)));
            }
        }
    },

    async readSSE(res, placeholder, msgId) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '', fullText = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const d = line.slice(6).trim();
                if (d === '[DONE]') break;
                try {
                    const j = JSON.parse(d);
                    const delta = j.choices?.[0]?.delta?.content || '';
                    if (delta) {
                        fullText += delta;
                        const idx = this.active.messages.findIndex(m => m.id === placeholder.id);
                        if (idx !== -1) this.active.messages[idx].content = fullText;
                        this.updateLastBubble(fullText, true);
                    }
                } catch(e) {}
            }
        }
        const idx = this.active.messages.findIndex(m => m.id === placeholder.id);
        if (idx !== -1) this.active.messages[idx] = { ...this.active.messages[idx], content: fullText, streaming: false };
        this.refreshMessages();
        document.dispatchEvent(new CustomEvent('legion-response', { detail: { text: fullText } }));
    },

    async animateText(text, placeholder, isLocal) {
        const words = text.split(' ');
        let built = '';
        for (let i = 0; i < words.length; i++) {
            built += (i > 0 ? ' ' : '') + words[i];
            this.updateLastBubble(built, true);
            const w = words[i].toLowerCase().replace(/[^a-z]/g,'');
            const delay = this.fillerWords.has(w) ? 65 : /[.,!?;:]$/.test(words[i]) ? 50 : 22;
            await new Promise(r => setTimeout(r, delay));
        }
        this.updateLastBubble(built, false);
    },

    updateLastBubble(content, streaming) {
        const msgs = document.getElementById('messages');
        if (!msgs) return;
        const bubbles = msgs.querySelectorAll('.message.assistant .bubble');
        const last = bubbles[bubbles.length - 1];
        if (last) {
            last.innerHTML = this.formatMD(content) + (streaming ? '<span class="cursor-blink">&#x2588;</span>' : '');
            last.classList.toggle('streaming', streaming);
            this.scrollToBottom();
        }
    },

    async runCouncil(text, msgId) {
        const bar = document.getElementById('council-bar');
        const status = document.getElementById('council-status');
        if (bar) bar.className = 'council-bar';
        if (status) status.textContent = 'Council deliberating...';
        LEGION.setThinking(true, true);
        LEGION.blob && LEGION.blob.setMood('council');

        try {
            const res = await LEGION.callAPIRaw('council', { message: text });
            if (res && res.responses && res.responses.length > 0) {
                const best = res.responses.reduce((a, b) =>
                    (b.response||'').length > (a.response||'').length ? b : a
                );
                if (best.response && best.response.length > 50) {
                    const idx = this.active.messages.findIndex(m => m.id === msgId);
                    if (idx !== -1 && !this.active.messages[idx].streaming) {
                        this.active.messages[idx].content = best.response;
                        this.active.messages[idx].refined = true;
                        this.refreshMessages();
                        this.saveSessions();
                    }
                }
            }
        } catch(e) { LEGION.log('Council error:', e.message); }
        finally {
            if (bar) bar.className = 'council-bar hidden';
            LEGION.setThinking(false);
            LEGION.blob && LEGION.blob.setMood('idle');
        }
    },

    refreshMessages() {
        const msgs = document.getElementById('messages');
        if (msgs) { msgs.innerHTML = this.renderMessages(); this.scrollToBottom(); }
        const title = document.getElementById('chat-title');
        if (title) title.textContent = this.active.title;
        const sl = document.getElementById('session-list');
        if (sl) sl.innerHTML = this.renderSessionList();
    },

    scrollToBottom() {
        const el = document.getElementById('messages');
        if (el) el.scrollTop = el.scrollHeight;
    },

    autoTitle(text) {
        this.active.title = text.slice(0, 32) + (text.length > 32 ? '...' : '');
        this.active.updatedAt = Date.now();
    },

    deleteSession(id) {
        this.sessions = this.sessions.length <= 1 ? [this.newSession()] : this.sessions.filter(s => s.id !== id);
        if (this.activeId === id) this.activeId = this.sessions[0].id;
        this.saveSessions();
        this.render();
    },

    async saveSessions() {
        try {
            await LEGION.upsertStorage('chat_sessions_v2', {
                id: 'chat_sessions_v2',
                sessions: this.sessions.slice(-50),
                savedAt: Date.now()
            });
        } catch(e) {}
    },

    formatMD(text) {
        if (!text) return '';
        let h = this.esc(text);
        h = h.replace(/```[\s\S]*?```/g, m => '<pre class="code-block"><code>' + m.slice(3,-3).replace(/^[a-z]*\n/,'') + '</code></pre>');
        h = h.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        h = h.replace(/\n/g, '<br>');
        return h;
    },

    esc(t) { const d = document.createElement('div'); d.textContent = t||''; return d.innerHTML; },

    destroy() {
        this.streaming = false;
        LEGION.log('Chat: destroy');
    }
};

// Expose scoreComplexity on inference if not there yet
if (LEGION.inference && !LEGION.inference.scoreComplexity) {
    LEGION.inference.scoreComplexity = function(msg) {
        const cw = ['code','function','implement','write','build','create','debug','class','algorithm','error'];
        const words = msg.toLowerCase().split(/\W+/);
        return Math.min(words.filter(w => cw.includes(w)).length * 0.2 + Math.min(msg.length/200,1)*0.5, 1);
    };
}

window.ChatMod = ChatMod;
LEGION.registerMod('chat', ChatMod);
})();
