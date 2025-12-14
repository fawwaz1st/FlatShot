import * as THREE from 'three';
import { MenuArena } from './menu/MenuArena.js';
import { MenuBot } from './menu/MenuBot.js';

export class MenuScene {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.arena = null;
        this.bots = [];
        this.animating = false;
    }

    enter() {
        console.log("Entering Modular Menu Scene (Dynamic Arena)");

        // 1. Camera
        this.game.camera.position.set(0, 45, 55);
        this.game.camera.lookAt(0, 0, 0);
        this.game.camera.fov = 45;
        this.game.camera.updateProjectionMatrix();

        // 2. Lights (CRITICAL VISIBILITY FIX)
        this.scene.background = new THREE.Color(0x111111); // Dark Gray
        // Hack: Reduce fog density locally for menu clarity
        if (this.scene.fog) this.scene.fog.density = 0.015;

        // Fail-safe Ambient Light (Forces everything to be visible)
        const ambient = new THREE.AmbientLight(0xffffff, 3.5); // Boosted
        this.scene.add(ambient);

        // Key Light for Shape Definition
        const dirLight = new THREE.DirectionalLight(0xffffff, 5.0); // Boosted
        dirLight.position.set(10, 20, 10);
        dirLight.lookAt(0, 0, 0); // Ensure it points to center
        this.scene.add(dirLight);
        this.lights = [ambient, dirLight];

        // 3. Init Arena
        this.arena = new MenuArena(this.game);

        // 4. Init Squads
        this._spawnSquad('blue', -30);
        this._spawnSquad('red', 30);

        this.animating = true;
    }

    _spawnSquad(team, x) {
        // 2 Assault, 2 Flanker, 2 Sniper
        this.bots.push(new MenuBot(this.scene, team, 'ASSAULT', x, -5));
        this.bots.push(new MenuBot(this.scene, team, 'ASSAULT', x, 5));

        this.bots.push(new MenuBot(this.scene, team, 'FLANKER', x, -20));
        this.bots.push(new MenuBot(this.scene, team, 'FLANKER', x, 20));

        this.bots.push(new MenuBot(this.scene, team, 'SNIPER', x * 1.2, -8));
        this.bots.push(new MenuBot(this.scene, team, 'SNIPER', x * 1.2, 8));
    }

    update(dt) {
        if (!this.animating) return;

        // Visual Layout update (Dynamic Shuffle)
        if (this.arena) {
            this.arena.update(dt, this.bots);
        }

        // Bot Logic
        this.bots.forEach(bot => bot.update(dt, this.arena, this.bots));

        // Camera Orbit
        const time = performance.now() * 0.0001;
        this.game.camera.position.x = Math.sin(time) * 60;
        this.game.camera.position.z = Math.cos(time) * 60;
        this.game.camera.lookAt(0, 0, 0);
    }

    exit() {
        this.animating = false;
        if (this.arena) this.arena.destroy();
        this.bots.forEach(b => b.destroy());
        this.lights.forEach(l => this.scene.remove(l));
        this.arena = null;
        this.bots = [];
    }
}
