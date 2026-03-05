// ============================================
// CODE IDE MOD v1.0
// AI-assisted code editor
// ============================================
(function() {
    'use strict';

    const CodeMod = {
        isThinking: false,
        currentLang: 'javascript',

        templates: {
            javascript: '// JavaScript\nconsole.log("Hello from LEGION!");\n',
            python:     '# Python\nprint("Hello from LEGION!")\n',
            html:       '<!DOCTYPE html>\n<html>\n<head><title>LEGION</title></head>\n<body>\n  <h1>Hello from LEGION!</h1>\n</body>\n</html>\n',
            css:        '/* CSS */\nbody {\n  background: #0a0a0f;\n  color: white;\n  font-family: sans-serif;\n}\n',
            bash:       '#!/bin/bash\necho "Hello from LEGION!"\n',
            json:       '{\n  "name": "LEGION",\n  "version": "2.0"\n}\n'
        },

        init: async function() {
            LEGION.log('Code mod: init');
        },

        render: async function() {
            const container = document.getElementById('mod-content');
            container.innerHTML = `
                <div class="code-mod">
                    <div class="code-topbar">
                        <span class="code-title">&#x2328;&#xFE0F; Code IDE</span>
                        <select id="code-lang" class="code-lang-select">
                            <option value="javascript">JavaScript</option>
                            <option value="python">Python</option>
                            <option value="html">HTML</option>
                            <option value="css">CSS</option>
                            <option value="bash">Bash</option>
                            <option value="json">JSON</option>
                        </select>
                    </div>

                    <div class="code-body">
                        <div class="code-split">
                            <textarea id="code-editor" spellcheck="false">${this.escapeHTML(this.templates[this.currentLang])}</textarea>
                        </div>

                        <div class="code-actions">
                            <button class="code-btn" id="code-copy-btn">&#x2398; Copy</button>
                            <button class="code-btn" id="code-clear-btn">&#x2715; Clear</button>
                            <button class="code-btn" id="code-format-btn">&#x2195; Format</button>
                            <button class="code-btn primary" id="code-run-btn">&#x25B6; Run</button>
                        </div>

                        <div id="code-output" class="code-output" style="display:none"></div>

                        <div class="code-ai-area">
                            <div class="code-ai-input-row">
                                <textarea id="code-ai-input" rows="2"
                                    placeholder="Ask AI about your code... e.g. 'Add error handling' or 'Explain this code'"></textarea>
                                <button class="code-ai-send" id="code-ai-send">Ask</button>
                            </div>
                            <div id="code-ai-response"></div>
                        </div>
                    </div>
                </div>
            `;
            this.attachListeners();
        },

        attachListeners: function() {
            const langSelect = document.getElementById('code-lang');
            langSelect.value = this.currentLang;
            langSelect.addEventListener('change', () => {
                this.currentLang = langSelect.value;
                const editor = document.getElementById('code-editor');
                if (editor.value.trim() === this.escapeHTML(this.templates[this.getPrevLang()]) || editor.value.trim() === '') {
                    editor.value = this.templates[this.currentLang];
                }
            });

            document.getElementById('code-editor').addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const el = e.target;
                    const start = el.selectionStart;
                    el.value = el.value.substring(0, start) + '    ' + el.value.substring(el.selectionEnd);
                    el.selectionStart = el.selectionEnd = start + 4;
                }
            });

            document.getElementById('code-copy-btn').addEventListener('click', () => {
                const code = document.getElementById('code-editor').value;
                navigator.clipboard.writeText(code).then(() => {
                    const btn = document.getElementById('code-copy-btn');
                    btn.textContent = 'Copied!';
                    setTimeout(() => { btn.innerHTML = '&#x2398; Copy'; }, 1500);
                });
            });

            document.getElementById('code-clear-btn').addEventListener('click', () => {
                document.getElementById('code-editor').value = '';
                const out = document.getElementById('code-output');
                out.style.display = 'none'; out.innerHTML = '';
            });

            document.getElementById('code-format-btn').addEventListener('click', () => {
                this.formatCode();
            });

            document.getElementById('code-run-btn').addEventListener('click', () => {
                this.runCode();
            });

            document.getElementById('code-ai-send').addEventListener('click', () => this.askAI());

            document.getElementById('code-ai-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.askAI(); }
            });
        },

        getPrevLang: function() {
            return document.getElementById('code-lang').value;
        },

        runCode: function() {
            const code = document.getElementById('code-editor').value;
            const lang = this.currentLang;
            const out = document.getElementById('code-output');
            out.style.display = 'block';
            out.className = 'code-output';

            if (lang === 'javascript') {
                const logs = [];
                const origConsole = { log: console.log, error: console.error, warn: console.warn };
                const capture = (type) => (...args) => {
                    logs.push({ type, text: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') });
                };
                console.log = capture('log');
                console.error = capture('error');
                console.warn = capture('warn');
                try {
                    eval(code);
                    const html = logs.map(l => `<div class="code-log ${l.type}">${this.escapeHTML(l.text)}</div>`).join('') || '<div class="code-log">&#x2705; Executed (no output)</div>';
                    out.innerHTML = html;
                } catch(err) {
                    out.innerHTML = `<div class="code-log error">&#x274C; ${this.escapeHTML(err.message)}</div>`;
                    out.classList.add('error');
                } finally {
                    console.log = origConsole.log;
                    console.error = origConsole.error;
                    console.warn = origConsole.warn;
                }
            } else if (lang === 'html') {
                // Open in iframe popup
                const blob = new Blob([code], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank', 'width=800,height=600');
                out.innerHTML = '<div class="code-log">&#x1F310; Opened in new tab</div>';
                setTimeout(() => URL.revokeObjectURL(url), 5000);
            } else {
                out.innerHTML = '<div class="code-log">&#x26A0; Run only works for JavaScript and HTML in browser</div>';
            }
        },

        formatCode: function() {
            const editor = document.getElementById('code-editor');
            let code = editor.value;
            const lang = this.currentLang;
            // Basic formatting: normalize indentation for JS/JSON
            if (lang === 'json') {
                try {
                    code = JSON.stringify(JSON.parse(code), null, 2);
                    editor.value = code;
                } catch(e) {
                    // Not valid JSON
                }
            }
            // For others, just trim trailing whitespace
            editor.value = code.split('\n').map(l => l.trimEnd()).join('\n');
        },

        askAI: async function() {
            if (this.isThinking) return;
            const question = document.getElementById('code-ai-input').value.trim();
            if (!question) return;

            const code = document.getElementById('code-editor').value;
            const lang = this.currentLang;
            const responseEl = document.getElementById('code-ai-response');
            const btn = document.getElementById('code-ai-send');

            this.isThinking = true;
            btn.disabled = true;
            btn.textContent = '...';
            responseEl.className = 'visible';
            responseEl.innerHTML = '<div style="color:var(--text-3);font-size:0.8rem;padding:4px 0">LEGION is thinking...</div>';

            const prompt = `You are a coding assistant. The user is working with ${lang} code.

Their code:
\`\`\`${lang}
${code}
\`\`\`

Their question: ${question}

Give a helpful, concise answer. If you write code, use markdown fenced code blocks.`;

            try {
                const res = await LEGION.callAPI('chat', {
                    message: prompt,
                    model: 'openrouter/auto'
                });

                const text = res.response || res.error || 'No response.';
                responseEl.innerHTML = this.formatMarkdown(text);

                // If response contains code, offer to apply it
                if (text.includes('```')) {
                    const applyBtn = document.createElement('button');
                    applyBtn.className = 'code-btn primary';
                    applyBtn.style.marginTop = '8px';
                    applyBtn.textContent = 'Apply code to editor';
                    applyBtn.addEventListener('click', () => {
                        const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
                        if (match) {
                            document.getElementById('code-editor').value = match[1];
                            applyBtn.textContent = 'Applied!';
                            setTimeout(() => applyBtn.textContent = 'Apply code to editor', 2000);
                        }
                    });
                    responseEl.appendChild(applyBtn);
                }

            } catch(err) {
                responseEl.innerHTML = `<div style="color:var(--red);font-size:0.82rem">Error: ${this.escapeHTML(err.message)}</div>`;
            } finally {
                this.isThinking = false;
                btn.disabled = false;
                btn.textContent = 'Ask';
            }
        },

        formatMarkdown: function(text) {
            if (!text) return '';
            let html = this.escapeHTML(text);
            html = html.replace(/```[\s\S]*?```/g, function(m) {
                const inner = m.slice(3, -3).replace(/^[a-z]*\n/, '');
                return '<pre><code>' + inner + '</code></pre>';
            });
            html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 4px;border-radius:3px;font-family:var(--mono)">$1</code>');
            html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\n/g, '<br>');
            return html;
        },

        escapeHTML: function(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; },

        destroy: async function() {
            LEGION.log('Code mod: destroy');
            this.isThinking = false;
        }
    };

    LEGION.registerMod('code', CodeMod);
})();
