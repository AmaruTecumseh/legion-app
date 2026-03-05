// ============================================
// LEGION CORE v3.1
// ============================================
(function() {
'use strict';

window.LEGION = {
    state: { config: null, currentMod: null, loadedMods: {}, isReady: false, thinking: false, councilActive: false },
    db: null, blob: null, inference: null, vault: null,
    memory: { hot: [], rag: [] }
};

// ============================================
// INIT
// ============================================
LEGION.init = async function() {
    try {
        LEGION.setLoadStatus('config', 'loading');
        await LEGION.loadConfig();
        LEGION.setLoadStatus('config', 'ready');

        LEGION.setLoadStatus('storage', 'loading');
        await LEGION.initStorage();
        LEGION.setLoadStatus('storage', 'ready');
        LEGION.updateLoadingBar(30);

        LEGION.setLoadStatus('memory', 'loading');
        await LEGION.initMemory();
        LEGION.setLoadStatus('memory', 'ready');
        LEGION.updateLoadingBar(45);

        LEGION.setLoadStatus('vault', 'loading');
        LEGION.vault = LEGION.initVault();
        LEGION.vault.autoRestore();
        LEGION.vault.startPulse();
        LEGION.setLoadStatus('vault', 'ready');
        LEGION.updateLoadingBar(55);

        LEGION.setLoadStatus('blob', 'loading');
        LEGION.initBlob();
        LEGION.setLoadStatus('blob', 'ready');
        LEGION.updateLoadingBar(65);

        LEGION.setLoadStatus('mods', 'loading');
        await LEGION.loadAllMods();
        LEGION.setLoadStatus('mods', 'ready');
        LEGION.updateLoadingBar(90);

        LEGION.setupUIHandlers();
        await LEGION.switchMod('chat');
        LEGION.updateLoadingBar(100);
        LEGION.state.isReady = true;

        // Start inference engine background download AFTER app is ready
        setTimeout(() => {
            if (LEGION.inference && LEGION.state.config.inference.use_local_models) {
                LEGION.inference.startBackgroundLoad();
            }
        }, 3000);

    } catch(err) {
        console.error('LEGION init failed:', err);
        document.getElementById('mod-content').innerHTML =
            '<div class="error-screen" style="padding:40px;text-align:center;color:#ff6b6b;font-family:monospace">' +
            '<h2 style="color:#ff6b6b">Init Failed</h2>' +
            '<p style="color:#c4d4e4;margin:12px 0">' + err.message + '</p>' +
            '<p style="color:#486070;font-size:0.8rem">Check browser console (F12) for details</p>' +
            '<button onclick="location.reload()" style="margin-top:20px;padding:10px 24px;background:#00d4a8;color:#06080d;border:none;border-radius:8px;cursor:pointer;font-weight:bold">Retry</button>' +
            '</div>';
    }
};

LEGION.updateLoadingBar = function(pct) {
    const bar = document.getElementById('loading-progress');
    if (bar) bar.style.width = pct + '%';
    const pctEl = document.getElementById('loading-pct');
    if (pctEl) pctEl.textContent = pct + '%';
};

LEGION.setLoadStatus = function(name, status) {
    const el = document.getElementById('load-status-' + name);
    if (!el) return;
    el.className = 'load-status-item ' + status;
    const dot = el.querySelector('.load-dot');
    if (dot) dot.className = 'load-dot ' + status;
};

// ============================================
// CONFIG
// ============================================
LEGION.DEFAULT_CONFIG = {
    version: '3.1.0',
    cloudflare_worker: {
        url: 'https://legion-proxy.amarutecumseh.workers.dev',
        enabled: true,
        timeout: 30000
    },
    mods: {
        core: [
            { id: 'chat',     name: 'Chat',     file: 'mods/chat.js',          removable: false },
            { id: 'voice',    name: 'Voice',    file: 'mods/voice.js',         removable: false },
            { id: 'image',    name: 'Image',    file: 'mods/image-gen.js',     removable: false },
            { id: 'code',     name: 'Code',     file: 'mods/code-ide.js',      removable: false },
            { id: 'memory',   name: 'Memory',   file: 'mods/memory-viewer.js', removable: false },
            { id: 'modgen',   name: 'Mod Lab',  file: 'mods/mod-generator.js', removable: false },
            { id: 'settings', name: 'Settings', file: 'mods/settings.js',      removable: false },
            { id: 'about',    name: 'About',    file: 'mods/about.js',         removable: false }
        ],
        user: []
    },
    inference: { use_local_models: true, council_enabled: true, complexity_threshold: 0.4 },
    ui: { theme: 'dark-neon', animations_enabled: true },
    storage: { db_name: 'legion_v3' },
    debug: { verbose: false }
};

LEGION.loadConfig = async function() {
    // Try fetching config.json first (works on server/PWA)
    try {
        const res = await fetch('config.json?' + Date.now());
        if (res.ok) {
            const cfg = await res.json();
            LEGION.state.config = cfg;
            LEGION.log('Config loaded from file');
            return;
        }
    } catch(e) {
        LEGION.log('Config fetch failed (likely file:// protocol), using inline default');
    }
    // Fallback: use inline config (works with file://)
    LEGION.state.config = JSON.parse(JSON.stringify(LEGION.DEFAULT_CONFIG));
    // Restore any saved worker URL from vault
    try {
        const saved = localStorage.getItem('legion.prefs');
        if (saved) {
            const p = JSON.parse(saved);
            if (p.workerUrl) LEGION.state.config.cloudflare_worker.url = p.workerUrl;
        }
    } catch(e) {}
};

// ============================================
// VAULT
// ============================================
LEGION.initVault = function() {
    return {
        K: { hb: 'legion.heartbeat', prefs: 'legion.prefs' },
        autoRestore() {
            try {
                const saved = localStorage.getItem(this.K.prefs);
                if (saved) {
                    const p = JSON.parse(saved);
                    if (p.workerUrl) LEGION.state.config.cloudflare_worker.url = p.workerUrl;
                }
            } catch(e) {}
        },
        savePrefs(prefs) {
            try {
                const existing = JSON.parse(localStorage.getItem(this.K.prefs) || '{}');
                localStorage.setItem(this.K.prefs, JSON.stringify(Object.assign(existing, prefs)));
            } catch(e) {}
        },
        export() {
            try {
                return btoa(JSON.stringify({ v:'legion-v3', ts:Date.now(), prefs: localStorage.getItem(this.K.prefs) }));
            } catch(e) { return ''; }
        },
        import(encoded) {
            try {
                const b = JSON.parse(atob(encoded.trim()));
                if (b.prefs) localStorage.setItem(this.K.prefs, b.prefs);
                location.reload();
            } catch(e) { alert('Invalid bundle'); }
        },
        startPulse() { setInterval(() => localStorage.setItem(this.K.hb, Date.now()), 180000); },
        getHeartbeat() {
            const hb = localStorage.getItem(this.K.hb);
            if (!hb) return 'Never';
            const d = Date.now() - parseInt(hb);
            if (d < 60000) return 'just now';
            return Math.floor(d/60000) + 'm ago';
        }
    };
};

// ============================================
// 3-TIER MEMORY + RAG
// ============================================
LEGION.initMemory = async function() {
    try {
        const entries = await LEGION.loadFromStorage('memory_mid');
        if (entries && entries.length > 0) LEGION.buildRAGIndex(entries);
    } catch(e) {}
};

LEGION.saveMemory = async function(entry) {
    LEGION.memory.hot.push(entry);
    if (LEGION.memory.hot.length > 30) LEGION.memory.hot.shift();
    try { await LEGION.saveToStorage('memory_mid', entry); } catch(e) {}
    LEGION.buildRAGIndex(LEGION.memory.hot);
};

LEGION.buildRAGIndex = function(entries) {
    LEGION.memory.rag = entries.map(e => ({
        id: e.id || Date.now(),
        text: (e.userMsg||'') + ' ' + (e.assistantMsg||''),
        keywords: ((e.userMsg||'') + ' ' + (e.assistantMsg||'')).toLowerCase().split(/\W+/).filter(w => w.length > 3)
    }));
};

LEGION.queryMemory = function(query) {
    const qw = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    if (!qw.length || !LEGION.memory.rag.length) return [];
    return LEGION.memory.rag
        .map(e => ({ entry: e, score: qw.filter(w => e.keywords.includes(w)).length / qw.length }))
        .filter(r => r.score > 0.2).sort((a,b) => b.score - a.score).slice(0,3).map(r => r.entry);
};

// ============================================
// API
// ============================================
LEGION.callAPI = async function(action, payload) { return LEGION.callAPIRaw(action, payload); };

LEGION.callAPIRaw = async function(action, payload) {
    const url = LEGION.state.config.cloudflare_worker.url;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action }, payload || {}))
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if (payload && payload.stream) return res;
    return res.json();
};

