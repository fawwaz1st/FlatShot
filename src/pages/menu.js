import { MenuSession } from '../MenuSession.js';
import { MENU_HTML } from '../ui/layouts.js';

// --- STATE MANAGEMENT ---
const APP_CONTAINER = document.getElementById('canvas-container');
const UI_LAYER = document.getElementById('ui-layer');

let menuSession = null;

// Initialize Menu
function initMenu() {
    console.log("Menu Initializing...");

    // 1. Inject Menu UI
    UI_LAYER.innerHTML = MENU_HTML;
    bindMenuEvents();

    // 2. Start Menu Session (Live Preview 3D)
    if (!menuSession) {
        menuSession = new MenuSession(APP_CONTAINER);
        menuSession.start();
    }
}

function bindMenuEvents() {
    // Accordion Logic (Copied from main.js)
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

            if (!targetMenu) return;

            if (targetMenu.classList.contains('open')) {
                closeAllSubmenus();
                return;
            }
            closeAllSubmenus();
            targetMenu.classList.add('open');
            targetMenu.style.maxHeight = '500px';
            targetMenu.style.opacity = '1';
            btn.classList.add('active');
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.accordion-menu')) {
            closeAllSubmenus();
        }
    });

    // --- BUTTONS LOGIC (MPA REDIRECTS) ---

    // 1. Single Player / Vote -> vote.html
    const btnQuick = document.getElementById('btn-quickmatch');
    if (btnQuick) {
        btnQuick.addEventListener('click', () => {
            // Unload Live Preview
            if (menuSession) menuSession.dispose();
            // Redirect
            window.location.href = 'vote.html';
        });
    }

    // 2. Multiplayer -> multiplayer.html
    const btnServer = document.getElementById('btn-server');
    if (btnServer) {
        btnServer.addEventListener('click', () => {
            // Unload Live Preview
            if (menuSession) menuSession.dispose();
            // Redirect
            window.location.href = 'multiplayer.html';
        });
    }

    // Settings (Example)
    const volMasterEl = document.getElementById('volMaster');
    if (volMasterEl) {
        volMasterEl.addEventListener('input', (e) => {
            // LocalStorage logic can go here
        });
    }
}

// Start
window.addEventListener('load', initMenu);
