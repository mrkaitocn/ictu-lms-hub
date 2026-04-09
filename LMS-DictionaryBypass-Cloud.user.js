// ==UserScript==
// @name         LMS Dictionary Bypass Cloud (Ultra Stealth)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Hệ thống hỗ trợ thi LMS ICTU tự động đồng bộ Cloud. Giao diện tàng hình (Stealth Mode).
// @author       Antigravity
// @match        *://*.ictu.edu.vn/*
// @match        *://*.ictu.edu.vn:*/*
// @match        *://ictu.edu.vn/*
// @match        *://ictu.edu.vn:*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ictu.edu.vn
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      pub-6f93058f5a2f4267b3e36e8e18019760.r2.dev
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const DB_URL = "https://pub-6f93058f5a2f4267b3e36e8e18019760.r2.dev/database.json";
    const DICT_KEY = 'LMS_CLOUD_DB';
    const LAST_SYNC_KEY = 'LMS_CLOUD_LAST_SYNC';

    // =========================================================================
    // 1. GUARDIAN ENGINE (Bypass Anti-Cheat)
    // =========================================================================
    const Guardian = {
        init: function() {
            const injectCode = `
                const fakeTrue = { get: () => true }; const fakeFalse = { get: () => false };
                Object.defineProperties(Document.prototype, { 'hidden': fakeFalse, 'visibilityState': { get: () => 'visible' }, 'fullscreenElement': { get: () => document.documentElement } });
                const blocked = ['visibilitychange', 'blur', 'focus', 'mouseleave', 'copy', 'cut', 'selectstart', 'contextmenu'];
                const _orig = EventTarget.prototype.addEventListener;
                EventTarget.prototype.addEventListener = function(t, l, o) { if (blocked.includes(t)) return; return _orig.call(this, t, l, o); };
            `;
            const s = document.createElement('script'); s.textContent = injectCode;
            if (document.documentElement) { document.documentElement.appendChild(s); s.remove(); }
            GM_addStyle(`*, *::before, *::after { -webkit-user-select: text !important; user-select: text !important; }`);
        }
    };
    Guardian.init();

    // =========================================================================
    // 2. DATA ENGINE (Cloud Sync & Match)
    // =========================================================================
    let database = GM_getValue(DICT_KEY, null);

    const DataEngine = {
        sync: function(force = false) {
            const now = Date.now();
            const lastSync = GM_getValue(LAST_SYNC_KEY, 0);
            if (!force && now - lastSync < 24 * 60 * 60 * 1000 && database) return;

            console.log("[Cloud] Syncing database...");
            UI.updateStatus("Đang đồng bộ...");

            GM_xmlhttpRequest({
                method: "GET",
                url: DB_URL,
                onload: function(res) {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.questions) {
                            GM_setValue(DICT_KEY, data);
                            GM_setValue(LAST_SYNC_KEY, now);
                            database = data;
                            UI.updateStatus(`Đã nạp ${data.questions.length} câu`);
                            Highlighter.scan(true);
                        }
                    } catch (e) { UI.updateStatus("Lỗi đồng bộ"); }
                },
                onerror: () => UI.updateStatus("Lỗi kết nối Cloud")
            });
        },
        clean: (t) => t ? t.toString().replace(/<[^>]*>/g, '').replace(/[\r\n\t\u00a0]+/g, ' ').replace(/[.,:;?\\\"\']/g, ' ').toLowerCase().replace(/\s{2,}/g, ' ').trim() : "",
        find: function(qRaw, options) {
            if (!database || !database.questions) return null;
            const qTarget = this.clean(qRaw);
            const optTargets = options.map(o => this.clean(o));
            for (let item of database.questions) {
                const dbQ = this.clean(item.question || item.qHtml || "");
                if (dbQ === qTarget) {
                    if (item.correctIndex !== undefined) return item.correctIndex;
                    const dbA = this.clean(item.answer || "");
                    const idx = optTargets.indexOf(dbA);
                    if (idx !== -1) return idx;
                }
            }
            return null;
        }
    };

    // =========================================================================
    // 3. UI & STEALTH ENGINE
    // =========================================================================
    const UI = {
        init: function() {
            GM_addStyle(`
                #cloud-panel { position: fixed; top: 15px; right: 15px; z-index: 100000; font-family: 'Inter', sans-serif; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                .glass { background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
                #panel-main { width: 220px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
                #panel-min { width: 40px; height: 40px; display: none; align-items: center; justify-content: center; cursor: pointer; border-radius: 50%; background: #10b981; color: white; font-size: 20px; opacity: 0.6; }
                #panel-min:hover { opacity: 1; transform: scale(1.1); }
                .status { font-size: 11px; color: #94a3b8; text-align: center; }
                .btn { padding: 6px; border: none; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600; transition: 0.2s; background: #334155; color: white; }
                .btn:hover { background: #475569; }
                .btn-sync { background: #10b981; }
                .btn-sync:hover { background: #059669; }
                .dict-dot { display: inline-block; width: 8px; height: 8px; background: #10b981; border-radius: 50%; margin-left: 8px; vertical-align: middle; box-shadow: 0 0 5px rgba(16,185,129,0.5); }
                .badge-stealth { opacity: 0; transition: 0.3s; position: absolute; top: -15px; right: 0; font-size: 9px; background: #10b981; color: white; padding: 2px 5px; border-radius: 4px; pointer-events: none; }
                .dict-item-wrapper:hover .badge-stealth { opacity: 0.8; }
            `);

            const container = document.createElement('div');
            container.id = "cloud-panel";
            container.innerHTML = `
                <div id="panel-main" class="glass">
                    <div style="display:flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight:700; color:#10b981; font-size:12px;">🛡️ Cloud Hub</span>
                        <span id="btnHide" style="cursor:pointer; color:#64748b;">[−]</span>
                    </div>
                    <div id="statusText" class="status">Đang kiểm tra...</div>
                    <button id="btnSync" class="btn btn-sync">Đồng bộ Cloud</button>
                    <button id="btnRescan" class="btn">Quét lại trang</button>
                </div>
                <div id="panel-min" class="glass">🛡️</div>
            `;
            document.body.appendChild(container);

            document.getElementById('btnHide').onclick = () => {
                document.getElementById('panel-main').style.display = 'none';
                document.getElementById('panel-min').style.display = 'flex';
            };
            document.getElementById('panel-min').onclick = () => {
                document.getElementById('panel-main').style.display = 'flex';
                document.getElementById('panel-min').style.display = 'none';
            };
            document.getElementById('btnSync').onclick = () => DataEngine.sync(true);
            document.getElementById('btnRescan').onclick = () => Highlighter.scan(true);
        },
        updateStatus: (t) => { const el = document.getElementById('statusText'); if(el) el.innerText = t; }
    };

    const Highlighter = {
        scan: function(force = false) {
            if (!database) return;
            const items = document.querySelectorAll('li.v-step-answers__elm, li.e-learning-testing__main-panel__wrap-question');
            items.forEach(node => {
                if (node.hasAttribute('processed') && !force) return;
                node.style.position = "relative";
                node.classList.add('dict-item-wrapper');
                
                const dir = node.querySelector('.v-step-answers__content__direction-content, .e-learning-testing__main-panel__question-direction');
                if (!dir) return;

                const q = (dir.querySelector('p') || dir).innerText.replace(/^(?:\s*Câu\s*\d+[:.]?\s*)/i, '').trim();
                const optEls = Array.from(node.querySelectorAll('li.ictu-radios__elm'));
                const optTxts = optEls.map(el => (el.querySelector('.ictu-radios__text p') || el.querySelector('.ictu-radios__text') || el).innerText.replace(/^\s*[A-Da-d][\.\)]\s*/, '').trim());

                const idx = DataEngine.find(q, optTxts);
                if (idx !== null && optEls[idx]) {
                    if (!optEls[idx].querySelector('.dict-dot')) {
                        const dot = document.createElement('span'); dot.className = 'dict-dot';
                        optEls[idx].querySelector('.ictu-radios__text')?.appendChild(dot) || optEls[idx].appendChild(dot);
                    }
                    if (!node.querySelector('.badge-stealth')) {
                        const b = document.createElement('div'); b.className = 'badge-stealth'; b.innerText = "MATCHED";
                        node.appendChild(b);
                    }
                }
                node.setAttribute('processed', 'true');
            });
        }
    };

    function boot() { UI.init(); DataEngine.sync(); Highlighter.scan(); new MutationObserver(() => { if(window.hTo) clearTimeout(window.hTo); window.hTo = setTimeout(() => Highlighter.scan(), 500); }).observe(document.body, { childList: true, subtree: true }); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
