// ============================================
// SETTINGS MOD v3.0 — with Vault session management
// ============================================
(function() {
'use strict';

const SettingsMod = {
    async init() { LEGION.log('Settings: init'); },

    async render() {
        const container = document.getElementById('mod-content');
        const v = LEGION.state.config.debug.verbose;
        const url = LEGION.state.config.cloudflare_worker.url;
        const anim = LEGION.state.config.ui.animations_enabled;
        const hb = LEGION.vault ? LEGION.vault.getHeartbeat() : 'N/A';

        container.innerHTML = `
            <div class="settings-mod">
                <h2>&#x2699;&#xFE0F; Settings</h2>

                <div class="sg">
                    <div class="sg-title">Display</div>
                    <div class="sr">
                        <div class="sr-lbl"><strong>Animations</strong><span>Blob & transitions</span></div>
                        <button class="s-toggle ${anim?'on':''}" id="tog-anim"></button>
                    </div>
                    <div class="sr">
                        <div class="sr-lbl"><strong>Debug logs</strong><span>Console output</span></div>
                        <button class="s-toggle ${v?'on':''}" id="tog-verbose"></button>
                    </div>
                </div>

                <div class="sg">
                    <div class="sg-title">Cloudflare Worker</div>
                    <div class="sr" style="flex-wrap:wrap;gap:8px">
                        <input class="s-input" id="worker-url" value="${url}" placeholder="https://...workers.dev">
                        <button class="s-btn" id="save-url">Save</button>
                    </div>
                    <div class="sr" style="flex-direction:column;align-items:flex-start;gap:8px">
                        <button class="s-btn" id="test-worker">Test connection</button>
                        <div id="worker-result" style="font-size:.78rem;color:var(--dim);font-family:var(--mono);display:none"></div>
                    </div>
                </div>

                <div class="sg">
                    <div class="sg-title">Vault &mdash; Session Management</div>
                    <div class="sr">
                        <div class="sr-lbl"><strong>Status</strong><span>Last heartbeat: ${hb}</span></div>
                        <span style="font-size:.75rem;color:var(--grn);font-family:var(--mono)">&#x25CF; Active</span>
                    </div>
                    <div class="sr" style="flex-direction:column;align-items:flex-start;gap:8px">
                        <button class="s-btn" id="export-bundle">Export Session Bundle</button>
                        <div class="vault-bundle" id="bundle-display"></div>
                    </div>
                    <div class="sr" style="flex-direction:column;align-items:flex-start;gap:8px">
                        <div style="font-size:.78rem;color:var(--dim);margin-bottom:4px">Import bundle (paste from another device):</div>
                        <div style="display:flex;gap:8px;width:100%">
                            <input class="s-input" id="import-input" placeholder="Paste bundle string...">
                            <button class="s-btn" id="import-bundle">Import</button>
                        </div>
                    </div>
                </div>

                <div class="sg">
                    <div class="sg-title">Data</div>
                    <div class="sr">
                        <div class="sr-lbl"><strong>Clear chat history</strong><span>Delete all conversations</span></div>
                        <button class="s-btn danger" id="clear-history">Clear</button>
                    </div>
                    <div class="sr">
                        <div class="sr-lbl"><strong>Clear memory</strong><span>Hot + mid tier</span></div>
                        <button class="s-btn danger" id="clear-memory">Clear</button>
                    </div>
                    <div class="sr">
                        <div class="sr-lbl"><strong>Clear images</strong><span>Generated image history</span></div>
                        <button class="s-btn danger" id="clear-images">Clear</button>
                    </div>
                </div>

                <div class="sg">
                    <div class="sg-title">System</div>
                    <div class="sr">
                        <div class="sr-lbl"><strong>Version</strong></div>
                        <span style="font-size:.8rem;color:var(--dim);font-family:var(--mono)">LEGION v3.0</span>
                    </div>
                    <div class="sr">
                        <div class="sr-lbl"><strong>Worker</strong></div>
                        <span style="font-size:.7rem;color:var(--dim);font-family:var(--mono);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${url.replace('https://','')}</span>
                    </div>
                </div>

                <div id="settings-msg" style="font-size:.78rem;color:var(--grn);padding:4px 0;display:none"></div>
            </div>
        `;
        this.attachListeners();
    },

    attachListeners() {
        document.getElementById('tog-anim').addEventListener('click', function() {
            this.classList.toggle('on');
            LEGION.state.config.ui.animations_enabled = this.classList.contains('on');
            const b = document.getElementById('blob-container');
            if (b) b.style.visibility = LEGION.state.config.ui.animations_enabled ? '' : 'hidden';
        });

        document.getElementById('tog-verbose').addEventListener('click', function() {
            this.classList.toggle('on');
            LEGION.state.config.debug.verbose = this.classList.contains('on');
        });

        document.getElementById('save-url').addEventListener('click', () => {
            const val = document.getElementById('worker-url').value.trim();
            if (val) {
                LEGION.state.config.cloudflare_worker.url = val;
                if (LEGION.vault) LEGION.vault.savePrefs({ workerUrl: val });
                this.showMsg('Worker URL saved');
            }
        });

        document.getElementById('test-worker').addEventListener('click', async () => {
            const el = document.getElementById('worker-result');
            el.style.display = 'block'; el.textContent = 'Testing...'; el.style.color = 'var(--dim)';
            try {
                const res = await LEGION.callAPI('test');
                el.textContent = '✓ ' + (res.message || JSON.stringify(res)); el.style.color = 'var(--grn)';
            } catch(e) {
                el.textContent = '✗ ' + e.message; el.style.color = 'var(--red)';
            }
        });

        document.getElementById('export-bundle').addEventListener('click', () => {
            if (!LEGION.vault) return;
            const bundle = LEGION.vault.export();
            const display = document.getElementById('bundle-display');
            display.textContent = bundle;
            display.className = 'vault-bundle on';
            navigator.clipboard.writeText(bundle).catch(() => {});
            this.showMsg('Bundle copied to clipboard');
        });

        document.getElementById('import-bundle').addEventListener('click', () => {
            const val = document.getElementById('import-input').value.trim();
            if (!val) return;
            if (LEGION.vault) LEGION.vault.import(val);
        });

        document.getElementById('clear-history').addEventListener('click', async () => {
            if (!confirm('Delete all conversations?')) return;
            try {
                await LEGION.upsertStorage('chat_sessions_v2', { id: 'chat_sessions_v2', sessions: [], savedAt: Date.now() });
                this.showMsg('Chat history cleared');
            } catch(e) {}
        });

        document.getElementById('clear-memory').addEventListener('click', () => {
            if (!confirm('Clear all memory?')) return;
            LEGION.memory.hot = [];
            LEGION.memory.rag = [];
            this.showMsg('Memory cleared');
        });

        document.getElementById('clear-images').addEventListener('click', async () => {
            if (!confirm('Delete image history?')) return;
            try {
                await LEGION.upsertStorage('image_history', { id: 'image_history', images: [], savedAt: Date.now() });
                this.showMsg('Image history cleared');
            } catch(e) {}
        });
    },

    showMsg(msg) {
        const el = document.getElementById('settings-msg');
        if (!el) return;
        el.textContent = msg; el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 2500);
    },

    destroy() { LEGION.log('Settings: destroy'); }
};

LEGION.registerMod('settings', SettingsMod);
})();
