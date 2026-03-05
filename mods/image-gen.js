// ============================================
// IMAGE GEN MOD v1.0
// Free image generation via Pollinations.ai
// No API key needed. Completely free.
// ============================================
(function() {
    'use strict';

    const ImageMod = {
        history: [],
        isGenerating: false,

        init: async function() {
            LEGION.log('Image mod: init');
            try {
                const stored = await LEGION.loadFromStorage('image_history');
                if (stored && stored.length > 0) {
                    const rec = stored[stored.length - 1];
                    if (rec && rec.images) this.history = rec.images;
                }
            } catch(e) {}
        },

        render: async function() {
            const container = document.getElementById('mod-content');
            container.innerHTML = `
                <div class="image-mod">
                    <div class="image-topbar">
                        <h2>&#x1F3A8; Image Generator</h2>
                    </div>
                    <div class="image-input-area">
                        <div class="image-prompt-row">
                            <textarea id="image-prompt" placeholder="Describe the image you want..." rows="2"></textarea>
                            <button id="generate-btn" class="generate-btn">Generate</button>
                        </div>
                        <div class="image-options">
                            <label>Size:
                                <select id="image-size">
                                    <option value="512x512">512&#xD7;512</option>
                                    <option value="768x768">768&#xD7;768</option>
                                    <option value="1024x512">1024&#xD7;512 (wide)</option>
                                    <option value="512x1024">512&#xD7;1024 (tall)</option>
                                    <option value="1024x1024">1024&#xD7;1024 (HD)</option>
                                </select>
                            </label>
                            <label class="enhance-toggle">
                                <input type="checkbox" id="enhance-toggle" checked>
                                AI Enhance
                            </label>
                        </div>
                    </div>
                    <div id="image-gallery" class="image-gallery">
                        ${this.renderGallery()}
                    </div>
                </div>
            `;
            this.attachListeners();
        },

        renderGallery: function() {
            if (this.history.length === 0) {
                return '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">&#x1F5BC;</div><p>Your generated images will appear here</p></div>';
            }
            return this.history.slice().reverse().map((item, i) => `
                <div class="image-card" data-prompt="${this.escapeAttr(item.prompt)}">
                    <img src="${item.url}" alt="${this.escapeAttr(item.prompt)}" loading="lazy"
                         onerror="this.style.background='#1e1e32';this.style.minHeight='120px'">
                    <div class="image-card-info">
                        <div class="image-card-prompt">${this.escapeHTML(item.prompt)}</div>
                        <div class="image-card-actions">
                            <button class="img-action-btn" onclick="ImageMod.copyPrompt(this)" data-prompt="${this.escapeAttr(item.prompt)}">Copy prompt</button>
                            <a class="img-action-btn" href="${item.url}" download="legion-image.jpg" target="_blank">Save</a>
                        </div>
                    </div>
                </div>
            `).join('');
        },

        attachListeners: function() {
            document.getElementById('generate-btn').addEventListener('click', () => this.generate());
            document.getElementById('image-prompt').addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.generate(); }
            });
        },

        generate: async function() {
            if (this.isGenerating) return;
            const promptEl = document.getElementById('image-prompt');
            const prompt = promptEl.value.trim();
            if (!prompt) return;

            const sizeStr = document.getElementById('image-size').value;
            const [w, h] = sizeStr.split('x').map(Number);
            const enhance = document.getElementById('enhance-toggle').checked;

            this.isGenerating = true;
            const btn = document.getElementById('generate-btn');
            btn.disabled = true;
            btn.textContent = 'Generating...';
            LEGION.setThinking(true);

            // Show loading in gallery
            const gallery = document.getElementById('image-gallery');
            gallery.innerHTML = `<div class="image-loading"><div class="image-loading-spinner"></div><span>Generating your image...</span></div>` + gallery.innerHTML;

            try {
                // Build Pollinations URL directly — no worker needed, no CORS issues
                const seed = Math.floor(Math.random() * 99999);
                const enhanceParam = enhance ? '&enhance=true' : '';
                const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true${enhanceParam}`;

                // Pre-load the image to confirm it worked
                await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = url;
                    setTimeout(reject, 30000); // 30s timeout
                });

                const item = { url, prompt, size: sizeStr, createdAt: Date.now() };
                this.history.push(item);
                await this.saveHistory();

                promptEl.value = '';

            } catch(err) {
                LEGION.log('Image gen error:', err);
            } finally {
                this.isGenerating = false;
                btn.disabled = false;
                btn.textContent = 'Generate';
                LEGION.setThinking(false);
                // Re-render gallery
                const g = document.getElementById('image-gallery');
                if (g) g.innerHTML = this.renderGallery();
            }
        },

        copyPrompt: function(btn) {
            const prompt = btn.dataset.prompt;
            navigator.clipboard.writeText(prompt).then(() => {
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy prompt'; }, 1500);
            }).catch(() => {
                document.getElementById('image-prompt').value = prompt;
            });
        },

        saveHistory: async function() {
            try {
                await LEGION.upsertStorage('image_history', {
                    id: 'image_history',
                    images: this.history.slice(-50), // Keep last 50
                    savedAt: Date.now()
                });
            } catch(e) {}
        },

        escapeHTML: function(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; },
        escapeAttr: function(t) { return t.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); },

        destroy: async function() {
            LEGION.log('Image mod: destroy');
        }
    };

    window.ImageMod = ImageMod;
    LEGION.registerMod('image', ImageMod);
})();
