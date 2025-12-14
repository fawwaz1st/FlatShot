/**
 * SettingsPanel.js - Modular Settings Management
 * Scrollable, category-based settings with micro-interactions
 */

export class SettingsPanel {
    constructor(menuController) {
        this.menuController = menuController;

        // DOM elements
        this.panelEl = document.getElementById('panelOptions');

        // Settings storage
        this.settings = {};
        this.defaults = {
            sensitivity: 0.8,
            aimAssist: 0,
            startWeapon: 'pistol',
            gfxPreset: 'ultra',
            bloom: 0.7,
            fov: 70,
            renderScale: 1,
            fps: 60,
            volMaster: 1,
            volMusic: 0.15,
            volSfx: 1,
            menuSoundtrack: 'synth',
            gameSoundtrack: 'synth',
            reticleSize: 6,
            reticleColor: '#ffffff',
            reticleLock: false,
            language: 'id'
        };

        // Preset configurations
        this.presets = {
            realistic: { sensitivity: 0.6, bloom: 1.0, fov: 65, renderScale: 1.25 },
            competitive: { sensitivity: 1.2, bloom: 0.3, fov: 90, renderScale: 0.85 },
            performance: { sensitivity: 0.8, bloom: 0, fov: 70, renderScale: 0.7, fps: 120 },
            cinematic: { sensitivity: 0.5, bloom: 1.2, fov: 55, renderScale: 1.25, fps: 30 }
        };

        this._boundHandlers = {};
    }

    /**
     * Initialize settings panel
     */
    init() {
        this._loadSettings();
        this._bindControls();
        this._bindPresets();
        this._initCategoryCollapse();
        this._initCrosshairPreview();
        this._updateAllDisplayValues();
    }

    /**
     * Load settings from localStorage
     */
    _loadSettings() {
        try {
            const saved = localStorage.getItem('flatshot_settings');
            if (saved) {
                this.settings = { ...this.defaults, ...JSON.parse(saved) };
            } else {
                this.settings = { ...this.defaults };
            }
        } catch (_) {
            this.settings = { ...this.defaults };
        }

        // Apply loaded values to input elements
        this._applySettingsToInputs();
    }

    /**
     * Save settings to localStorage
     */
    _saveSettings() {
        try {
            localStorage.setItem('flatshot_settings', JSON.stringify(this.settings));
        } catch (_) {
            // Storage not available
        }
    }

    /**
     * Apply settings to input elements
     */
    _applySettingsToInputs() {
        const inputMappings = {
            sensitivity: 'sensitivity',
            aimAssist: 'aimAssist',
            startWeapon: 'startWeapon',
            gfxPreset: 'gfxPreset',
            bloom: 'bloom',
            fov: 'fov',
            renderScale: 'renderScale',
            fps: 'fps',
            volMaster: 'volMaster',
            volMusic: 'volMusic',
            volSfx: 'volSfx',
            menuSoundtrack: 'menuSoundtrack',
            gameSoundtrack: 'gameSoundtrack',
            reticleSize: 'reticleSize',
            reticleColor: 'reticleColor',
            reticleLock: 'reticleLock',
            language: 'langSelect'
        };

        Object.entries(inputMappings).forEach(([setting, inputId]) => {
            const input = document.getElementById(inputId);
            if (!input) return;

            if (input.type === 'checkbox') {
                input.checked = this.settings[setting];
            } else {
                input.value = this.settings[setting];
            }
        });
    }

