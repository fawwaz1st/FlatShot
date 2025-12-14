
import Game from './game.js';
import * as THREE from 'three';

export class MenuSession {
    constructor(container) {
        this.container = container;
        console.log("MenuSession: Initializing...");

        // Instantiate Game Engine for Menu
        this.game = new Game(this.container);

        // Initialize basic assets if needed, but for Menu we might just need 'setupLights'
        // MenuScene.js `enter()` sets up its own lights, but let's be safe.
        // We call enterMenuLoop which starts the loop.
    }

    start() {
        console.log("MenuSession: Start Loop");
        // Start Menu Loop
        this.game.enterMenuLoop();

        // Ensure lighting is robust for menu (Black screen prevention)
        // MenuScene.js lines 28-36 create lights, so it should be fine.
    }

    stop() {
        console.log("MenuSession: Stop");
        this.game.animating = false;
        this.game.cleanupScene();
    }

    dispose() {
        this.stop();
        const canvas = this.container.querySelector('canvas');
        if (canvas) canvas.remove();

        if (this.game) {
            if (this.game.renderer) this.game.renderer.dispose();
            this.game = null;
        }
    }
}
