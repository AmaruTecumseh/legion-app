// ============================================
// ABOUT MOD v2.0
// ============================================
(function() {
    'use strict';

    const AboutMod = {
        init: async function() { LEGION.log('About mod: init'); },

        render: async function() {
            const container = document.getElementById('mod-content');
            container.innerHTML = `
                <div class="about-mod">
                    <div class="about-logo">LEGION</div>
                    <div class="about-version">v2.0 &mdash; Modular AI OS</div>

                    <div class="about-card">
                        <h3>What is LEGION?</h3>
                        <div class="about-feature"><span class="about-feature-icon">&#x1F4F1;</span><span>Mobile-first AI assistant built as a PWA &mdash; install on any phone, works offline</span></div>
                        <div class="about-feature"><span class="about-feature-icon">&#x1F9E9;</span><span>Modular &mdash; mods are like apps. Chat, Image Gen, Code IDE, and more</span></div>
                        <div class="about-feature"><span class="about-feature-icon">&#x1F510;</span><span>Anonymous &mdash; no accounts, no tracking, no data collection</span></div>
                        <div class="about-feature"><span class="about-feature-icon">&#x1F4B0;</span><span>100% free &mdash; powered by OpenRouter free tier + Pollinations</span></div>
                    </div>

                    <div class="about-card">
                        <h3>Features</h3>
                        <div class="about-feature"><span class="about-feature-icon">&#x2AC5;</span><span>Streaming AI responses with live token output</span></div>
                        <div class="about-feature"><span class="about-feature-icon">&#x1F4AC;</span><span>Multiple saved conversations with auto-titles</span></div>
                        <div class="about-feature"><span class="about-feature-icon">&#x1F3A8;</span><span>Free image generation via Pollinations.ai</span></div>
                        <div class="about-feature"><span class="about-feature-icon">&#x2328;&#xFE0F;</span><span>Code IDE with AI assistance and JS execution</span></div>
                        <div class="about-feature"><span class="about-feature-icon">&#x1F4F2;</span><span>Swipe gestures: left/right to switch mods, up for drawer</span></div>
                        <div class="about-feature"><span class="about-feature-icon">&#x1F504;</span><span>Auto-retry with backoff on failed requests</span></div>
                    </div>

                    <div class="about-card">
                        <h3>Backend Status</h3>
                        <div style="font-size:0.8rem;color:var(--text-3);margin-bottom:12px;font-family:var(--mono)">
                            ${LEGION.state.config.cloudflare_worker.url.replace('https://','')}
                        </div>
                        <button class="about-primary-btn" id="test-worker-btn">Test Connection</button>
                        <div id="test-result"></div>
                    </div>
                </div>
            `;
            this.attachListeners();
        },

        attachListeners: function() {
            document.getElementById('test-worker-btn').addEventListener('click', async () => {
                const btn = document.getElementById('test-worker-btn');
                const result = document.getElementById('test-result');
                btn.textContent = 'Testing...';
                btn.disabled = true;
                result.className = 'visible';
                result.textContent = 'Connecting...';
                try {
                    const res = await LEGION.callAPI('test');
                    result.className = 'visible success';
                    result.textContent = '&#x2705; ' + (res.message || 'Connected!');
                } catch(e) {
                    result.className = 'visible error';
                    result.textContent = '&#x274C; ' + e.message;
                } finally {
                    btn.textContent = 'Test Connection';
                    btn.disabled = false;
                }
            });
        },

        destroy: async function() { LEGION.log('About mod: destroy'); }
    };

    LEGION.registerMod('about', AboutMod);
})();
