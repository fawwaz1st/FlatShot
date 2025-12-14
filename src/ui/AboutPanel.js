/**
 * AboutPanel.js - Interactive About Panel with Storytelling
 * Visual timeline, animated stats, and feature showcase
 */

export class AboutPanel {
    constructor(menuController) {
        this.menuController = menuController;

        // DOM elements
        this.panelEl = document.getElementById('panelAbout');

        // Stats animation state
        this.statsAnimated = false;
    }

    /**
     * Initialize panel
     */
    init() {
        this._enhanceStoryHero();
        this._initStatCounters();
        this._initControlShowcase();
        this._initFeatureCards();
        this._observeVisibility();
    }

    /**
     * Enhance story hero section
     */
    _enhanceStoryHero() {
        const heroIcon = this.panelEl?.querySelector('.hero-icon');
        if (!heroIcon) return;

        // Add particle effect on hover
        heroIcon.addEventListener('mouseenter', () => {
            this._spawnParticles(heroIcon);
        });
    }

    /**
     * Spawn particles around element
     */
    _spawnParticles(element) {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < 8; i++) {
            const particle = document.createElement('span');
            particle.className = 'about-particle';
            particle.textContent = ['⚡', '✦', '★', '◆'][Math.floor(Math.random() * 4)];

            const angle = (i / 8) * Math.PI * 2;
            const distance = 40 + Math.random() * 20;

            particle.style.cssText = `
                position: fixed;
                left: ${centerX}px;
                top: ${centerY}px;
                font-size: ${10 + Math.random() * 10}px;
                color: var(--neon-cyan);
                opacity: 1;
                pointer-events: none;
                z-index: 1000;
                transform: translate(-50%, -50%);
                transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1);
            `;

            document.body.appendChild(particle);

            // Animate outward
            requestAnimationFrame(() => {
                particle.style.transform = `translate(
                    calc(-50% + ${Math.cos(angle) * distance}px),
                    calc(-50% + ${Math.sin(angle) * distance}px)
                )`;
                particle.style.opacity = '0';
            });

            // Remove after animation
            setTimeout(() => particle.remove(), 600);
        }
    }

    /**
     * Initialize stat counters with animation
     */
    _initStatCounters() {
        const statItems = this.panelEl?.querySelectorAll('.stat-item');

        statItems?.forEach(item => {
            const valueEl = item.querySelector('.stat-value');
            if (!valueEl) return;

            // Store original value
            valueEl.dataset.targetValue = valueEl.textContent;

            // Add hover glow effect
            item.addEventListener('mouseenter', () => {
                valueEl.style.textShadow = '0 0 20px var(--neon-cyan), 0 0 40px var(--neon-cyan)';
            });

            item.addEventListener('mouseleave', () => {
                valueEl.style.textShadow = '';
            });
        });
    }

    /**
     * Animate stats counter
     */
    _animateStats() {
        if (this.statsAnimated) return;
        this.statsAnimated = true;

        const statItems = this.panelEl?.querySelectorAll('.stat-item');

        statItems?.forEach((item, index) => {
            const valueEl = item.querySelector('.stat-value');
            if (!valueEl) return;

            const targetValue = valueEl.dataset.targetValue || valueEl.textContent;

            // Animate with delay
            setTimeout(() => {
                this._countUp(valueEl, targetValue);
            }, index * 200);
        });
    }

    /**
     * Count up animation
     */
    _countUp(element, targetValue) {
        // Check if it's a number
        const numericMatch = targetValue.match(/^(\d+)/);

        if (numericMatch) {
            const target = parseInt(numericMatch[1]);
            const suffix = targetValue.replace(/^\d+/, '');
            let current = 0;
            const step = Math.ceil(target / 20);
            const interval = setInterval(() => {
                current = Math.min(current + step, target);
                element.textContent = current + suffix;

                if (current >= target) {
                    clearInterval(interval);
                    element.textContent = targetValue;
                }
            }, 50);
        } else {
            // Non-numeric, just show with fade
            element.style.opacity = '0';
            element.textContent = targetValue;

            requestAnimationFrame(() => {
                element.style.transition = 'opacity 0.5s ease';
                element.style.opacity = '1';
            });
        }
    }

    /**
     * Initialize controls showcase
     */
    _initControlShowcase() {
        const controlItems = this.panelEl?.querySelectorAll('.control-item');

        controlItems?.forEach((item, index) => {
            const keyVisual = item.querySelector('.key-visual');

            // Staggered entrance animation
            item.style.opacity = '0';
            item.style.transform = 'translateY(10px)';

            // Mouse interaction
            item.addEventListener('mouseenter', () => {
                if (keyVisual) {
                    keyVisual.style.transform = 'scale(1.1)';
                    keyVisual.style.boxShadow = '0 0 15px var(--neon-cyan)';
                }
            });

            item.addEventListener('mouseleave', () => {
                if (keyVisual) {
                    keyVisual.style.transform = '';
                    keyVisual.style.boxShadow = '';
                }
            });

            // Keypress simulation on click
            item.addEventListener('click', () => {
                this._simulateKeypress(keyVisual);
            });
        });
    }

    /**
     * Simulate keypress animation
     */
    _simulateKeypress(keyVisual) {
        if (!keyVisual) return;

        keyVisual.style.transform = 'scale(0.9)';
        keyVisual.style.background = 'var(--neon-cyan)';
        keyVisual.style.color = '#000';

        setTimeout(() => {
            keyVisual.style.transform = '';
            keyVisual.style.background = '';
            keyVisual.style.color = '';
        }, 150);
    }

    /**
     * Initialize feature cards
     */
    _initFeatureCards() {
        const cards = this.panelEl?.querySelectorAll('.highlight-card');

        cards?.forEach((card, index) => {
            const icon = card.querySelector('.highlight-icon');

            // Add tilt effect on hover
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = (y - centerY) / 10;
                const rotateY = (centerX - x) / 10;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });

            // Icon spin on hover
            if (icon) {
                card.addEventListener('mouseenter', () => {
                    icon.style.transform = 'scale(1.2) rotate(10deg)';
                });

                card.addEventListener('mouseleave', () => {
                    icon.style.transform = '';
                });
            }
        });
    }

    /**
     * Observe visibility to trigger animations
     */
    _observeVisibility() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (this.panelEl?.classList.contains('show')) {
                        this._playEntranceAnimations();
                    }
                }
            });
        });

        if (this.panelEl) {
            observer.observe(this.panelEl, { attributes: true });
        }
    }

    /**
     * Play entrance animations
     */
    _playEntranceAnimations() {
        // Animate stats
        this._animateStats();

        // Animate control items
        const controlItems = this.panelEl?.querySelectorAll('.control-item');
        controlItems?.forEach((item, index) => {
            setTimeout(() => {
                item.style.transition = 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)';
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }, index * 50);
        });

        // Animate feature cards
        const cards = this.panelEl?.querySelectorAll('.highlight-card');
        cards?.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'scale(0.9)';

            setTimeout(() => {
                card.style.transition = 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
                card.style.opacity = '1';
                card.style.transform = 'scale(1)';
            }, 300 + index * 100);
        });
    }

    /**
     * Cleanup
     */
    dispose() {
        // No bound handlers to clean up
    }
}

export default AboutPanel;
