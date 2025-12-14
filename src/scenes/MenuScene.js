import * as THREE from 'three';
import { MenuArena, MenuBot } from './menu/index.js';

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

        // 2. Lights (MAXIMUM VISIBILITY)
        this.scene.background = new THREE.Color(0x0a0a12); // Slightly blue-tinted dark
        // Subtle atmospheric fog
        this.scene.fog = new THREE.FogExp2(0x0a0a18, 0.008); // Very light fog for depth

        // Hemisphere Light (sky + ground bounce)
        const hemiLight = new THREE.HemisphereLight(0x88ccff, 0x444422, 2.0);
        this.scene.add(hemiLight);

        // Strong Ambient Light
        const ambient = new THREE.AmbientLight(0xffffff, 5.0);
        this.scene.add(ambient);

        // Key Light - Main directional
        const dirLight = new THREE.DirectionalLight(0xffffff, 8.0);
        dirLight.position.set(20, 40, 20);
        this.scene.add(dirLight);

        // Fill Light - Opposite side
        const fillLight = new THREE.DirectionalLight(0x88aaff, 4.0);
        fillLight.position.set(-20, 30, -20);
        this.scene.add(fillLight);

        // Accent Point Lights at arena edges
        const accent1 = new THREE.PointLight(0x00ffff, 3.0, 100);
        accent1.position.set(-50, 20, 0);
        this.scene.add(accent1);

        const accent2 = new THREE.PointLight(0xff3366, 3.0, 100);
        accent2.position.set(50, 20, 0);
        this.scene.add(accent2);

        this.lights = [hemiLight, ambient, dirLight, fillLight, accent1, accent2];

        // 3. Init Arena
        this.arena = new MenuArena(this.game);

        // 4. Init Squads
        this._spawnSquad('blue', -30);
        this._spawnSquad('red', 30);

        this.animating = true;
    }

    _spawnSquad(team, x) {
        // 12 bots per team (24 total): 4 Assault, 4 Flanker, 4 Sniper
        const spacing = 8;

        // 4 Assault - Front line
        for (let i = 0; i < 4; i++) {
            const z = (i - 1.5) * spacing;
            this.bots.push(new MenuBot(this.scene, team, 'ASSAULT', x, z));
        }

        // 4 Flanker - Sides
        for (let i = 0; i < 4; i++) {
            const z = (i - 1.5) * spacing * 1.2;
            const offsetX = x * 0.7;
            this.bots.push(new MenuBot(this.scene, team, 'FLANKER', offsetX, z));
        }

        // 4 Sniper - Back line
        for (let i = 0; i < 4; i++) {
            const z = (i - 1.5) * spacing * 0.8;
            const offsetX = x * 1.4;
            this.bots.push(new MenuBot(this.scene, team, 'SNIPER', offsetX, z));
        }
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
