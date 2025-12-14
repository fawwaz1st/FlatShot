/**
 * UI Audio Manager
 * Global audio instance for UI sounds (works before game loads)
 */
import { AudioFX } from '../modules/audio.js';

// Singleton instance
let uiAudio = null;

export function getUIAudio() {
    if (!uiAudio) {
        uiAudio = new AudioFX();
    }
    return uiAudio;
}

/**
 * Attach hover and click sounds to all interactive UI elements
 */
export function attachUIAudioListeners() {
    const audio = getUIAudio();

    // Hover sounds for buttons and links
    const interactiveElements = document.querySelectorAll(
        'button, .menu-btn, .nav-link, a, [role="button"], .clickable'
    );

    interactiveElements.forEach(el => {
        if (el.dataset.audioAttached) return;
        el.dataset.audioAttached = 'true';

        el.addEventListener('mouseenter', () => {
            try { audio.hover(); } catch (_) { }
        });

        el.addEventListener('click', () => {
            try { audio.click(); } catch (_) { }
        });
    });
}

/**
 * Play specific UI sounds
 */
export const UISound = {
    hover: () => { try { getUIAudio().hover(); } catch (_) { } },
    click: () => { try { getUIAudio().click(); } catch (_) { } },
    pause: () => { try { getUIAudio().pause(); } catch (_) { } },
    resume: () => { try { getUIAudio().resume(); } catch (_) { } },
    error: () => { try { getUIAudio().error(); } catch (_) { } },
    countdown: (final = false) => { try { getUIAudio().countdown(final); } catch (_) { } },
    gameStart: () => { try { getUIAudio().gameStart(); } catch (_) { } },
    streak: () => { try { getUIAudio().streak(); } catch (_) { } },
    pickup: () => { try { getUIAudio().pickup(); } catch (_) { } },
    weaponSwitch: () => { try { getUIAudio().weaponSwitch(); } catch (_) { } }
};

// Auto-attach on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachUIAudioListeners);
} else {
    // DOM already loaded
    setTimeout(attachUIAudioListeners, 100);
}

// Re-attach when DOM changes (for dynamically added elements)
const observer = new MutationObserver(() => {
    setTimeout(attachUIAudioListeners, 50);
});

if (typeof document !== 'undefined' && document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
}
