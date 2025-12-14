import { GameSession } from './GameSession.js';
import { MenuSession } from './MenuSession.js';
import { MENU_HTML, HUD_HTML, PAUSE_HTML } from './ui/layouts.js';
import { attachUIAudioListeners, UISound } from './ui/UIAudio.js';

// --- STATE MANAGEMENT ---
const APP_CONTAINER = document.getElementById('canvas-container');
const UI_LAYER = document.getElementById('ui-layer');

let currentSession = null;
let currentState = 'NONE'; // NONE, MENU, GAME

// Initialize App
function initApp() {
    console.log("App Initializing...");
    showMenu();
}

// --- STATE TRANSITIONS ---

async function showMenu() {
    if (currentState === 'MENU') return;
    console.log("State: Transitioning to MENU");

    // 1. Cleanup previous state
    if (currentSession) {
        currentSession.dispose();
        currentSession = null;
    }
    UI_LAYER.innerHTML = ''; // Clear UI

    // 2. Inject Menu UI
    UI_LAYER.innerHTML = MENU_HTML;
    bindMenuEvents();

    // 3. Start Menu Session (3D Background)
    currentSession = new MenuSession(APP_CONTAINER);
    currentSession.start();

    currentState = 'MENU';
}

async function startGame() {
    if (currentState === 'GAME') return;
    console.log("State: Transitioning to GAME");

    // 1. Cleanup previous state
    if (currentSession) {
        currentSession.dispose();
        currentSession = null;
    }
    UI_LAYER.innerHTML = ''; // Clear UI

    // 2. Inject Game UI (HUD)
    UI_LAYER.innerHTML = HUD_HTML;
    // Append Pause Menu (hidden)
    const pauseDiv = document.createElement('div');
    pauseDiv.innerHTML = PAUSE_HTML;
    UI_LAYER.appendChild(pauseDiv.firstElementChild);

    bindGameEvents();

    // 3. Start Game Session
    currentSession = new GameSession(APP_CONTAINER);
    currentSession.start();

    currentState = 'GAME';
}

// --- UI EVENT BINDINGS ---

function bindMenuEvents() {
    // Accordion Logic
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

            if (targetMenu.classList.contains('open')) {
                closeAllSubmenus();
                return;
            }
            closeAllSubmenus();
            targetMenu.classList.add('open');
            targetMenu.style.maxHeight = '500px';
            targetMenu.style.opacity = '1';
            btn.classList.add('active');

            // Audio Feedback
            UISound.click();
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.accordion-menu')) {
            closeAllSubmenus();
        }
    });

    // Start Buttons
    const btnQuick = document.getElementById('btn-quickmatch');
    if (btnQuick) {
        btnQuick.addEventListener('click', () => {
            UISound.gameStart();
            startGame();
        });
    }

    // Settings (Volume/Sens) - We can persist these to localStorage in future
    const volMasterEl = document.getElementById('volMaster');
    if (volMasterEl) {
        volMasterEl.addEventListener('input', (e) => {
            // Store globally or pass to session?
            // For now, simpler to let session handle it, BUT session changes.
            // Ideal: Global Config object.
        });
    }
}

function bindGameEvents() {
    // Resume/Quit are in Pause Menu
    const resumeBtn = document.getElementById('resumeBtn');
    const quitBtn = document.getElementById('quitBtn');

    if (resumeBtn) resumeBtn.addEventListener('click', () => {
        UISound.resume();
        const pm = document.getElementById('pauseMenu');
        if (pm) pm.classList.add('hidden');
        if (currentSession && currentSession.game) {
            currentSession.game.isPaused = false;
            // Lock pointer again
            document.body.requestPointerLock();
        }
    });

    if (quitBtn) quitBtn.addEventListener('click', () => {
        showMenu();
    });

    // Handle ESC key for Pause
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && currentState === 'GAME') {
            const pm = document.getElementById('pauseMenu');
            if (pm) {
                const isHidden = pm.classList.contains('hidden');
                if (isHidden) {
                    UISound.pause();
                    pm.classList.remove('hidden');
                    if (currentSession && currentSession.game) currentSession.game.isPaused = true;
                    document.exitPointerLock();
                } else {
                    resumeBtn.click();
                }
            }
        }
    });
}

// --- BOOT ---
// Register SW
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch(() => { });
    });
}

// Start
initApp();
