/**
 * NavigationSidebar.js - Sidebar Navigation Component
 * Handles tab navigation with micro-interactions and visual feedback
 */

export class NavigationSidebar {
    constructor(menuController) {
        this.menuController = menuController;

        // Tab elements
        this.tabs = {
            start: document.getElementById('tabStart'),
            options: document.getElementById('tabOptions'),
            about: document.getElementById('tabAbout')
        };

        this._boundHandlers = {};
    }

    /**
     * Initialize navigation
     */
    init() {
        this._bindEvents();
        this._initMicroInteractions();
    }

    /**
     * Bind tab click events
     */
    _bindEvents() {
        Object.entries(this.tabs).forEach(([name, tab]) => {
            if (!tab) return;

            const clickHandler = (e) => {
                e.preventDefault();
                this._createRipple(e, tab);
                this.menuController.switchPanel(name);
            };

            const mouseEnterHandler = () => {
                this.menuController.playHoverSound();
                this._animateIcon(tab, true);
            };

            const mouseLeaveHandler = () => {
                this._animateIcon(tab, false);
            };

            tab.addEventListener('click', clickHandler);
            tab.addEventListener('mouseenter', mouseEnterHandler);
            tab.addEventListener('mouseleave', mouseLeaveHandler);

            // Store handlers for cleanup
            this._boundHandlers[name] = { clickHandler, mouseEnterHandler, mouseLeaveHandler };
        });
    }

    /**
     * Initialize micro-interactions
     */
    _initMicroInteractions() {
        // Add focus styles
        Object.values(this.tabs).forEach(tab => {
            if (!tab) return;

            tab.addEventListener('focus', () => {
                tab.classList.add('focused');
            });

            tab.addEventListener('blur', () => {
                tab.classList.remove('focused');
            });
        });
    }

    /**
     * Create ripple effect on click
     */
    _createRipple(event, element) {
        const ripple = document.createElement('span');
        ripple.className = 'nav-ripple';

        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        ripple.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
        `;

        element.appendChild(ripple);

        // Remove after animation
        setTimeout(() => ripple.remove(), 600);
    }

    /**
     * Animate icon on hover
     */
    _animateIcon(tab, isHovering) {
        const icon = tab.querySelector('.nav-icon');
        if (!icon) return;

        if (isHovering) {
            icon.style.transform = 'scale(1.2) rotate(-5deg)';
            icon.style.filter = 'drop-shadow(0 0 8px var(--neon-cyan))';
        } else {
            icon.style.transform = '';
            icon.style.filter = '';
        }
    }

    /**
     * Set active tab
     */
    setActiveTab(tabName) {
        Object.entries(this.tabs).forEach(([name, tab]) => {
            if (!tab) return;

            if (name === tabName) {
                tab.classList.add('active');
                this._pulseActiveIndicator(tab);
            } else {
                tab.classList.remove('active');
            }
        });
    }

    /**
     * Pulse animation for active indicator
     */
    _pulseActiveIndicator(tab) {
        const indicator = tab.querySelector('.active-indicator') || this._createActiveIndicator(tab);
        indicator.classList.remove('pulse');
        void indicator.offsetWidth; // Trigger reflow
        indicator.classList.add('pulse');
    }

    /**
     * Create active indicator element
     */
    _createActiveIndicator(tab) {
        const indicator = document.createElement('span');
        indicator.className = 'active-indicator';
        tab.appendChild(indicator);
        return indicator;
    }

    /**
     * Cleanup
     */
    dispose() {
        Object.entries(this.tabs).forEach(([name, tab]) => {
            if (!tab || !this._boundHandlers[name]) return;

            const { clickHandler, mouseEnterHandler, mouseLeaveHandler } = this._boundHandlers[name];
            tab.removeEventListener('click', clickHandler);
            tab.removeEventListener('mouseenter', mouseEnterHandler);
            tab.removeEventListener('mouseleave', mouseLeaveHandler);
        });

        this._boundHandlers = {};
    }
}

export default NavigationSidebar;
