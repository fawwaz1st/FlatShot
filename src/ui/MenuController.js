/**
 * MenuController.js - Main Menu Orchestrator
 * Coordinates all menu panels and navigation with micro-interactions
 */

import { NavigationSidebar } from './NavigationSidebar.js';
import { StartPanel } from './StartPanel.js';
import { SettingsPanel } from './SettingsPanel.js';
import { AboutPanel } from './AboutPanel.js';

export class MenuController {
    constructor(game) {
        this.game = game;
        this.currentPanel = 'start';
        this.isTransitioning = false;

        // Initialize sub-components
        this.navigation = new NavigationSidebar(this);
        this.startPanel = new StartPanel(this);
        this.settingsPanel = new SettingsPanel(this);
        this.aboutPanel = new AboutPanel(this);

        // Cache DOM elements
        this.menuEl = document.getElementById('menu');
        this.panels = {
            start: document.getElementById('panelStart'),
            options: document.getElementById('panelOptions'),
            about: document.getElementById('panelAbout')
        };

        this._bindEvents();
    }

    /**
     * Initialize all components
     */
    init() {
        this.navigation.init();
        this.startPanel.init();
        this.settingsPanel.init();
        this.aboutPanel.init();

        // Set initial panel
        this.switchPanel('start', false);
    }

    /**
     * Bind global menu events
     */
    _bindEvents() {
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.menuEl?.classList.contains('hidden')) return;

            // Tab key for cycling panels
            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                this._cyclePanel(1);
            } else if (e.key === 'Tab' && e.shiftKey) {
                e.preventDefault();
                this._cyclePanel(-1);
            }
        });
    }

    /**
     * Cycle through panels
     */
    _cyclePanel(direction) {
        const panelOrder = ['start', 'options', 'about'];
        const currentIndex = panelOrder.indexOf(this.currentPanel);
        const newIndex = (currentIndex + direction + panelOrder.length) % panelOrder.length;
        this.switchPanel(panelOrder[newIndex]);
    }

    /**
     * Switch to a different panel with transition
     */
    switchPanel(panelName, animate = true) {
        if (this.isTransitioning || this.currentPanel === panelName) return;
        if (!this.panels[panelName]) return;

        this.isTransitioning = true;

        // Play audio feedback
        this._playClickSound();

        // Update navigation state
        this.navigation.setActiveTab(panelName);

        const currentPanelEl = this.panels[this.currentPanel];
        const newPanelEl = this.panels[panelName];

        if (animate) {
            // Fade out current panel
            currentPanelEl?.classList.add('panel-exit');

            setTimeout(() => {
                // Hide current panel
                currentPanelEl?.classList.remove('show', 'panel-exit');

                // Show new panel with entrance animation
                newPanelEl?.classList.add('panel-enter', 'show');

                setTimeout(() => {
                    newPanelEl?.classList.remove('panel-enter');
                    this.isTransitioning = false;
                }, 300);
            }, 200);
        } else {
            // Instant switch (no animation)
            Object.values(this.panels).forEach(p => p?.classList.remove('show'));
            newPanelEl?.classList.add('show');
            this.isTransitioning = false;
        }

        this.currentPanel = panelName;
    }

    /**
     * Play menu click sound
     */
    _playClickSound() {
        try {
            this.game?.audio?.menuClick?.();
        } catch (_) {
            // Audio not available
        }
    }

    /**
     * Play hover sound
     */
    playHoverSound() {
        try {
            this.game?.audio?.menuHover?.();
        } catch (_) {
            // Audio not available
        }
    }

    /**
     * Show the menu
     */
    show() {
        this.menuEl?.classList.remove('hidden');
    }

    /**
     * Hide the menu
     */
    hide() {
        this.menuEl?.classList.add('hidden');
    }

    /**
     * Get game reference
     */
    getGame() {
        return this.game;
    }

    /**
     * Cleanup
     */
    dispose() {
        this.navigation.dispose();
        this.startPanel.dispose();
        this.settingsPanel.dispose();
        this.aboutPanel.dispose();
    }
}

export default MenuController;