    /**
     * Bind control events
     */
    _bindControls() {
        // Sliders
        this._bindSlider('sensitivity', 'sensitivityVal', (v) => v.toFixed(1));
        this._bindSlider('aimAssist', 'aimAssistVal', (v) => `${v}°`);
        this._bindSlider('bloom', 'bloomVal', (v) => v.toFixed(2));
        this._bindSlider('fov', 'fovVal', (v) => `${v}°`);
        this._bindSlider('renderScale', 'renderScaleVal', (v) => `${Math.round(v * 100)}%`);
        this._bindSlider('volMaster', 'volMasterVal', (v) => `${Math.round(v * 100)}%`);
        this._bindSlider('volMusic', 'volMusicVal', (v) => `${Math.round(v * 100)}%`);
        this._bindSlider('volSfx', 'volSfxVal', (v) => `${Math.round(v * 100)}%`);
        this._bindSlider('reticleSize', 'reticleSizeVal', (v) => `${v}px`);

        // Dropdowns
        this._bindSelect('startWeapon');
        this._bindSelect('gfxPreset');
        this._bindSelect('fps');
        this._bindSelect('menuSoundtrack');
        this._bindSelect('gameSoundtrack');
        this._bindSelect('langSelect', 'language');

        // Toggle
        this._bindToggle('reticleLock');

        // Color picker
        this._bindColorPicker('reticleColor');

        // Reset button
        const resetBtn = document.getElementById('reticleReset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this._resetCrosshairSettings();
            });
        }
    }

    /**
     * Bind slider with live value display
     */
    _bindSlider(inputId, displayId, formatter) {
        const input = document.getElementById(inputId);
        const display = document.getElementById(displayId);

        if (!input) return;

        const handler = () => {
            const value = parseFloat(input.value);
            this.settings[inputId] = value;

            if (display && formatter) {
                display.textContent = formatter(value);
            }

            this._saveSettings();
            this._applySliderFill(input);
            this._triggerMicroFeedback(input);
        };

        input.addEventListener('input', handler);
        this._boundHandlers[inputId] = { handler, element: input };

        // Apply initial fill
        this._applySliderFill(input);
    }

    /**
     * Apply gradient fill to slider track
     */
    _applySliderFill(slider) {
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const value = parseFloat(slider.value);
        const percent = ((value - min) / (max - min)) * 100;

        slider.style.background = `linear-gradient(90deg, 
            var(--neon-cyan) ${percent}%, 
            rgba(255,255,255,0.1) ${percent}%)`;
    }

    /**
     * Bind select dropdown
     */
    _bindSelect(inputId, settingKey = null) {
        const input = document.getElementById(inputId);
        if (!input) return;

        const key = settingKey || inputId;

        const handler = () => {
            this.settings[key] = input.value;
            this._saveSettings();
            this._triggerMicroFeedback(input);
        };

        input.addEventListener('change', handler);
        this._boundHandlers[inputId] = { handler, element: input };
    }

    /**
     * Bind toggle checkbox
     */
    _bindToggle(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        const handler = () => {
            this.settings[inputId] = input.checked;
            this._saveSettings();
            this._triggerMicroFeedback(input.closest('.modern-toggle') || input);
        };

        input.addEventListener('change', handler);
        this._boundHandlers[inputId] = { handler, element: input };
    }

    /**
     * Bind color picker
     */
    _bindColorPicker(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        const handler = () => {
            this.settings[inputId] = input.value;
            this._saveSettings();
            this._updateCrosshairPreview();
        };

        input.addEventListener('input', handler);
        this._boundHandlers[inputId] = { handler, element: input };
    }

    /**
     * Bind preset buttons
     */
    _bindPresets() {
        const presetButtons = {
            presetRealistic: 'realistic',
            presetCompetitive: 'competitive',
            presetPerformance: 'performance',
            presetCinematic: 'cinematic'
        };

        Object.entries(presetButtons).forEach(([btnId, presetName]) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;

            btn.addEventListener('click', () => {
                this._applyPreset(presetName);
                this._flashButton(btn);
            });
        });
    }

    /**
     * Apply preset configuration
     */
    _applyPreset(presetName) {
        const preset = this.presets[presetName];
        if (!preset) return;

        // Merge preset with current settings
        Object.entries(preset).forEach(([key, value]) => {
            this.settings[key] = value;
        });

        this._applySettingsToInputs();
        this._updateAllDisplayValues();
        this._saveSettings();
    }

    /**
     * Flash button effect
     */
    _flashButton(btn) {
        btn.style.transform = 'scale(0.95)';
        btn.style.boxShadow = '0 0 20px var(--neon-cyan)';

        setTimeout(() => {
            btn.style.transform = '';
            btn.style.boxShadow = '';
        }, 200);
    }

    /**
     * Initialize category collapse
     */
    _initCategoryCollapse() {
        const categoryHeaders = this.panelEl?.querySelectorAll('.category-header');

        categoryHeaders?.forEach(header => {
            header.style.cursor = 'pointer';

            header.addEventListener('click', () => {
                const category = header.closest('.settings-category');
                const content = category?.querySelector('.category-content');

                if (!content) return;

                const isCollapsed = category.classList.contains('collapsed');

                if (isCollapsed) {
                    category.classList.remove('collapsed');
                    content.style.maxHeight = content.scrollHeight + 'px';
                    setTimeout(() => {
                        content.style.maxHeight = '';
                    }, 300);
                } else {
                    content.style.maxHeight = content.scrollHeight + 'px';
                    void content.offsetHeight; // Trigger reflow
                    content.style.maxHeight = '0';
                    category.classList.add('collapsed');
                }
            });
        });
    }

    /**
     * Initialize crosshair preview
     */
    _initCrosshairPreview() {
        this._updateCrosshairPreview();
    }

    /**
     * Update crosshair preview
     */
    _updateCrosshairPreview() {
        const preview = document.getElementById('crosshairPreview');
        if (!preview) return;

        const size = this.settings.reticleSize || 6;
        const color = this.settings.reticleColor || '#ffffff';

        preview.style.width = `${size}px`;
        preview.style.height = `${size}px`;
        preview.style.background = color;
        preview.style.boxShadow = `0 0 ${size}px ${color}`;
    }

    /**
     * Reset crosshair settings
     */
    _resetCrosshairSettings() {
        this.settings.reticleSize = this.defaults.reticleSize;
        this.settings.reticleColor = this.defaults.reticleColor;
        this.settings.reticleLock = this.defaults.reticleLock;

        this._applySettingsToInputs();
        this._updateCrosshairPreview();
        this._saveSettings();

        // Update display values
        const sizeDisplay = document.getElementById('reticleSizeVal');
        if (sizeDisplay) sizeDisplay.textContent = `${this.defaults.reticleSize}px`;
    }

    /**
     * Update all display values
     */
    _updateAllDisplayValues() {
        // Trigger input events to update displays
        const sliders = this.panelEl?.querySelectorAll('.modern-slider');
        sliders?.forEach(slider => {
            this._applySliderFill(slider);
        });

        // Update text displays
        const displayUpdates = {
            sensitivityVal: (v) => v.toFixed(1),
            aimAssistVal: (v) => `${v}°`,
            bloomVal: (v) => v.toFixed(2),
            fovVal: (v) => `${v}°`,
            renderScaleVal: (v) => `${Math.round(v * 100)}%`,
            volMasterVal: (v) => `${Math.round(v * 100)}%`,
            volMusicVal: (v) => `${Math.round(v * 100)}%`,
            volSfxVal: (v) => `${Math.round(v * 100)}%`,
            reticleSizeVal: (v) => `${v}px`
        };

        const inputToSetting = {
            sensitivityVal: 'sensitivity',
            aimAssistVal: 'aimAssist',
            bloomVal: 'bloom',
            fovVal: 'fov',
            renderScaleVal: 'renderScale',
            volMasterVal: 'volMaster',
            volMusicVal: 'volMusic',
            volSfxVal: 'volSfx',
            reticleSizeVal: 'reticleSize'
        };

        Object.entries(displayUpdates).forEach(([displayId, formatter]) => {
            const display = document.getElementById(displayId);
            const settingKey = inputToSetting[displayId];

            if (display && settingKey && this.settings[settingKey] !== undefined) {
                display.textContent = formatter(this.settings[settingKey]);
            }
        });

        this._updateCrosshairPreview();
    }

    /**
     * Trigger micro feedback
     */
    _triggerMicroFeedback(element) {
        element.classList.add('micro-feedback');
        setTimeout(() => {
            element.classList.remove('micro-feedback');
        }, 150);
    }

    /**
     * Get current settings
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Cleanup
     */
    dispose() {
        Object.values(this._boundHandlers).forEach(({ handler, element }) => {
            if (element && handler) {
                element.removeEventListener('input', handler);
                element.removeEventListener('change', handler);
            }
        });

        this._boundHandlers = {};
    }
}

export default SettingsPanel;
