import Game from './game.js';
// MenuController removed - not using complex controller for simple accordion

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('SW registered', reg.scope))
            .catch(err => console.log('SW failed', err));
    });
}

// Global Elements
const menuEl = document.getElementById('flatshot-ui');
const hudEl = document.getElementById('hud');
const crosshairEl = document.getElementById('crosshair');
// Legacy overlay for gameover, skill select, etc.
const gameoverEl = document.getElementById('gameover');
const countdownEl = document.getElementById('countdown');
const countTextEl = document.getElementById('countText');
const skillSelectEl = document.getElementById('skillSelect');
const skillGridEl = document.getElementById('skillGrid');
const leaderboardEl = document.getElementById('leaderboard');
const transEl = document.getElementById('transition'); // Assuming this still exists or can be ignored

let game = new Game();
// Start Menu Scene (AI Attract Mode)
try { game.enterMenuLoop(); } catch (_) { console.error('Failed to enter menu loop:', _); }


// --- ACCORDION LOGIC ---
const accordionBtns = document.querySelectorAll('.menu-btn');
const submenus = document.querySelectorAll('.submenu');

function closeAllSubmenus() {
    submenus.forEach(el => {
        el.classList.remove('open');
        el.style.maxHeight = '0';
        el.style.opacity = '0';
    });
    accordionBtns.forEach(btn => btn.classList.remove('active'));
}

accordionBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.getAttribute('data-target');
        const targetMenu = document.getElementById(targetId);

        // If clicking already open, just close it
        if (targetMenu.classList.contains('open')) {
            closeAllSubmenus();
            return;
        }

        // Close others
        closeAllSubmenus();

        // Open target
        targetMenu.classList.add('open');
        targetMenu.style.maxHeight = '500px';
        targetMenu.style.opacity = '1';
        btn.classList.add('active');

        try { game.audio.menuClick(); } catch (_) { }
    });
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.accordion-menu')) {
        closeAllSubmenus();
    }
});

// --- SUBMENU ACTIONS ---
const btnQuick = document.getElementById('btn-quickmatch');
if (btnQuick) {
    btnQuick.addEventListener('click', () => {
        try { game.audio.menuClick(); } catch (_) { }
        startGameFlow();
    });
}

// --- SETTINGS BINDINGS ---
const volMasterEl = document.getElementById('volMaster');
const sensitivityEl = document.getElementById('sensitivity');

if (volMasterEl) {
    volMasterEl.addEventListener('input', (e) => {
        try { game.audio.setMasterVolume(parseFloat(e.target.value)); } catch (_) { }
    });
}
if (sensitivityEl) {
    sensitivityEl.addEventListener('input', (e) => {
        try { game.setSensitivity(parseFloat(e.target.value)); } catch (_) { }
    });
}

// --- GAME FLOW HELPERS ---

// Audio Unlocker
let audioUnlocked = false;
function tryUnlockAudio() {
    if (audioUnlocked) return;
    try {
        if (game && game.audio && typeof game.audio.ensureCtx === 'function') game.audio.ensureCtx();
        audioUnlocked = true;
    } catch (_) { }
}
document.body.addEventListener('click', tryUnlockAudio, { once: true });

async function startGameFlow() {
    // Fade out menu
    if (menuEl) menuEl.style.display = 'none'; // simple hide
    if (hudEl) hudEl.classList.remove('hidden');

    // Stop Menu BGM
    try { game.audio.stopBgm(true); } catch (_) { }

    // Start Voting Phase
    try {
        game.enterVoting();
    } catch (e) {
        console.error(e);
        // Fallback to direct start if voting fails
        game.enterGame('TDM');
    }
}


// --- SKILL SELECTION (Reused logic) ---
const S_SKILLS = [
    { key: 'overcharge', name: 'Overcharge', desc: '+50% damage.' },
    { key: 'aegis', name: 'Aegis', desc: '+50 Shield.' },
    { key: 'adrenal', name: 'Adrenal', desc: '+Speed & Fire Rate.' },
    { key: 'quickdraw', name: 'Quickdraw', desc: 'Fast Reload.' },
    { key: 'vigor', name: 'Vigor', desc: '+25 Max HP.' },
    { key: 'demolisher', name: 'Demolisher', desc: 'Better Grenades.' },
];

function buildCardEl(skill) {
    const div = document.createElement('div');
    div.className = 'skill-card';
    div.innerHTML = `<h3>${skill.name}</h3><p>${skill.desc}</p>`;
    div.addEventListener('click', () => {
        if (_resolveSkillPick) {
            skillSelectEl.classList.add('hidden');
            _resolveSkillPick(skill);
            _resolveSkillPick = null;
        }
    });
    return div;
}

let _resolveSkillPick = null;
function presentSkillSelection() {
    return new Promise((resolve) => {
        _resolveSkillPick = resolve;
        if (!skillSelectEl) { resolve(null); return; }

        skillSelectEl.classList.remove('hidden');
        skillGridEl.innerHTML = '';

        // Pick 3 random
        const pool = [...S_SKILLS];
        for (let i = 0; i < 3; i++) {
            if (pool.length === 0) break;
            const idx = Math.floor(Math.random() * pool.length);
            skillGridEl.appendChild(buildCardEl(pool.splice(idx, 1)[0]));
        }
    });
}

function runCountdown() {
    return new Promise((resolve) => {
        if (!countdownEl) { resolve(); return; }
        let n = 3;
        countTextEl.innerText = n;
        countdownEl.classList.remove('hidden');

        const timer = setInterval(() => {
            n--;
            if (n <= 0) {
                clearInterval(timer);
                countdownEl.classList.add('hidden');
                resolve();
            } else {
                countTextEl.innerText = n;
            }
        }, 1000);
    });
}

// --- EVENT LISTENERS ---
window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        // Toggle menu/pause
        if (game && game.currentSceneMode === 'game') {
            // We simplified, just reload for now to go back to menu since we removed complex pause UI
            window.location.reload();
        }
    }
});
