import { GameSession } from '../GameSession.js';
import { HUD_HTML, PAUSE_HTML } from '../ui/layouts.js';

// --- GAME ENTRY POINT (True Async Loading) ---

const APP_CONTAINER = document.getElementById('canvas-container');
const UI_LAYER = document.getElementById('ui-layer');

// Loading UI Elements
const loadingOverlay = document.getElementById('loading-overlay');
const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownText = document.getElementById('countdown-text');

let session = null;

/**
 * Update Loading Bar UI
 */
function updateLoadingUI(percent, status) {
    if (loadingBar) loadingBar.style.width = percent + '%';
    if (loadingStatus) loadingStatus.textContent = status;
}

/**
 * Fade out Loading Overlay
 */
function hideLoadingOverlay() {
    if (loadingOverlay) {
        loadingOverlay.classList.add('fade-out');
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 500);
    }
}

/**
 * Run 3-2-1-GO Countdown, then start game loop.
 */
function runCountdown() {
    return new Promise(resolve => {
        let count = 3;
        countdownOverlay.classList.add('show');
        countdownText.textContent = count;

        const tick = () => {
            if (count > 0) {
                countdownText.textContent = count;
                countdownText.style.animation = 'none';
                void countdownText.offsetWidth; // Trigger reflow
                countdownText.style.animation = 'pulse 0.5s ease-in-out';
                try { session.game.audio.click(); } catch (_) { }
                count--;
                setTimeout(tick, 1000);
            } else {
                countdownText.textContent = 'GO!';
                countdownText.style.animation = 'none';
                void countdownText.offsetWidth;
                countdownText.style.animation = 'pulse 0.5s ease-in-out';
                setTimeout(() => {
                    countdownOverlay.classList.remove('show');
                    resolve();
                }, 600);
            }
        };
        tick();
    });
}

/**
 * Show "Click to Start" overlay that triggers pointer lock on user gesture.
 * This is required because Pointer Lock API MUST be called within a user gesture event handler.
 */
function showClickToStart(onStart) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'click-to-start-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        cursor: pointer;
        animation: fadeIn 0.3s ease-out;
    `;

    const text = document.createElement('div');
    text.innerHTML = `
        <div style="text-align: center; color: white; font-family: 'Rajdhani', sans-serif;">
            <div style="font-size: 48px; font-weight: bold; text-shadow: 0 0 20px #30cfd0;">
                CLICK TO PLAY
            </div>
            <div style="font-size: 18px; opacity: 0.7; margin-top: 10px;">
                Click anywhere to start
            </div>
        </div>
    `;
    overlay.appendChild(text);
    document.body.appendChild(overlay);

    // Single click handler - this is a valid user gesture for pointer lock
    const handleClick = () => {
        overlay.remove();
        if (onStart) onStart();
    };

    overlay.addEventListener('click', handleClick, { once: true });
}

/**
 * MAIN INITIALIZATION (Promise.all Pattern)
 */
async function initGame() {
    console.log('[Game] Starting True Async Load...');

    // 1. Parse URL Parameters
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode') || 'FREE FOR ALL';
    const team = urlParams.get('team') || 'RED';

    console.log(`[Game] Mode: ${mode}, Team: ${team}`);

    // 2. Setup UI (HUD, Pause Menu)
    setupGameUI();

    // 3. Create Session (but don't start yet)
    session = new GameSession(APP_CONTAINER, mode, team);
    session.onProgress(updateLoadingUI);

    try {
        // 4. PROMISE.ALL: Wait for BOTH loading AND minimum time
        const minLoadTime = new Promise(r => setTimeout(r, 2500)); // Min 2.5 seconds
        await Promise.all([
            session.initialize(),
            minLoadTime
        ]);

        // 5. Hide Loading Screen
        hideLoadingOverlay();

        // 6. Run Countdown (3-2-1-GO)
        await runCountdown();

        // 7. START GAME LOOP (Input Unlocked)
        session.startGameLoop();

        // 8. Show "Click to Start" overlay and wait for user gesture
        // Pointer Lock REQUIRES a user gesture - can't be called automatically
        showClickToStart(() => {
            try {
                session.game.controls.lock();
            } catch (e) {
                console.warn('Pointer lock failed:', e.message);
            }
        });

        // 9. Bind Events (Pause, etc)
        bindGameEvents(session);

    } catch (err) {
        console.error('[Game] FATAL LOAD ERROR:', err);
        updateLoadingUI(0, 'LOAD FAILED: ' + err.message);
        alert('Failed to load game: ' + err.message);
    }
}

function setupGameUI() {
    // Inject HUD
    UI_LAYER.innerHTML = HUD_HTML;

    // Inject Pause Menu
    const pauseDiv = document.createElement('div');
    pauseDiv.innerHTML = PAUSE_HTML;
    UI_LAYER.appendChild(pauseDiv.firstElementChild);
}

function bindGameEvents(session) {
    const resumeBtn = document.getElementById('resumeBtn');
    const quitBtn = document.getElementById('quitBtn');
    const pauseMenu = document.getElementById('pauseMenu');

    // Resume
    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            if (pauseMenu) pauseMenu.classList.add('hidden');
            if (session.game) {
                session.game.isPaused = false;
                // Only lock if not already locked
                if (session.game.controls && !session.game.controls.isLocked) {
                    try {
                        session.game.controls.lock();
                    } catch (e) {
                        // Silently ignore pointer lock errors
                    }
                }
            }
        });
    }

    // Quit to Main Menu
    if (quitBtn) {
        quitBtn.addEventListener('click', () => {
            session.stop();
            window.location.href = 'index.html';
        });
    }

    // ESC Key
    window.addEventListener('keydown', (e) => {
        // INPUT GUARD: Block input if game is not active
        if (!session.isGameActive) return;

        if (e.code === 'Escape') {
            if (pauseMenu) {
                const isHidden = pauseMenu.classList.contains('hidden');
                if (isHidden) {
                    pauseMenu.classList.remove('hidden');
                    if (session.game) session.game.isPaused = true;
                    document.exitPointerLock();
                } else {
                    resumeBtn.click();
                }
            }
        }
    });

    // Pointer Lock Change Handler
    document.addEventListener('pointerlockchange', () => {
        if (!document.pointerLockElement && session.game && !session.game.isPaused && session.isGameActive) {
            // Auto-pause if pointer unlocks unexpectedly
            if (pauseMenu && pauseMenu.classList.contains('hidden')) {
                pauseMenu.classList.remove('hidden');
                session.game.isPaused = true;
            }
        }
    });
}

// START ON LOAD
window.addEventListener('load', initGame);
