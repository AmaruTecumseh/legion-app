// ============================================
// MEMORY VIEWER MOD v1.0
// View hot/mid/RAG memory tiers, search, export
// ============================================
(function() {
'use strict';

const MemoryMod = {
    activeTab: 'mid',
    searchTerm: '',
    midEntries: [],

    async init() {
        LEGION.log('Memory: init');
        try {
            this.midEntries = await LEGION.loadFromStorage('memory_mid') || [];
        } catch(e) { this.midEntries = []; }
    },

    async render() {
        const container = document.getElementById('mod-content');
        const hotCount = LEGION.memory.hot.length;
        const midCount = this.midEntries.length;
        const ragCount = LEGION.memory.rag.length;

        container.innerHTML = `
            <div class="mem-mod">
                <div class="mem-topbar">
                    <h2>&#x1F9E0; Memory</h2>
                    <button class="s-btn" id="mem-clear-btn">Clear All</button>
                </div>
                <div class="mem-stats" style="padding:12px 12px 0">
                    <div class="mem-stat"><div class="mem-stat-n">${hotCount}</div><div class="mem-stat-lbl">Hot (Session)</div></div>
                    <div class="mem-stat"><div class="mem-stat-n">${midCount}</div><div class="mem-stat-lbl">Mid (Stored)</div></div>
                    <div class="mem-stat"><div class="mem-stat-n">${ragCount}</div><div class="mem-stat-lbl">RAG Index</div></div>
                </div>
                <div class="mem-tabs">
                    <button class="mem-tab ${this.activeTab==='hot'?'active':''}" data-tab="hot">Hot Memory</button>
                    <button class="mem-tab ${this.activeTab==='mid'?'active':''}" data-tab="mid">Stored</button>
                    <button class="mem-tab ${this.activeTab==='rag'?'active':''}" data-tab="rag">RAG Index</button>
                </div>
                <div class="mem-body">
                    <input class="mem-search" id="mem-search" placeholder="Search memories..." value="${this.searchTerm}">
                    <div id="mem-entries">${this.renderEntries()}</div>
                    <button class="mem-export-btn" id="mem-export-btn">&#x2B73; Export Memory JSON</button>
                </div>
            </div>
        `;
        this.attachListeners();
    },

    renderEntries() {
        let entries = [];
        const q = this.searchTerm.toLowerCase();

        if (this.activeTab === 'hot') {
            entries = LEGION.memory.hot.slice().reverse();
        } else if (this.activeTab === 'mid') {
            entries = this.midEntries.slice().reverse();
        } else {
            // RAG - show keyword index
            return LEGION.memory.rag.length === 0
                ? '<div class="mem-empty">No RAG index built yet. Start chatting to build memory.</div>'
                : LEGION.memory.rag.slice().reverse().map(r => `
                    <div class="mem-entry">
                        <div class="mem-entry-q" style="color:var(--pur)">Keywords: ${r.keywords.slice(0,10).join(', ')}</div>
                        <div class="mem-entry-a">${this.esc(r.text.slice(0,150))}...</div>
                    </div>
                `).join('');
        }

        if (entries.length === 0) return '<div class="mem-empty">No memories yet. Start chatting!</div>';

        const filtered = q ? entries.filter(e => (e.userMsg + e.assistantMsg).toLowerCase().includes(q)) : entries;
        if (filtered.length === 0) return '<div class="mem-empty">No results for "' + this.esc(this.searchTerm) + '"</div>';

        return filtered.map(e => `
            <div class="mem-entry">
                <div class="mem-entry-q">&#x1F464; ${this.esc((e.userMsg || '').slice(0, 100))}</div>
                <div class="mem-entry-a">&#x1F916; ${this.esc((e.assistantMsg || '').slice(0, 180))}${(e.assistantMsg||'').length > 180 ? '...' : ''}</div>
                <div class="mem-entry-ts">${e.ts ? new Date(e.ts).toLocaleString() : ''}</div>
            </div>
        `).join('');
    },

    attachListeners() {
        document.querySelectorAll('.mem-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeTab = btn.dataset.tab;
                document.querySelectorAll('.mem-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === this.activeTab));
                document.getElementById('mem-entries').innerHTML = this.renderEntries();
            });
        });

        document.getElementById('mem-search').addEventListener('input', e => {
            this.searchTerm = e.target.value;
            document.getElementById('mem-entries').innerHTML = this.renderEntries();
        });

        document.getElementById('mem-export-btn').addEventListener('click', () => {
            const data = JSON.stringify({ hot: LEGION.memory.hot, mid: this.midEntries, rag: LEGION.memory.rag }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'legion-memory-' + Date.now() + '.json'; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        });

        document.getElementById('mem-clear-btn').addEventListener('click', async () => {
            if (!confirm('Clear all memory? This cannot be undone.')) return;
            try {
                LEGION.memory.hot = [];
                LEGION.memory.rag = [];
                this.midEntries = [];
                // Clear from IndexedDB by overwriting with empty
                await LEGION.upsertStorage('memory_mid', { id: 'memory_clear_marker', userMsg: '', assistantMsg: '', ts: Date.now() });
                this.render();
            } catch(e) {}
        });
    },

    esc(t) { const d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; },
    destroy() { LEGION.log('Memory: destroy'); }
};

LEGION.registerMod('memory', MemoryMod);
})();
