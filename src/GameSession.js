import Game from './game.js';
import * as THREE from 'three';

export class GameSession {
    constructor(container, mode = 'standard', team = 'RED') {
        this.container = container;
        this.mode = mode;
        this.team = team;

        // INPUT GUARD: Block all input until game is truly ready
        this.isGameActive = false;

        // Head Bob State
        this._bobTime = 0;

        // Progress callback
        this._onProgress = null;

        console.log(`GameSession: Constructed. Mode=${mode}, Team=${team}`);
    }

    /**
     * Set progress callback for loading UI updates.
     * @param {(percent: number, status: string) => void} callback
     */
    onProgress(callback) {
        this._onProgress = callback;
    }

    _updateProgress(percent, status) {
        if (this._onProgress) {
            this._onProgress(percent, status);
        }
        console.log(`[Loading] ${percent}% - ${status}`);
    }

    /**
     * ASYNC INITIALIZE - Returns a Promise that resolves when ALL assets are ready.
     * This is the "True Async Loading" method.
     */
    async initialize() {
        try {
            // Phase 1: Core Setup (5%)
            this._updateProgress(5, 'Setting up renderer...');
            await this._yield();

            this.game = new Game(this.container);

            // Phase 2: Lighting (10%)
            this._updateProgress(10, 'Initializing lights...');
            await this._yield();

            if (!this.game.sun) {
                this.game.setupLights();
            }

            // Phase 3: Player Init (15%)
            this._updateProgress(15, 'Spawning player...');
            await this._yield();

            this.game.player.position = new THREE.Vector3(0, 10, 0);
            this.game.player.velocity = new THREE.Vector3(0, 0, 0);
            this.game.player.team = this.team;

            // Phase 4: Game Assets (20-60%)
            this._updateProgress(20, 'Loading game assets...');
            await this._yield();

            await this.game.initializeGameAssets();
            this._updateProgress(60, 'Assets loaded.');
            await this._yield();

            // Phase 5: Level Geometry (60-90%)
            this._updateProgress(65, 'Building world geometry...');
            await this._yield();

            // Call loadGameLevel but yield periodically (simulated stages)
            this.game.currentSceneMode = 'game';
            this._updateProgress(75, 'Generating terrain...');
            await this._yield();

            this.game.loadGameLevel(this.mode);
            this._updateProgress(90, 'Compiling shaders...');
            await this._yield();

            // Phase 6: Pre-compile Shaders (Critical for first-shot lag)
            if (this.game.renderer && this.game.renderer.compile) {
                this.game.renderer.compile(this.game.scene, this.game.camera);
            }

            // Phase 7: Finalize (100%)
            this._updateProgress(100, 'Ready!');
            await this._yield();

            // Hook Head Bob into loop
            this._hookHeadBob();

            console.log('GameSession: Initialization Complete.');
            return true;

        } catch (err) {
            console.error('GameSession: Initialization Failed!', err);
            this._updateProgress(0, `Error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Yield to browser render loop to prevent freeze.
     */
    _yield() {
        return new Promise(resolve => setTimeout(resolve, 16)); // ~1 frame
    }

    /**
     * Start the game loop (called AFTER countdown).
     */
    startGameLoop() {
        console.log('GameSession: Starting Game Loop');
        this.isGameActive = true;
        this.game.animating = true;
        try { this.game.startNextWave(); } catch (_) { }
        try { this.game._startTimeMs = performance.now(); } catch (_) { }
        try { this.game.startInGameMusicRotator(); } catch (_) { }
        this.game.loop();
    }

    _hookHeadBob() {
        const originalLoop = this.game.loop.bind(this.game);
        this.game.loop = () => {
            if (this.game.isPaused) {
                originalLoop();
                return;
            }
            this._updateHeadBob(this.game.clock.getDelta());
            originalLoop();
        };
    }

    _updateHeadBob(dt) {
        const player = this.game.player;
        const camera = this.game.camera;
        if (!player || !camera) return;

        const velocity = player.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

        if (speed > 0.1 && !player.jumping) {
            this._bobTime += dt * (speed * 1.5);
            const bobX = Math.cos(this._bobTime) * 0.05;
            const bobY = Math.sin(this._bobTime * 2) * 0.05;
            camera.position.y += bobY;
            camera.position.x += bobX * 0.5;
        } else {
            this._bobTime = 0;
        }
    }

    stop() {
        console.log('GameSession: Stop');
        this.isGameActive = false;
        this.game.animating = false;
        this.game.cleanupScene();
    }

    dispose() {
        this.stop();
        const canvas = this.container.querySelector('canvas');
        if (canvas) canvas.remove();
        this.game = null;
    }
}
