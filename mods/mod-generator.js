// ============================================
// MOD GENERATOR v1.0
// Describe a mod → AI writes the code → inject into app
// ============================================
(function() {
'use strict';

const ModGeneratorMod = {
    isGenerating: false,
    generatedCode: null,
    previewMod: null,

    async init() { LEGION.log('ModGen: init'); },

    async render() {
        const container = document.getElementById('mod-content');
        const userMods = LEGION.state.config.mods.user || [];

        container.innerHTML = `
            <div class="modgen-mod">
                <div class="modgen-topbar">
                    <h2>&#x1F9EC; Mod Generator</h2>
                </div>

                <div class="modgen-body">
                    <div class="modgen-explain">
                        Describe what you want and LEGION will write and install the mod automatically.
                    </div>

                    <div class="modgen-examples">
                        <div class="modgen-example-title">Examples:</div>
                        <div class="modgen-chips">
                            <button class="modgen-chip" data-prompt="A calculator with basic math operations">Calculator</button>
                            <button class="modgen-chip" data-prompt="A note-taking mod that saves notes to storage">Notes</button>
                            <button class="modgen-chip" data-prompt="A timer and stopwatch mod">Timer</button>
                            <button class="modgen-chip" data-prompt="A unit converter for length, weight, temperature">Unit Converter</button>
                            <button class="modgen-chip" data-prompt="A random quote generator that fetches inspiring quotes">Quotes</button>
                            <button class="modgen-chip" data-prompt="A color palette generator with hex codes">Color Palette</button>
                        </div>
                    </div>

                    <div class="modgen-input-row">
                        <textarea id="modgen-prompt" class="modgen-prompt" rows="3"
                            placeholder="Describe the mod you want to create..."></textarea>
                        <button id="modgen-generate-btn" class="modgen-btn primary">
                            &#x26A1; Generate
                        </button>
                    </div>

                    <div id="modgen-status" class="modgen-status" style="display:none"></div>

                    <div id="modgen-preview" class="modgen-preview" style="display:none">
                        <div class="modgen-preview-header">
                            <span id="modgen-preview-title">Generated Mod</span>
                            <div style="display:flex;gap:8px">
                                <button id="modgen-install-btn" class="modgen-btn primary small">&#x2B07; Install</button>
                                <button id="modgen-code-toggle" class="modgen-btn small">View Code</button>
                            </div>
                        </div>
                        <div id="modgen-code-view" class="modgen-code-view" style="display:none">
                            <pre id="modgen-code-display"></pre>
                        </div>
                    </div>

                    <div class="modgen-installed">
                        <div class="modgen-installed-title">Installed Mods (${userMods.length})</div>
                        <div id="installed-mod-list">
                            ${userMods.length === 0
                                ? '<div class="modgen-empty">No custom mods yet. Generate one above!</div>'
                                : userMods.map(m => `
                                    <div class="installed-mod-item" data-mod-id="${m.id}">
                                        <span class="installed-mod-name">${this.esc(m.name)}</span>
                                        <div style="display:flex;gap:6px">
                                            <button class="modgen-btn small" onclick="ModGeneratorMod.openMod('${m.id}')">Open</button>
                                            <button class="modgen-btn small danger" onclick="ModGeneratorMod.removeMod('${m.id}')">Remove</button>
                                        </div>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.attachListeners();
    },

    attachListeners() {
        document.getElementById('modgen-generate-btn').addEventListener('click', () => this.generate());

        document.getElementById('modgen-prompt').addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.generate(); }
        });

        document.querySelectorAll('.modgen-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.getElementById('modgen-prompt').value = chip.dataset.prompt;
                this.generate();
            });
        });
    },

    async generate() {
        if (this.isGenerating) return;
        const prompt = document.getElementById('modgen-prompt').value.trim();
        if (!prompt) return;

        this.isGenerating = true;
        document.getElementById('modgen-generate-btn').disabled = true;
        this._setStatus('loading', '&#x26A1; Generating mod code...');
        LEGION.setThinking(true);

        const systemPrompt = `You are a LEGION mod generator. Generate a complete, working JavaScript mod file.

LEGION mod requirements:
1. Wrap everything in an IIFE: (function() { 'use strict'; ... })();
2. Create a mod object with: init(), render(), destroy() methods
3. render() must inject HTML into document.getElementById('mod-content')
4. Register with: LEGION.registerMod('mod-id', ModObject);
5. Use LEGION.callAPI('chat', {message}) to talk to AI if needed
6. Use LEGION.upsertStorage(store, data) for persistence
7. Use CSS variables: --acc, --bg, --s1, --s2, --txt, --dim etc
8. Mobile-first, touch-friendly UI
9. Clean up event listeners in destroy()
10. The mod ID must be: user-[short-name] (e.g. user-calculator)

Respond with ONLY the JavaScript code, no markdown, no explanation.
Start directly with (function() {`;

        const userMsg = `Create a LEGION mod for: ${prompt}

Make it polished, fully functional, and mobile-friendly. Include the mod name and icon in a topbar.`;

        try {
            const res = await LEGION.callAPI('chat', {
                message: userMsg,
                model: 'openrouter/auto',
                history: [{ role: 'system', content: systemPrompt }]
            });

            let code = res.response || '';

            // Clean up if model wrapped in markdown
            code = code.replace(/^```javascript\n?/i, '').replace(/^```js\n?/i, '').replace(/```$/, '').trim();
            if (!code.startsWith('(function')) {
                // Try to extract IIFE
                const match = code.match(/\(function[\s\S]*\}\)\(\);?/);
                if (match) code = match[0];
            }

            if (!code || code.length < 100) {
                throw new Error('Generated code too short - try a more specific description');
            }

            this.generatedCode = code;

            // Extract mod name and ID from code
            const nameMatch = code.match(/name:\s*['"]([^'"]+)['"]/);
            const idMatch = code.match(/registerMod\(['"]([^'"]+)['"]/);
            const modName = nameMatch ? nameMatch[1] : prompt.slice(0, 20);
            const modId = idMatch ? idMatch[0].match(/registerMod\(['"]([^'"]+)['"]/)[1] : 'user-' + Date.now();

            this.pendingModId = modId;
            this.pendingModName = modName;

            // Show preview
            const preview = document.getElementById('modgen-preview');
            const titleEl = document.getElementById('modgen-preview-title');
            const codeDisplay = document.getElementById('modgen-code-display');
            preview.style.display = 'block';
            if (titleEl) titleEl.textContent = modName;
            if (codeDisplay) codeDisplay.textContent = code;

            this._setStatus('success', '&#x2713; Mod generated! Click Install to add it to LEGION.');

            document.getElementById('modgen-install-btn').onclick = () => this.install(code, modId, modName);
            document.getElementById('modgen-code-toggle').onclick = () => {
                const cv = document.getElementById('modgen-code-view');
                cv.style.display = cv.style.display === 'none' ? 'block' : 'none';
            };

        } catch(err) {
            this._setStatus('error', '&#x2715; ' + err.message);
        } finally {
            this.isGenerating = false;
            document.getElementById('modgen-generate-btn').disabled = false;
            LEGION.setThinking(false);
        }
    },

    async install(code, modId, modName) {
        try {
            // Save code to a blob URL and inject as script
            const blob = new Blob([code], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);

            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = url;
                script.onload = resolve;
                script.onerror = reject;
                document.body.appendChild(script);
                setTimeout(() => URL.revokeObjectURL(url), 5000);
            });

            // Verify it registered
            if (!LEGION.state.loadedMods[modId]) {
                throw new Error('Mod did not register correctly');
            }

            // Add to config
            if (!LEGION.state.config.mods.user) LEGION.state.config.mods.user = [];

            // Remove existing version if updating
            LEGION.state.config.mods.user = LEGION.state.config.mods.user.filter(m => m.id !== modId);

            LEGION.state.config.mods.user.push({
                id: modId, name: modName,
                file: 'blob:' + modId,
                icon: 'user', removable: true
            });

            // Re-render mod list
            LEGION.renderModList();

            this._setStatus('success', '&#x2713; ' + modName + ' installed! Find it in the drawer.');

            // Re-render installed list
            const list = document.getElementById('installed-mod-list');
            if (list) {
                const userMods = LEGION.state.config.mods.user;
                list.innerHTML = userMods.map(m => `
                    <div class="installed-mod-item">
                        <span class="installed-mod-name">${this.esc(m.name)}</span>
                        <div style="display:flex;gap:6px">
                            <button class="modgen-btn small" onclick="ModGeneratorMod.openMod('${m.id}')">Open</button>
                            <button class="modgen-btn small danger" onclick="ModGeneratorMod.removeMod('${m.id}')">Remove</button>
                        </div>
                    </div>
                `).join('');
            }

        } catch(err) {
            this._setStatus('error', '&#x2715; Install failed: ' + err.message);
        }
    },

    openMod(modId) {
        LEGION.switchMod(modId);
    },

    removeMod(modId) {
        if (!confirm('Remove this mod?')) return;
        LEGION.state.config.mods.user = (LEGION.state.config.mods.user || []).filter(m => m.id !== modId);
        delete LEGION.state.loadedMods[modId];
        LEGION.renderModList();
        this.render(); // Re-render to update list
    },

    _setStatus(type, msg) {
        const el = document.getElementById('modgen-status');
        if (!el) return;
        el.style.display = 'block';
        el.className = 'modgen-status ' + type;
        el.innerHTML = msg;
    },

    esc(t) { const d = document.createElement('div'); d.textContent = t||''; return d.innerHTML; },
    destroy() { this.isGenerating = false; }
};

window.ModGeneratorMod = ModGeneratorMod;
LEGION.registerMod('modgen', ModGeneratorMod);
})();