LEGION.setThinking = function(on, isCouncil) {
    LEGION.state.thinking = on;
    LEGION.state.councilActive = !!(isCouncil && on);
    if (LEGION.blob) {
        LEGION.blob.setEnergy(on ? (isCouncil ? 1 : 0.6) : 0);
        LEGION.blob.setMood(on ? (isCouncil ? 'council' : 'thinking') : 'idle');
    }
    const dot = document.getElementById('status-dot');
    if (dot) dot.className = 'status-dot ' + (isCouncil && on ? 'council' : on ? 'thinking' : 'idle');
};

// ============================================
// BLOB
// ============================================
LEGION.initBlob = function() {
    const canvas = document.getElementById('blob-canvas');
    if (!canvas) return;
    const container = document.getElementById('blob-container');
    const resize = () => { canvas.width = container.offsetWidth; canvas.height = container.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    const ctx = canvas.getContext('2d');
    let t = 0, energy = 0, targetEnergy = 0, hueShift = 0, targetHue = 0;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        energy += (targetEnergy - energy) * 0.04;
        hueShift += (targetHue - hueShift) * 0.03;
        t += 0.01 + energy * 0.025;
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const baseR = Math.min(canvas.width, canvas.height) * 0.26;
        const pts = 9, step = (Math.PI * 2) / pts;
        const verts = [];
        for (let i = 0; i < pts; i++) {
            const a = i * step;
            const n = Math.sin(t*1.2+i*1.1)*0.11 + Math.cos(t*0.8+i*2.2)*0.07 + Math.sin(t*2.3+i*0.6)*energy*0.14;
            verts.push({ x: cx + Math.cos(a)*baseR*(1+n), y: cy + Math.sin(a)*baseR*(1+n) });
        }
        const hue = 180 + hueShift;
        const grd = ctx.createRadialGradient(cx, cy*0.7, 0, cx, cy, baseR*1.5);
        grd.addColorStop(0, `hsla(${hue+20},85%,65%,0.95)`);
        grd.addColorStop(0.5, `hsla(${hue},80%,50%,0.7)`);
        grd.addColorStop(1, `hsla(${hue-20},80%,35%,0)`);
        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 0; i < pts; i++) {
            const n = verts[(i+1)%pts];
            ctx.quadraticCurveTo(verts[i].x, verts[i].y, (verts[i].x+n.x)/2, (verts[i].y+n.y)/2);
        }
        ctx.closePath();
        ctx.shadowColor = `hsla(${hue},90%,60%,${0.2+energy*0.4})`;
        ctx.shadowBlur = 18 + energy*25;
        ctx.fillStyle = grd;
        ctx.fill();
        ctx.shadowBlur = 0;
        requestAnimationFrame(draw);
    }
    draw();
    LEGION.blob = {
        setEnergy(e) { targetEnergy = Math.max(0, Math.min(1, e)); },
        setMood(mood) {
            if (mood === 'thinking') targetHue = 80;
            else if (mood === 'council') targetHue = -150;
            else targetHue = 0;
        }
    };
};

