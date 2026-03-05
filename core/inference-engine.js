// ============================================
// LEGION INFERENCE ENGINE
// Real transformers.js - loads SmolLM 135M in background
// App works immediately via worker while model downloads
// Once model ready, all responses are local-first
// ============================================
(function() {
'use strict';

window.LEGION_INFERENCE = {
    smolLM: null,
    smolReady: false,
    loading: false,
    loadProgress: 0,
    loadStatus: 'idle',

    startBackgroundLoad: async function() {
        if (this.loading) return;
        this.loading = true;
        this.loadStatus = 'loading';
        LEGION.log('Inference: starting background load');

        // Small delay so app finishes rendering first
        await new Promise(r => setTimeout(r, 2000));

        try {
            LEGION.log('Inference: importing transformers.js from CDN...');
            const mod = await import(
                'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2/dist/transformers.min.js'
            );
            const { pipeline, env } = mod;

            env.allowRemoteModels = true;
            env.useBrowserCache = true;
            env.backends.onnx.wasm.numThreads = 1;

            this._setStatus('loading', 'Downloading SmolLM...');

            this.smolLM = await pipeline(
                'text-generation',
                'HuggingFaceTB/SmolLM2-135M-Instruct',
                {
                    dtype: 'q4',
                    progress_callback: (p) => {
                        if (p.status === 'progress' && p.progress) {
                            this.loadProgress = Math.round(p.progress);
                            this._setStatus('loading', 'SmolLM: ' + this.loadProgress + '%');
                        }
                    }
                }
            );

            this.smolReady = true;
            this.loadStatus = 'ready';
            this._setStatus('ready', 'Local AI ready');
            LEGION.log('Inference: SmolLM loaded and ready!');

            if (LEGION.state.currentMod === 'chat') {
                const chatMod = LEGION.state.loadedMods['chat'];
                if (chatMod && chatMod.onLocalModelReady) chatMod.onLocalModelReady();
            }

        } catch(err) {
            this.loadStatus = 'failed';
            this._setStatus('failed', 'Local AI unavailable');
            LEGION.log('Inference load failed (using cloud):', err.message);
        }
    },

    generateLocal: async function(message, history) {
        if (!this.smolReady || !this.smolLM) return null;
        try {
            const messages = [
                { role: 'system', content: 'You are LEGION, a helpful AI assistant. Be warm and direct.' },
                ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: message }
            ];
            const result = await this.smolLM(messages, {
                max_new_tokens: 256,
                temperature: 0.8,
                do_sample: true,
                repetition_penalty: 1.15
            });
            const gen = result[0]?.generated_text;
            if (Array.isArray(gen)) return gen[gen.length - 1]?.content || null;
            return typeof gen === 'string' ? gen : null;
        } catch(err) {
            LEGION.log('Local gen failed:', err.message);
            return null;
        }
    },

    _setStatus: function(status, msg) {
        this.loadStatus = status;
        const el = document.getElementById('local-model-status');
        if (el) {
            el.textContent = msg;
            el.dataset.status = status;
        }
        LEGION.log('Inference:', msg);
    },

    isReady: function() { return this.smolReady; },
    getStatus: function() { return this.loadStatus; }
};

LEGION.inference = window.LEGION_INFERENCE;
LEGION.log('Inference engine registered');
})();
