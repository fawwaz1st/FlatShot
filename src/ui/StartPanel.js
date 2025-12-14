/**
 * StartPanel.js - Enhanced Start Panel Component
 * Hero section with animated elements and play button interactions
 */

export class StartPanel {
    constructor(menuController) {
        this.menuController = menuController;

        // DOM elements
        this.panelEl = document.getElementById('panelStart');
        this.playBtn = document.getElementById('playBtn');
        this.restartBtn = document.getElementById('restartBtn');

        this._boundHandlers = {};
    }

    /**
     * Initialize panel
     */
    init() {
        this._bindEvents();
        this._initAnimations();
    }

    /**
     * Bind button events
     */
    _bindEvents() {
        if (this.playBtn) {
            const playClickHandler = (e) => {
                this._createButtonBurst(e, this.playBtn);
            };

            const playEnterHandler = () => {
                this._enhanceButtonGlow(this.playBtn, true);
            };

            const playLeaveHandler = () => {
                this._enhanceButtonGlow(this.playBtn, false);
            };

            this.playBtn.addEventListener('click', playClickHandler);
            this.playBtn.addEventListener('mouseenter', playEnterHandler);
            this.playBtn.addEventListener('mouseleave', playLeaveHandler);

            this._boundHandlers.playBtn = { playClickHandler, playEnterHandler, playLeaveHandler };
        }

        // Feature tags hover effects
        const featureTags = this.panelEl?.querySelectorAll('.tag');
        featureTags?.forEach((tag, index) => {
            tag.addEventListener('mouseenter', () => {
                tag.style.transform = 'scale(1.1) translateY(-2px)';
                tag.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            });

            tag.addEventListener('mouseleave', () => {
                tag.style.transform = '';
            });

            // Staggered entrance animation
            tag.style.animationDelay = `${index * 0.1}s`;
        });
    }

    /**
     * Initialize panel animations
     */
    _initAnimations() {
        // Add entrance animation class when panel becomes visible
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (this.panelEl?.classList.contains('show')) {
                        this._playEntranceAnimation();
                    }
                }
            });
        });

        if (this.panelEl) {
            observer.observe(this.panelEl, { attributes: true });
        }
    }

    /**
     * Play entrance animation
     */
    _playEntranceAnimation() {
        const heading = this.panelEl?.querySelector('h2');
        const description = this.panelEl?.querySelector('p');
        const button = this.playBtn;
        const hints = this.panelEl?.querySelector('.controls-hint');

        const elements = [heading, description, button, hints].filter(Boolean);

        elements.forEach((el, index) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';

            setTimeout(() => {
                el.style.transition = 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, index * 100);
        });
    }

    /**
     * Create button burst effect
     */
    _createButtonBurst(event, button) {
        const burst = document.createElement('span');
        burst.className = 'btn-burst';

        const rect = button.getBoundingClientRect();
        burst.style.left = `${event.clientX - rect.left}px`;
        burst.style.top = `${event.clientY - rect.top}px`;

        button.appendChild(burst);

        // Remove after animation
        setTimeout(() => burst.remove(), 500);
    }

    /**
     * Enhance button glow on hover
     */
    _enhanceButtonGlow(button, isHovering) {
        if (isHovering) {
            button.style.boxShadow = `
                0 10px 40px rgba(0, 240, 255, 0.5),
                0 0 60px rgba(0, 240, 255, 0.3),
                inset 0 2px 0 rgba(255, 255, 255, 0.3)
            `;
        } else {
            button.style.boxShadow = '';
        }
    }

    /**
     * Show restart button
     */
    showRestartButton() {
        this.restartBtn?.classList.remove('hidden');
    }

    /**
     * Hide restart button
     */
    hideRestartButton() {
        this.restartBtn?.classList.add('hidden');
    }

    /**
     * Cleanup
     */
    dispose() {
        if (this.playBtn && this._boundHandlers.playBtn) {
            const { playClickHandler, playEnterHandler, playLeaveHandler } = this._boundHandlers.playBtn;
            this.playBtn.removeEventListener('click', playClickHandler);
            this.playBtn.removeEventListener('mouseenter', playEnterHandler);
            this.playBtn.removeEventListener('mouseleave', playLeaveHandler);
        }

        this._boundHandlers = {};
    }
}

export default StartPanel;