// ============================================
// MOD SYSTEM
// ============================================
LEGION.loadAllMods = async function() {
    const all = [...LEGION.state.config.mods.core, ...(LEGION.state.config.mods.user || [])];
    for (let i = 0; i < all.length; i++) {
        await LEGION.loadMod(all[i]);
        LEGION.updateLoadingBar(65 + Math.round((i / all.length) * 20));
    }
    LEGION.renderModList();
};

LEGION.loadMod = function(cfg) {
    return new Promise((resolve, reject) => {
        // First try standard script tag (works on server/PWA)
        const s = document.createElement('script');
        s.src = cfg.file + '?' + Date.now();
        s.onload = () => {
            if (LEGION.state.loadedMods[cfg.id]) {
                resolve();
            } else {
                reject(new Error(cfg.id + ' did not register'));
            }
        };
        s.onerror = () => {
            // Script tag failed (likely file:// protocol) — try fetch + eval
            LEGION.log('Script tag failed for ' + cfg.file + ', trying fetch+eval');
            fetch(cfg.file + '?' + Date.now())
                .then(r => {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.text();
                })
                .then(code => {
                    try {
                        // eslint-disable-next-line no-eval
                        eval(code);
                        if (LEGION.state.loadedMods[cfg.id]) {
                            resolve();
                        } else {
                            reject(new Error(cfg.id + ' did not register after eval'));
                        }
                    } catch(err) {
                        reject(new Error('Eval failed for ' + cfg.file + ': ' + err.message));
                    }
                })
                .catch(err => reject(new Error('Failed to load: ' + cfg.file + ' — ' + err.message)));
        };
        document.body.appendChild(s);
    });
};

LEGION.registerMod = function(id, obj) {
    if (!obj.init || !obj.render || !obj.destroy) throw new Error('Mod ' + id + ' missing init/render/destroy');
    LEGION.state.loadedMods[id] = obj;
    LEGION.log('Mod registered:', id);
};

LEGION.switchMod = async function(id) {
    if (LEGION.state.currentMod) {
        const cur = LEGION.state.loadedMods[LEGION.state.currentMod];
        if (cur && cur.destroy) try { await cur.destroy(); } catch(e) {}
    }
    const next = LEGION.state.loadedMods[id];
    if (!next) throw new Error('Mod not found: ' + id);
    await next.init();
    await next.render();
    LEGION.state.currentMod = id;
    LEGION.updateModListUI();
    const drawer = document.getElementById('bottom-drawer');
    if (drawer) drawer.className = 'drawer-closed';
};

LEGION.renderModList = function() {
    const container = document.getElementById('mod-list');
    if (!container) return;
    container.innerHTML = '';
    const icons = { chat:'&#x1F4AC;', image:'&#x1F3A8;', code:'&#x2328;', voice:'&#x1F50A;', memory:'&#x1F9E0;', modgen:'&#x1F9EC;', settings:'&#x2699;', about:'&#x2139;' };
    const all = [...LEGION.state.config.mods.core, ...(LEGION.state.config.mods.user||[])];
    all.forEach(cfg => {
        const el = document.createElement('div');
        el.className = 'mod-icon';
        el.dataset.modId = cfg.id;
        el.innerHTML = '<span class="icon">' + (icons[cfg.id] || '&#x2B21;') + '</span><span class="label">' + cfg.name + '</span>';
        el.addEventListener('click', () => LEGION.switchMod(cfg.id));
        container.appendChild(el);
    });
};

LEGION.updateModListUI = function() {
    document.querySelectorAll('.mod-icon').forEach(el => el.classList.toggle('active', el.dataset.modId === LEGION.state.currentMod));
};

// ============================================
// STORAGE
// ============================================
LEGION.initStorage = async function() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('legion_v3', 3);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { LEGION.db = req.result; resolve(); };
        req.onupgradeneeded = e => {
            const db = e.target.result;
            ['chat_sessions_v2','image_history','settings','memory_mid','council_log'].forEach(store => {
                if (!db.objectStoreNames.contains(store)) {
                    const kp = ['chat_sessions_v2','image_history','settings'].includes(store) ? { keyPath:'id' } : { keyPath:'id', autoIncrement: true };
                    db.createObjectStore(store, kp);
                }
            });
        };
    });
};

LEGION.saveToStorage = async function(store, data) {
    return new Promise((resolve, reject) => {
        const tx = LEGION.db.transaction([store], 'readwrite');
        const req = tx.objectStore(store).add(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

LEGION.upsertStorage = async function(store, data) {
    return new Promise((resolve, reject) => {
        const tx = LEGION.db.transaction([store], 'readwrite');
        const req = tx.objectStore(store).put(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

LEGION.loadFromStorage = async function(store) {
    return new Promise((resolve, reject) => {
        const tx = LEGION.db.transaction([store], 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

// ============================================
// UI + GESTURES
// ============================================
LEGION.setupUIHandlers = function() {
    const drawer = document.getElementById('bottom-drawer');
    const handle = document.getElementById('drawer-handle');
    handle.addEventListener('click', () => {
        drawer.classList.toggle('drawer-open');
        drawer.classList.toggle('drawer-closed');
    });
    let ty = 0, tx = 0;
    document.addEventListener('touchstart', e => { ty = e.touches[0].clientY; tx = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', e => {
        const dy = ty - e.changedTouches[0].clientY;
        const dx = tx - e.changedTouches[0].clientX;
        const ady = Math.abs(dy), adx = Math.abs(dx);
        if (dy > 60 && ady > adx && ty > window.innerHeight * 0.65) { drawer.className = 'drawer-open'; return; }
        if (dy < -60 && ady > adx && drawer.classList.contains('drawer-open')) { drawer.className = 'drawer-closed'; return; }
        if (adx > 80 && adx > ady * 2) {
            const all = [...LEGION.state.config.mods.core, ...(LEGION.state.config.mods.user||[])];
            const idx = all.findIndex(m => m.id === LEGION.state.currentMod);
            if (dx > 0 && idx < all.length - 1) LEGION.switchMod(all[idx+1].id);
            if (dx < 0 && idx > 0) LEGION.switchMod(all[idx-1].id);
        }
    }, { passive: true });
    document.addEventListener('click', e => {
        if (drawer.classList.contains('drawer-open') && !drawer.contains(e.target)) drawer.className = 'drawer-closed';
    });
};

LEGION.log = function(...a) {
    if (LEGION.state.config?.debug?.verbose) console.log('[LEGION]', ...a);
};

})();
