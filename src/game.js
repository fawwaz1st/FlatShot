import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { PostFXShader } from './game/postProcess.js';
import { MenuScene } from './scenes/MenuScene.js';
import { VotingScene } from './scenes/VotingScene.js';
import { SpatialHash } from './game/spatialHash.js';
import { TextureGenerator } from './rendering/TextureGenerator.js';

import { Enemy } from './modules/enemy.js';
import { Ally } from './modules/ally.js';
import { AmmoPickup, SkillPickup } from './modules/pickup.js';
import { HUD } from './modules/hud.js';
import { AudioFX } from './modules/audio.js';
import { Grenade } from './modules/grenade.js';
import { createChatOverlayUI } from './game/chatUI.js';
import { createInputState } from './game/input.js';
import { attachAI } from './game/ai.js';
import { attachFallbackSpawner } from './game/fallback.js';
import { attachGameLoop } from './game/loop.js';
import { attachSpawnManager } from './managers/spawnManager.js';
import { attachInputManager } from './managers/inputManager.js';
import { attachUIManager } from './managers/uiManager.js';
import { attachEnemyManager } from './managers/enemyManager.js';
import { attachPoolManager } from './managers/poolManager.js';
import { attachHudController } from './game/hudController.js';
import { attachPlayerController } from './game/playerController.js';
import { attachWeaponController } from './game/weaponController.js';
import { attachPoolController } from './game/poolController.js';
import { attachUIController } from './game/uiController.js';
import { attachEffectsController } from './game/effectsController.js';
import { attachPickupController } from './game/pickupController.js';

// New modules
import { MapGenerator, MapTypes, getAvailableMaps } from './game/MapGenerator.js';
import { createAllyModel, createEnemyModel, updateCharacterVisuals } from './game/CharacterVisuals.js';
import { ValueValidator, FrameLimiter, SpatialHashGrid, LODManager, SessionManager, disposeObject } from './systems/OptimizationSecurity.js';
import { pathfinding } from './ai/Pathfinding.js';

/**
 * Helper function to check if a Vector3 has valid (non-NaN) coordinates.
 * Prevents "Computed radius is NaN" errors in BufferGeometry.
 */
function isValidVector3(v) {
	return v &&
		typeof v.x === 'number' && !isNaN(v.x) && isFinite(v.x) &&
		typeof v.y === 'number' && !isNaN(v.y) && isFinite(v.y) &&
		typeof v.z === 'number' && !isNaN(v.z) && isFinite(v.z);
}

export default class Game {

	constructor(container = document.body) {
		this.container = container;
		this.clock = new THREE.Clock();
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x000000);
		this.scene.fog = new THREE.FogExp2(0x000000, 0.025);

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.setSize(window.innerWidth, window.innerHeight); // Will update on resize
		this.container.appendChild(this.renderer.domElement);

		this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
		this.camera.position.set(0, 1.6, 5);

		this.controls = new PointerLockControls(this.camera, this.renderer.domElement);

		this.composer = new EffectComposer(this.renderer);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.25, 0.85);
		this.composer.addPass(this.bloom);

		this.postFX = new ShaderPass(PostFXShader);
		this.postFX.uniforms['resolution'].value = new THREE.Vector2(window.innerWidth, window.innerHeight);
		this.composer.addPass(this.postFX);

		// deteksi perangkat low-memory untuk opsi performa otomatis
		try {
			const mem = navigator.deviceMemory || 8;
			this._lowEnd = (mem <= 4);
			if (this._lowEnd) {
				// agresif menurunkan kualitas default pada perangkat low-end
				this.bloom.strength = 0.0;
				this.config.renderScale = 0.7;
				this.targetFps = 45;
				this._minFrameTime = 1 / this.targetFps;
				this.config.particles = Math.min(this.config.particles, 120);
				this.config.drawDistance = Math.min(this.config.drawDistance, 500);
				// turunkan pixel ratio & ukuran renderer untuk mengurangi GPU/VRAM
				try { const pr = Math.min(window.devicePixelRatio || 1, 1.0) * this.config.renderScale; this.renderer.setPixelRatio(pr); this.renderer.setSize(Math.floor(window.innerWidth * this.config.renderScale), Math.floor(window.innerHeight * this.config.renderScale)); this.composer.setSize(Math.floor(window.innerWidth * this.config.renderScale), Math.floor(window.innerHeight * this.config.renderScale)); } catch (_) { }
			}
		} catch (_) { this._lowEnd = false; }

		this.hud = new HUD();
		this.audio = new AudioFX();

		this.input = this.createInputState();
		this.targetFps = 60; // default
		this._accum = 0; this._minFrameTime = 1 / this.targetFps;
		this.player = {
			velocity: new THREE.Vector3(),
			speedWalk: 5,
			speedRun: 8.5,
			radius: 0.4,
			health: 100,
			kills: 0,
			ammoInMag: 15,
			magSize: 15,
			ammoReserve: 60,
			grenades: 2,
			fireRate: 7,
			lastShotTime: 0,
			reloading: false,
			y: 1.6,
			vy: 0,
			jumping: false,
			weapon: 'pistol'
		};

		this.world = {
			bounds: 400,
			obstacles: [],
			enemies: [],
			allies: [],
			pickups: [],
			grenades: [],
			score: 0,
			lastPickupSpawn: 0
		};

		this.config = {
			difficulty: 'normal',
			sensitivity: 0.8,
			bloom: 0.7,
			aimAssistDeg: 0,
			fov: 70,
			renderScale: 1,
			fogDensity: 0.02,
			drawDistance: 600,
			particles: 400
		};

		this.raycaster = new THREE.Raycaster();
		this.tmpVec3 = new THREE.Vector3();
		this.shake = { amp: 0, decay: 2.5 };
		this._lastIndicatorMs = 0;
		this._lastEnemyShotSfxMs = 0;
		this._lastEnemyTracerMs = 0;
		this._shakeOffset = new THREE.Vector3();
		this._shakeTime = 0;
		this._lastHurtSfxMs = 0;
		this._fovBase = this.camera.fov;
		this._activeMuzzleLight = null;
		this._impactDecals = [];
		this._switchAnim = { active: false, t: 0, dir: 1, duration: 0.18, target: 'pistol', onComplete: null };
		this._deathAnim = { active: false, t: 0 };
		this._spawnLocked = false; // mencegah spawn beruntun dalam frame yang sama

		// Fix: Initialize runtime arrays/objects to prevent 'undefined' access
		this._sceneLights = [];
		this.weapon = {}; // Placeholder to prevent access errors before createWeapon()

		// Initialize optimization systems
		this.sessionManager = new SessionManager();
		this.frameLimiter = new FrameLimiter(this.targetFps);
		this.spatialHash = new SpatialHashGrid(15);
		this.lodManager = new LODManager();
		this.mapGenerator = new MapGenerator(this.scene);
		this._availableMaps = getAvailableMaps();
		this._currentMapType = 'arena';

		// this.setupLights();
		// Defer world loading until start() or explicitly called.
		// Instead, load Menu Scene by default.
		this.menuScene = new MenuScene(this);
		this.currentSceneMode = 'menu';
		this._worldLoaded = false; // GUARD: World not loaded yet
		this._gameInitialized = false; // GUARD: Heavy game assets not loaded
		this.menuScene.enter();

		// this.setupWorld(); // Moved to loadGameLevel
		// this.createWeapon(); // Moved/Called later
		this.setupEvents();
		// spawnInitialAllies dipanggil setelah manager spawn di-attach (dipindahkan ke bawah)

		this._selectedAllyIndex = -1; // index ally terpilih, -1 = all
		try { attachAI(this); } catch (_) { }
		// attach controllers synchronously
		try { attachPlayerController(this); } catch (e) { console.error('[Game] attachPlayerController error', e); }
		try { attachWeaponController(this); } catch (e) { console.error('[Game] attachWeaponController error', e); }
		try { attachPoolController(this); } catch (e) { console.error('[Game] attachPoolController error', e); }
		try { attachUIController(this); } catch (e) { console.error('[Game] attachUIController error', e); }
		try { attachEffectsController(this); } catch (e) { console.error('[Game] attachEffectsController error', e); }
		try { attachPickupController(this); } catch (e) { console.error('[Game] attachPickupController error', e); }
		this.createChatOverlayUI();

		// GUARD: Defer heavy world assets until game starts
		// These will be called in initializeGameAssets() when game starts
		// this.createAmbientParticles(); // Deferred
		// this._initPools(); // Deferred  
		// this.createSunSprite(); // Deferred

		// attach HUD controller
		try { attachHudController(this); } catch (e) { console.error('[Game] attachHudController error', e); }
		// initial HUD flush requested after controller attaches
		try { this.markHudDirty && this.markHudDirty(); } catch (_) { }
		this.powerups = { shield: 0, damage: 0, speed: 0 };
		this._streak = { count: 0, timer: 0 };
		// Wave system removed; use time-based difficulty
		this._playTimeSeconds = this._playTimeSeconds || 0;
		this._playTimeAccum = this._playTimeAccum || 0;

		// GUARD: Defer spawn managers until game starts
		try { attachFallbackSpawner(this); } catch (_) { }
		try { attachInputManager(this); } catch (_) { }
		try { attachUIManager(this); } catch (_) { }
		// Spawn manager and allies will be initialized when game starts
		// try { attachSpawnManager(this); } catch (_) { } // Deferred
		// try { if (typeof this.spawnInitialAllies === 'function') { this.spawnInitialAllies(); } } catch (_) { } // Deferred
		try { attachEnemyManager(this); } catch (_) { }
		try { attachGameLoop(this); } catch (_) { }
		try { attachPoolManager(this); } catch (_) { }
		this._inGameMusic = { playing: false, intervalId: null, nextChangeAt: 0 };
		this._inGamePlaylist = ['bgm_loop', 'synth', 'chill', 'electro', 'cinematic']; // names (synth will fallback)
		this.startInGameMusicRotator = function () {
			try {
				if (!this.audio) return;
				this._inGameMusic.playing = true;
				const scheduleNext = (delayMs) => { this._inGameMusic.nextChangeAt = performance.now() + delayMs; };
				// pick initial
				const pickAndPlay = () => {
					try {
						// choose available sample from playlist or synthesized fallback
						const choices = this._inGamePlaylist.filter(x => !!x);
						let name = choices[Math.floor(Math.random() * choices.length)];
						// ensure synthesized sample exists
						try { if (!this.audio._samples[name]) { this.audio.synthesizeSample(name); } } catch (_) { }
						try { this.audio.stopLoopSample('bgm_game'); } catch (_) { }
						try { this.audio.playLoopSample(name, { volume: 0.12 }); } catch (_) { try { this.audio.playLoopSample('bgm_loop', { volume: 0.12 }); } catch (_) { } }
						// next change in 60-180s
						const next = 60000 + Math.floor(Math.random() * 120000);
						scheduleNext(next);
					} catch (_) { }
				};
				pickAndPlay();
				// interval that checks timing
				this._inGameMusic.intervalId = setInterval(() => {
					try { if (!this._inGameMusic.playing) return; if (performance.now() >= (this._inGameMusic.nextChangeAt || 0)) { pickAndPlay(); } } catch (_) { }
				}, 3000);
			} catch (_) { }
		};
		this.stopInGameMusicRotator = function () { try { this._inGameMusic.playing = false; if (this._inGameMusic.intervalId) { clearInterval(this._inGameMusic.intervalId); this._inGameMusic.intervalId = null; } try { this.audio.stopLoopSample('bgm_game'); } catch (_) { } } catch (_) { } };
	}

	setAimAssistDegrees(deg) {
		this.config.aimAssistDeg = Math.max(0, Math.min(10, deg));
	}

	createSunSprite() {
		const g = new THREE.SphereGeometry(0.6, 16, 16);
		const m = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
		this.sunSprite = new THREE.Mesh(g, m);
		this.scene.add(this.sunSprite);
	}

	setDifficulty(level) {
		this.config.difficulty = level;
	}
	setSensitivity(mult) {
		this.config.sensitivity = mult;
		// PointerLockControls tidak expose sensitivitas langsung,
		// kita bisa skala gerakan kamera via rotation factor sederhana
		this.controls.pointerSpeed = 1.0 * mult; // properti internal dipakai oleh three examples
	}
	setBloom(value) {
		this.config.bloom = value;
		this.bloom.strength = value;
	}

	setStartWeapon(w) {
		this.player.weapon = (w === 'grenade') ? 'grenade' : 'pistol';
		if (this.player.weapon === 'grenade' && this.player.grenades <= 0) this.player.grenades = 2;
	}

	// Graphic options
	setFov(deg) {
		this.config.fov = Math.max(50, Math.min(110, deg));
		this.camera.fov = this.config.fov; this.camera.updateProjectionMatrix();
		this._fovBase = this.config.fov;
	}
	setRenderScale(scale) {
		this.config.renderScale = Math.max(0.5, Math.min(1.25, scale));
		const base = Math.min(window.devicePixelRatio, 2);
		this.renderer.setPixelRatio(base * this.config.renderScale);
		this.composer.setSize(window.innerWidth, window.innerHeight);
	}
	setFogDensity(d) { this.config.fogDensity = Math.max(0, Math.min(0.06, d)); this.scene.fog.density = this.config.fogDensity; }
	setDrawDistance(dist) { this.config.drawDistance = Math.max(150, Math.min(1500, dist)); this.camera.far = this.config.drawDistance; this.camera.updateProjectionMatrix(); }
	setParticles(count) {
		this.config.particles = Math.max(0, Math.min(2000, Math.floor(count)));
		if (this.particles) { this.scene.remove(this.particles); this.particles.geometry.dispose(); this.particles.material.dispose(); this.particles = null; }
		if (this.config.particles > 0) this.createAmbientParticles();
	}
	applyGraphicsPreset(p) {
		// low/medium/high/ultra
		switch (p) {
			case 'low': this.setRenderScale(0.7); this.setBloom(0.3); this.setFogDensity(0.01); this.setParticles(150); this.setDrawDistance(500); break;
			case 'medium': this.setRenderScale(0.9); this.setBloom(0.5); this.setFogDensity(0.02); this.setParticles(300); this.setDrawDistance(600); break;
			case 'high': this.setRenderScale(1.0); this.setBloom(0.7); this.setFogDensity(0.02); this.setParticles(400); this.setDrawDistance(800); break;
			case 'ultra': default: this.setRenderScale(1.1); this.setBloom(0.9); this.setFogDensity(0.025); this.setParticles(600); this.setDrawDistance(1000); break;
		}
	}

	applySkill(key) {
		if (!key) return;
		switch (key) {
			case 'overcharge':
				this.perks = this.perks || {};
				this.perks.damageMult = Math.max(1.0, (this.perks.damageMult || 1.0) * 1.5);
				break;
			case 'aegis':
				this.perks = this.perks || {};
				this.perks.shield = (this.perks.shield || 0) + 50;
				break;
			case 'adrenal':
				this.player.speedWalk *= 1.35; this.player.speedRun *= 1.35; this.player.fireRate = (this.player.fireRate || 7) * 1.25;
				break;
			case 'quickdraw':
				this.perks = this.perks || {};
				this.perks.reloadSpeedMult = 0.7; // reload faster
				this.player.ammoReserve += 20; break;
			case 'vigor':
				this.player.health = Math.min(100 + 25, (this.player.health || 100) + 25); this.player._maxHealth = (this.player._maxHealth || 100) + 25; break;
			case 'demolisher':
				this.player.grenades = (this.player.grenades || 0) + 1; this.perks = this.perks || {}; this.perks.grenadeDmg = (this.perks.grenadeDmg || 1.0) * 1.3; break;
			case 'scavenger':
				this.perks = this.perks || {}; this.perks.scavenger = (this.perks.scavenger || 0) + 1; break;
			case 'marksman':
				// buff allies accuracy
				for (const a of (this.world.allies || [])) { try { a.accuracy = Math.min(0.99, (a.accuracy || 0.7) * 1.4); } catch (_) { } }
				break;
			case 'steelskin':
				this.perks = this.perks || {}; this.perks.steelskin = (this.perks.steelskin || 0) + 1; break;
			case 'overwatch':
				for (const a of (this.world.allies || [])) { try { a.accuracy = Math.min(0.98, (a.accuracy || 0.7) * 1.12); } catch (_) { } }
				break;
			default: break;
		}
		try { this.markHudDirty && this.markHudDirty(); } catch (_) { }
	}

	createInputState() {
		// delegasikan pembuatan input state ke modul eksternal (createInputState menerima game instance)
		return createInputState(this);
	}

	enterMenuLoop() {
		if (!this.animating) {
			this.animating = true;
			this.loop();
		}
	}

	setupLights() {
		// Clean up existing lights safely
		if (this._sceneLights) {
			this._sceneLights.forEach(l => {
				if (l && l.parent) l.parent.remove(l);
			});
		}
		this._sceneLights = [];

		// 1. Hemisphere Light (Sky + Ground) - Always ensures visibility
		const hemi = new THREE.HemisphereLight(0x444444, 0x222222, 1.0);
		this.scene.add(hemi);
		this._sceneLights.push(hemi);

		// 2. Direct Sun Light
		this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
		this.sun.position.set(50, 100, 50);
		this.sun.castShadow = true;
		this.sun.shadow.mapSize.width = 2048;
		this.sun.shadow.mapSize.height = 2048;
		this.sun.shadow.camera.near = 0.5;
		this.sun.shadow.camera.far = 500;
		this.sun.shadow.camera.left = -100;
		this.sun.shadow.camera.right = 100;
		this.sun.shadow.camera.top = 100;
		this.sun.shadow.camera.bottom = -100;
		this.scene.add(this.sun);
		this._sceneLights.push(this.sun);

		// 3. Ambient fallback
		const amb = new THREE.AmbientLight(0xffffff, 0.4);
		this.scene.add(amb);
		this._sceneLights.push(amb);
	}

	setupWorld() {
		console.log("[Game] Setting up world environment...");

		// 1. Lights
		this.setupLights();

		// 2. Skybox / Background
		this.scene.background = new THREE.Color(0x050505);
		this.scene.fog = new THREE.FogExp2(0x050505, 0.015);
	}

	cleanupScene() {
		console.log('[Game] Cleaning up scene...');

		// 1. Dispose Level Objects
		if (this._levelObjects) {
			this._levelObjects.forEach(obj => {
				this.scene.remove(obj);
				if (obj.geometry) obj.geometry.dispose();
				if (obj.material) {
					if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
					else obj.material.dispose();
				}
			});
			this._levelObjects = [];
		}

		// 2. Clear Entities (Enemies, Allies)
		const clearEntity = (e) => {
			if (e.mesh) {
				this.scene.remove(e.mesh);
				e.mesh.traverse(c => {
					if (c.geometry) c.geometry.dispose();
					if (c.material) {
						if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
						else c.material.dispose();
					}
				});
			}
		};
		if (this.world.enemies) this.world.enemies.forEach(clearEntity);
		if (this.world.allies) this.world.allies.forEach(clearEntity);

		this.world.enemies = [];
		this.world.allies = [];
		this.world.obstacles = [];
		this.world.pickups = [];

		// 3. Clear Lights
		if (this._sceneLights) {
			this._sceneLights.forEach(l => {
				this.scene.remove(l);
				if (l.dispose) l.dispose();
			});
			this._sceneLights = [];
		}
		this.sun = null;

		// 4. Reset Flags
		this._worldLoaded = false;

		// 5. Cleanup Menu/Voting Scenes if active
		if (this.menuScene) this.menuScene.exit();
		if (this.votingScene) this.votingScene.exit();

		// 6. Force GC hint (optional, Three.js handles mostly)
		this.renderer.renderLists.dispose();
	}

	enterVoting() {
		// Transition: Menu -> Voting
		if (this.currentSceneMode === 'menu') {
			this.menuScene.exit();
		}
		this.cleanupScene(); // Heavy cleanup

		// Fix: Initialize arrays to prevent crash when pushing voting options
		this.voteCandidates = [];
		this.activeVotes = [];

		this.currentSceneMode = 'voting';
		this.votingScene = new VotingScene(this);
		this.votingScene.enter();

		// Add simple ambient light for voting phase
		const amb = new THREE.AmbientLight(0xffffff, 0.5);
		this.scene.add(amb);
		this._sceneLights.push(amb);
	}

	/**
	 * Set the map type to load
	 * @param {string} mapType - One of: 'arena', 'city', 'warehouse', 'fortress', 'highway'
	 */
	setMapType(mapType) {
		if (this._availableMaps.find(m => m.id === mapType)) {
			this._currentMapType = mapType;
			console.log(`[Game] Map type set to: ${mapType}`);
		} else {
			console.warn(`[Game] Unknown map type: ${mapType}, using arena`);
			this._currentMapType = 'arena';
		}
	}

	/**
	 * Get available maps for UI
	 */
	getAvailableMaps() {
		return this._availableMaps;
	}

	enterGame(mode, mapType) {
		console.log(`[Game] Entering Game with Mode: ${mode}, Map: ${mapType || this._currentMapType}`);
		if (mapType) this.setMapType(mapType);
		this.cleanupScene();
		// Start Async Load Sequence
		this.startGameSequence(mode);
	}

	assignTeams() {
		// Assign Player Team
		this.player.team = (Math.random() > 0.5 ? 'RED' : 'BLUE');
		console.log(`[Game] Player assigned to Team ${this.player.team}`);
		// Store team config for spawning
		this.teamConfig = {
			player: this.player.team,
			enemy: (this.player.team === 'RED' ? 'BLUE' : 'RED')
		};
	}

	updateLoadingProgress(percent, msg) {
		const bar = document.getElementById('loading-bar-fill');
		const text = document.getElementById('loading-text');
		if (bar) bar.style.width = percent + '%';
		if (text) text.innerText = msg + ` (${Math.round(percent)}%)`;
	}

	startGameSequence(mode) {
		// Reset State
		this.isPaused = false;
		if (this.controls) this.controls.unlock();

		// 1. Show Loading Screen
		if (!document.getElementById('loading-screen')) {
			(async () => {
				try {
					const layouts = await import('./ui/layouts.js');
					const div = document.createElement('div');
					div.innerHTML = layouts.LOADING_SCREEN_HTML;
					document.body.appendChild(div.firstElementChild);
				} catch (e) { console.warn("Loading screen UI failed", e); }
			})();
		}

		console.log("[Game] Starting Async Load Sequence...");
		// Use a slight delay to allow UI to mount
		setTimeout(async () => {
			try {
				this.updateLoadingProgress(0, "Initializing Engine...");
				await new Promise(r => setTimeout(r, 50));

				// 2. Init Assets (Async)
				this.currentSceneMode = 'game';

				// Texture Gen
				this.updateLoadingProgress(20, "Generating Textures...");
				await new Promise(r => setTimeout(r, 50));

				if (!this._cachedGridTex) {
					this._cachedGridTex = TextureGenerator.createGrid(512, 512, '#30cfd0', '#2a2a35', 2);
					this._cachedWallTex = TextureGenerator.createGrid(512, 512, '#ff0055', '#220a10', 2);
				}

				this.updateLoadingProgress(40, "Loading Assets...");
				await new Promise(r => setTimeout(r, 50));

				// 3. Init Heavy Assets
				await this.initializeGameAssets();

				this.updateLoadingProgress(60, "Building World...");
				await new Promise(r => setTimeout(r, 50));

				// 4. Load Level Geometry
				this.loadGameLevel(mode);

				this.updateLoadingProgress(90, "Finalizing...");
				await new Promise(r => setTimeout(r, 300));

				// Force Camera Reset to prevent being stuck in 0,0,0 inside geometry
				if (this.camera) {
					this.camera.position.set(0, 5, 0); // Safe height
					this.camera.lookAt(0, 5, 20);
					this.camera.updateProjectionMatrix();
				}
				if (this.player) {
					this.player.position.set(0, 5, 0);
					this.player.velocity.set(0, 0, 0);
				}
				if (this.controls && this.controls.getObject()) {
					this.controls.getObject().position.set(0, 5, 0);
				}

				// Reset Clock
				this.clock.start();
				this._accum = 0;

				this.updateLoadingProgress(100, "Ready!");
				await new Promise(r => setTimeout(r, 200));

				// 5. Remove Loading Screen
				const screen = document.getElementById('loading-screen');
				if (screen) screen.remove();

				// 6. Start Match Countdown
				this.startMatchCountdown(3);

			} catch (e) {
				console.error("Critical Load Error:", e);
				// Check for user-friendly error
				alert("Error Loading Game: " + e.message);
				const screen = document.getElementById('loading-screen');
				if (screen) screen.remove();
			}
		}, 100);
	}

	startMatchCountdown(seconds) {
		// Create Overlay
		let overlay = document.getElementById('countdown-overlay');
		if (!overlay) {
			overlay = document.createElement('div');
			overlay.id = 'countdown-overlay';
			document.body.appendChild(overlay);
		}

		overlay.classList.add('show');
		let count = seconds;

		const tick = () => {
			if (count > 0) {
				overlay.textContent = count;
				try { this.audio.click(); } catch (_) { }
				setTimeout(tick, 1000);
				count--;
			} else {
				overlay.textContent = "GO!";
				try { this.audio.start(); } catch (_) { } // start fight music logic if any
				setTimeout(() => {
					overlay.classList.remove('show');
					this.startLoop(); // UNLOCK INPUT AND START LOOP
					// Lock pointer now if needed?
					// actually better to ask user to click if not locked, but loop starts logic.
					// Pointer lock usually requires user interaction event. 
					// We assume user clicked "Vote" or "Menu" previously, but async might break "User Activation".
					// show "Click to Start" if lock failed? 
					// For now, auto-start.
				}, 500);
			}
		};
		tick();
	}

	startLoop() {
		// Actually start gameplay logic
		this.animating = true;
		try { this.startNextWave(); } catch (_) { }
		try { this._startTimeMs = performance.now() - ((this._playTimeSeconds || 0) * 1000); } catch (_) { this._startTimeMs = undefined; }
		try { this.startInGameMusicRotator(); } catch (_) { }
		this.loop();
	}

	// Fix: Missing method to lazy-load assets
	// Fix: Missing method to lazy-load assets (Now returns Promise)
	initializeGameAssets() {
		if (this._gameInitialized) return Promise.resolve();
		console.log("[Game] Initializing heavy assets...");
		this.setupWorld();
		this.createWeapon();

		// FIX: Force Hard Reset of Player Position/Velocity to prevent NaN
		// CRITICAL Fix for "Black Screen of Death"
		if (this.player) {
			this.player.velocity = new THREE.Vector3(0, 0, 0);
			this.player.y = 10.0; // Force valid Y (High spawn)
			this.player.vy = 0;
			this.player.jumping = false;
			// Safe check for position if it exists (User request compliance)
			if (this.player.position && typeof this.player.position.set === 'function') {
				this.player.position.set(0, 10, 0);
			}
		}
		if (this.camera) {
			this.camera.position.set(0, 10, 0);
			this.camera.rotation.set(0, 0, 0);
		}
		if (this.controls && this.controls.getObject()) {
			this.controls.getObject().position.set(0, 10, 0);
		}

		this._gameInitialized = true;
		return Promise.resolve();
	}

	loadGameLevel() {
		// Prevent double loading
		if (this.currentSceneMode === 'game' && this._worldLoaded) return;
		this.currentSceneMode = 'game';

		// GUARD: Initialize game assets if not yet done
		this.initializeGameAssets();

		// Mark world as loading
		this._worldLoaded = true;
		console.log('[Game] Loading game level...');

		// Initialize object tracker if not exists
		this._levelObjects = [];

		// Re-add game lights if they were removed or ensure they match
		this.setupLights();

		const bounds = this.world.bounds;


		// Load World Geometry
		// Optimization: Cache textures to prevent slow loading on reload
		let gridTex, wallTex;
		if (this._cachedGridTex) {
			gridTex = this._cachedGridTex;
			wallTex = this._cachedWallTex;
		} else {
			gridTex = TextureGenerator.createGrid(512, 512, '#30cfd0', '#2a2a35', 2);
			wallTex = TextureGenerator.createGrid(512, 512, '#ff0055', '#220a10', 2);
			this._cachedGridTex = gridTex;
			this._cachedWallTex = wallTex;
		}

		const floorGeo = new THREE.PlaneGeometry(bounds * 4, bounds * 4, 1, 1);

		// Tiling texture
		gridTex.repeat.set(80, 80);
		const floorMat = new THREE.MeshStandardMaterial({
			map: gridTex,
			color: 0x888888,
			roughness: 0.2,
			metalness: 0.6,
			emissive: 0x0a101a,
			emissiveIntensity: 0.2
		});
		const floor = new THREE.Mesh(floorGeo, floorMat);
		floor.rotation.x = -Math.PI / 2;
		floor.receiveShadow = false;
		floor.position.y = 0;
		floor.name = 'level_floor';
		this.scene.add(floor);
		this._levelObjects.push(floor);

		wallTex.repeat.set(10, 2);
		const wallMat = new THREE.MeshStandardMaterial({
			map: wallTex,
			color: 0xaaaaaa,
			roughness: 0.2,
			metalness: 0.8,
			emissive: 0x220011,
			emissiveIntensity: 0.4
		});
		const wallH = 10, wallT = 0.8;
		const walls = [
			new THREE.BoxGeometry(bounds * 2, wallH, wallT),
			new THREE.BoxGeometry(bounds * 2, wallH, wallT),
			new THREE.BoxGeometry(wallT, wallH, bounds * 2),
			new THREE.BoxGeometry(wallT, wallH, bounds * 2)
		];
		const wallMeshes = [
			new THREE.Mesh(walls[0], wallMat),
			new THREE.Mesh(walls[1], wallMat),
			new THREE.Mesh(walls[2], wallMat),
			new THREE.Mesh(walls[3], wallMat)
		];
		wallMeshes[0].position.set(0, wallH / 2, -bounds);
		wallMeshes[1].position.set(0, wallH / 2, bounds);
		wallMeshes[2].position.set(-bounds, wallH / 2, 0);
		wallMeshes[3].position.set(bounds, wallH / 2, 0);

		for (let i = 0; i < wallMeshes.length; i++) {
			const w = wallMeshes[i];
			w.name = 'level_wall_' + i;
			this.scene.add(w);
			this._levelObjects.push(w);
			this.world.obstacles.push(new THREE.Box3().setFromObject(w));
		}

		// Pillars
		const pillarTex = TextureGenerator.createGrid(256, 256, '#30cfd0', '#000000', 4);
		pillarTex.repeat.set(1, 4);
		const pillarMat = new THREE.MeshStandardMaterial({
			map: pillarTex, color: 0x444455, roughness: 0.3, metalness: 0.8, emissive: 0x001122, emissiveIntensity: 0.5
		});
		const pillarCount = 96;
		const pillarGeo = new THREE.CylinderGeometry(0.8, 0.8, 1, 12);
		const pillarInst = new THREE.InstancedMesh(pillarGeo, pillarMat, pillarCount);
		let pi = 0;
		for (let i = 0; i < pillarCount; i++) {
			const r = bounds * 0.85 * Math.random();
			const a = Math.random() * Math.PI * 2;
			const x = Math.cos(a) * r;
			const z = Math.sin(a) * r;
			const h = 2 + Math.random() * 6;
			const pos = new THREE.Vector3(x, h / 2, z);
			const m = new THREE.Matrix4();
			const q = new THREE.Quaternion();
			const s = new THREE.Vector3(1, h, 1);
			m.compose(pos, q, s);
			pillarInst.setMatrixAt(pi, m);
			this.world.obstacles.push({ type: 'pillar', mesh: { position: pos }, half: new THREE.Vector3(0.8, h / 2, 0.8), instanceId: pi });
			pi++;
		}
		pillarInst.instanceMatrix.needsUpdate = true;
		this.scene.add(pillarInst);
		this._levelObjects.push(pillarInst);
		this._pillarInst = pillarInst;

		// Platforms
		const platTex = TextureGenerator.createGrid(256, 256, '#00ffff', '#111111', 2);
		const platMat = new THREE.MeshStandardMaterial({
			map: platTex, color: 0x223344, roughness: 0.4, emissive: 0x001111, emissiveIntensity: 0.3
		});
		const platCount = 36;
		const platGeo = new THREE.BoxGeometry(1, 1, 1);
		const platInst = new THREE.InstancedMesh(platGeo, platMat, platCount);
		let pi2 = 0;
		for (let i = 0; i < platCount; i++) {
			const w = 8 + Math.random() * 12;
			const d = 8 + Math.random() * 12;
			const y = 2 + Math.random() * 4;
			const pos = new THREE.Vector3((Math.random() - 0.5) * bounds * 1.6, y, (Math.random() - 0.5) * bounds * 1.6);
			const m = new THREE.Matrix4();
			const q = new THREE.Quaternion();
			const s = new THREE.Vector3(w, 0.6, d);
			m.compose(pos, q, s);
			platInst.setMatrixAt(pi2, m);
			this.world.obstacles.push({ type: 'platform', mesh: { position: pos }, half: new THREE.Vector3(w / 2, 0.3, d / 2), instanceId: pi2 });
			pi2++;
		}
		platInst.instanceMatrix.needsUpdate = true;
		this.scene.add(platInst);
		this._levelObjects.push(platInst);
		this._platInst = platInst;

		// Buildings
		const bmat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.85 });
		const buildingCount = 48;
		const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
		const buildingInst = new THREE.InstancedMesh(buildingGeo, bmat, buildingCount);
		let bi = 0;
		for (let i = 0; i < buildingCount; i++) {
			const bw = 6 + Math.random() * 10;
			const bh = 4 + Math.random() * 8;
			const bd = 6 + Math.random() * 10;
			const pos = new THREE.Vector3((Math.random() - 0.5) * bounds * 1.4, bh / 2, (Math.random() - 0.5) * bounds * 1.4);
			const m = new THREE.Matrix4();
			const q = new THREE.Quaternion();
			const s = new THREE.Vector3(bw, bh, bd);
			m.compose(pos, q, s);
			buildingInst.setMatrixAt(bi, m);
			this.world.obstacles.push({ type: 'building', mesh: { position: pos }, half: new THREE.Vector3(bw / 2, bh / 2, bd / 2), instanceId: bi });
			bi++;
		}
		buildingInst.instanceMatrix.needsUpdate = true;
		this.scene.add(buildingInst);
		this._levelObjects.push(buildingInst);
		this._buildingInst = buildingInst;

		// Roads
		const roadMat = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.9, metalness: 0.05 });
		for (let i = 0; i < 10; i++) {
			const w = 6 + Math.random() * 8; const l = bounds * (0.6 + Math.random() * 0.6);
			const road = new THREE.Mesh(new THREE.BoxGeometry(l, 0.1, w), roadMat);
			road.position.set((Math.random() - 0.5) * bounds * 0.6, 0.05, (Math.random() - 0.5) * bounds * 0.6);
			this.scene.add(road);
			this._levelObjects.push(road);
			this.world.obstacles.push({ type: 'road', mesh: { position: road.position }, half: new THREE.Vector3(l / 2, 0, w / 2) });
		}

		// Stairs
		const stairMat = new THREE.MeshStandardMaterial({ color: 0x1b2933, roughness: 0.85 });
		for (let s = 0; s < 12; s++) {
			const sx = (Math.random() - 0.5) * bounds * 1.0; const sz = (Math.random() - 0.5) * bounds * 1.0;
			const steps = 4 + Math.floor(Math.random() * 6);
			for (let k = 0; k < steps; k++) {
				const box = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 1.4), stairMat);
				box.position.set(sx + k * 0.9, 0.2 + k * 0.4, sz);
				this.scene.add(box);
				this._levelObjects.push(box);
				this.world.obstacles.push({ type: 'stair', mesh: { position: box.position }, half: new THREE.Vector3(1.5, 0.2, 0.7) });
			}
		}

		// Initialize SpatialHash
		this.spatialHash = new SpatialHash(bounds, 20);
		for (const o of this.world.obstacles) {
			this.spatialHash.insert(o);
		}

		// Start enemy meshes map (for hit detection visual)
		this._enemyMeshes = this.world.enemies.map(e => e.mesh);

		// Create initial weapon if needed
		this.createWeapon();
	}

	unloadGameLevel() {
		// Destroy Level Objects
		if (this._levelObjects) {
			this._levelObjects.forEach(obj => {
				this.scene.remove(obj);
				if (obj.geometry) obj.geometry.dispose();
				if (obj.material) obj.material.dispose();
			});
			this._levelObjects = [];
		}

		// Clear Enemies, Allies, Projectiles
		if (this.world.enemies) this.world.enemies.forEach(e => { try { e.mesh && this.scene.remove(e.mesh); } catch (_) { } });
		if (this.world.allies) this.world.allies.forEach(a => { try { a.mesh && this.scene.remove(a.mesh); } catch (_) { } });
		// Reset Arrays
		this.world.enemies = [];
		this.world.allies = [];
		this.world.pickups = [];
		this.world.obstacles = [];
		this.world.score = 0;
		this._playTimeSeconds = 0;

		if (this.player.weaponMesh) {
			this.scene.remove(this.player.weaponMesh);
			this.player.weaponMesh = null;
		}

		// Return to Menu State
		this.currentSceneMode = 'menu';
		this._worldLoaded = false;
		if (this._sceneLights) {
			this._sceneLights.forEach(l => this.scene.remove(l));
			this._sceneLights = [];
		}

		if (this.menuScene) this.menuScene.enter();
	}

	onWindowResize() {
		if (!this.camera || !this.renderer) return;
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();

		const scale = this.config.renderScale || 1.0;
		const width = Math.floor(window.innerWidth * scale);
		const height = Math.floor(window.innerHeight * scale);

		this.renderer.setSize(width, height);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale);

		if (this.composer) {
			this.composer.setSize(width, height);
		}
		if (this.postFX && this.postFX.uniforms['resolution']) {
			this.postFX.uniforms['resolution'].value.set(width, height);
		}
	}



	startNextWave() {
		try {
			const impl = this.startNextWave; const proto = Object.getPrototypeOf(this).startNextWave;
			if (impl && impl !== proto) return impl.call(this);
		} catch (_) { }
		// no-op fallback
	}

	updateWave(dt) {
		try {
			const impl = this.updateWave; const proto = Object.getPrototypeOf(this).updateWave;
			if (impl && impl !== proto) return impl.call(this, dt);
		} catch (_) { }
	}

	createWeapon() {
		const group = new THREE.Group();
		const basePos = new THREE.Vector3(0.18, -0.14, -0.2);
		const baseRot = new THREE.Euler(-0.03, 0.08, 0);
		group.position.copy(basePos);
		group.rotation.set(baseRot.x, baseRot.y, baseRot.z);
		const metal = new THREE.MeshStandardMaterial({ color: 0x8a9ab8, roughness: 0.4, metalness: 0.7 });
		const accent = new THREE.MeshStandardMaterial({ color: 0x30cfd0, roughness: 0.5, metalness: 0.2 });
		const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.18), metal);
		group.add(body);

		const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 16), metal);
		barrel.rotation.z = Math.PI / 2;
		barrel.position.set(0.08, 0.0, -0.35);
		group.add(barrel);

		const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), metal);
		grip.position.set(-0.04, -0.09, -0.06);
		group.add(grip);

		const sight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.06), accent);
		sight.position.set(0.02, 0.035, -0.07);
		group.add(sight);

		const muzzle = new THREE.Object3D();
		muzzle.position.set(0.18, 0.0, -0.52);
		group.add(muzzle);

		const flash = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }));
		flash.visible = false;
		muzzle.add(flash);

		this.weapon = {
			group,
			muzzle,
			flash,
			recoilX: 0,
			recoilY: 0,
			recoilZ: 0,
			trajLine: null,
			trajPositions: null,
			basePos,
			baseRot
		};
		this.camera.add(group);
	}

	setupEvents() {
		const el = this.renderer.domElement;
		window.addEventListener('resize', this.onWindowResize.bind(this));
		el.addEventListener('click', () => {
			if (this.currentSceneMode === 'game' && !this.controls.isLocked) {
				// Wrap in try-catch to handle SecurityError when user exits lock early
				try {
					this.controls.lock();
				} catch (e) {
					// Silently ignore pointer lock errors
				}
				this.dispatchResumeHUD();
				// Ensure AudioContext is resumed
				if (this.audio && this.audio.context && this.audio.context.state === 'suspended') {
					this.audio.context.resume();
				}
			}
		});
		this.controls.addEventListener('lock', () => {
			this.dispatchResumeHUD();
		});
		this.controls.addEventListener('unlock', () => {
			try {
				// Jika overlay chat terbuka atau input chat sedang fokus, jangan otomatis pause ketika pointer lock hilang
				const chatEl = document.getElementById('chatOverlay');
				const chatInput = document.getElementById('chatInput');
				const menuEl = document.getElementById('menu');
				const isChatActive = chatEl && chatEl.style.display !== 'none' && (chatInput === document.activeElement || chatInput && chatInput.value !== undefined);
				if (isChatActive) {
					// hanya lakukan unfocus minor, jangan tampilkan menu pause
					try { if (chatInput) chatInput.blur(); } catch (_) { }
					return;
				}
				// normal behavior: pause to menu
				this.pauseToMenu();
			} catch (_) { try { this.pauseToMenu(); } catch (_) { } }
		});

		window.addEventListener('blur', () => {
			// Only pause if in-game. Menu mode continues running with animations.
			if (this.currentSceneMode === 'game') {
				try { this.pauseGameplay(); } catch (_) { }
			}
			// Menu mode: animations and particles continue uninterrupted
		});
		window.addEventListener('resize', () => {
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(window.innerWidth, window.innerHeight);
			this.composer.setSize(window.innerWidth, window.innerHeight);
		});
		// Throttle rendering/logic when tab not visible to save CPU/GPU
		document.addEventListener('visibilitychange', () => {
			try {
				if (document.hidden) {
					// reduce FPS to light background value
					this._savedFps = this.targetFps;
					this.setFps(15);
				} else {
					if (typeof this._savedFps !== 'undefined') this.setFps(this._savedFps || 60);
					this._savedFps = undefined;
				}
			} catch (_) { }
		});
		// chat toggle handled inside createChatOverlayUI (no blocking prompt)
	}



	pauseToMenu() {
		// gunakan CustomEvent agar caller bisa menentukan apakah ingin buka menu penuh atau hanya overlay ringan
		window.dispatchEvent(new CustomEvent('game:showMenu', { detail: { fullMenu: false } }));
	}

	// Pause gameplay loop (stop world updates, keep state intact)
	pauseGameplay() {
		if (!this.animating) return;
		this._wasAnimating = this.animating;
		this.animating = false;
		// reset clock delta to avoid large dt on resume
		try { this.clock.getDelta(); } catch (_) { }
		// audio: duck music & play pause sfx
		try { if (this.audio) { this.audio.duckBgm(0.25, 120); this.audio.menuClick && this.audio.menuClick(); } } catch (_) { }
		// bloom/VFX: increase bloom for pause feel (store old value)
		try { this._bloomBeforePause = (this.bloom && this.bloom.strength) || 0; if (this.bloom) this.bloom.strength = Math.min(3.0, (this._bloomBeforePause || 0) + 0.9); } catch (_) { }
		// notify UI to apply pause overlay/vfx
		try { window.dispatchEvent(new Event('game:paused')); } catch (_) { }
		// stop in-game music rotator
		try { this.stopInGameMusicRotator(); } catch (_) { }
	}

	// Resume gameplay loop immediately (caller should ensure countdown/UI handled)
	resumeGameplay() {
		if (this.animating) return;
		this.animating = true;
		// reset clock to avoid jumps
		try { this.clock.getDelta(); } catch (_) { }
		// re-sync startTime reference so HUD stopwatch continues smoothly
		try { this._startTimeMs = performance.now() - ((this._playTimeSeconds || 0) * 1000); } catch (_) { }
		this.loop();
		try { if (this.audio) { this.audio.restoreBgm && this.audio.restoreBgm(); } } catch (_) { }
		// restore bloom/VFX
		try { if (this.bloom && typeof this._bloomBeforePause !== 'undefined') { this.bloom.strength = this._bloomBeforePause; this._bloomBeforePause = undefined; } } catch (_) { }
		try { window.dispatchEvent(new Event('game:resumed')); } catch (_) { }
		// resume in-game music rotator
		try { this.startInGameMusicRotator(); } catch (_) { }
	}

	dispatchResumeHUD() {
		window.dispatchEvent(new Event('game:resumeHUD'));
	}

	loop() {
		if (!this.animating) return;
		requestAnimationFrame(() => this.loop());
		const dtRaw = this.clock.getDelta();
		this._accum += dtRaw;
		if (this._accum < this._minFrameTime) return; // limiter FPS
		const dt = Math.min(0.05, this._accum);
		this._accum = 0;

		// Siklus siang-malam: ubah posisi matahari dan warna langit/fog
		const cyc = (performance.now() * 0.00005) % (Math.PI * 2);
		const elev = Math.sin(cyc);
		// make sun move on larger orbit and dynamic height
		const sunOrbit = Math.max(60, this.world.bounds * 0.3);
		this.sun.position.set(Math.cos(cyc) * sunOrbit, 20 + elev * (sunOrbit * 0.12), Math.sin(cyc) * sunOrbit);
		// adjust sun intensity to simulate day/night
		this.sun.intensity = Math.max(0.2, 0.9 + elev * 0.6);
		if (this.sunSprite) this.sunSprite.position.copy(this.sun.position);
		this.scene.background.setHSL(0.62, 0.5, 0.05 + (elev * 0.03 + 0.04));
		this.scene.fog.color.setHSL(0.62, 0.4, 0.05 + (elev * 0.03 + 0.04));

		// Hapus offset shake sebelumnya agar movement & kolisi tidak terpengaruh
		if (this._shakeOffset && (this._shakeOffset.x || this._shakeOffset.y || this._shakeOffset.z)) {
			this.camera.position.sub(this._shakeOffset);
			this._shakeOffset.set(0, 0, 0);
		}

		// update inputs (gamepad)
		try { if (typeof this.updateGamepad === 'function') this.updateGamepad(dt); } catch (_) { }

		// update player via playerController
		if (this.currentSceneMode === 'game') {
			// Pause Check (Pointer Lock)
			if (this.controls && !this.controls.isLocked) {
				if (!this.isPaused) {
					this.isPaused = true;
					const pm = document.getElementById('pauseMenu');
					if (pm) pm.classList.remove('hidden');
				}
			} else {
				if (this.isPaused) {
					this.isPaused = false;
					const pm = document.getElementById('pauseMenu');
					if (pm) pm.classList.add('hidden');
				}
			}

			if (this.isPaused) return; // Stop updates if paused

			try { if (typeof this.updatePlayer === 'function') this.updatePlayer(dt); } catch (_) { }
			this.updateEnemies(dt);
			this.updateWave(dt);
			this.updateAllies(dt);
			this.updatePickups(dt);
			this.updateGrenades(dt);
			this.updateWeapon(dt);
			this.updateCameraShake(dt);
			this.updateWeaponSwitch(dt);
			this.updateDeathAnim(dt);
			this.updateParticles(dt);
			this.updateGrenadeAim(dt);
			this.updatePowerups(dt);
			this.handleFireInputs();
		} else if (this.currentSceneMode === 'menu') {
			// Update menu scene
			this.menuScene.update(dt);
		}

		// adaptive culling update setiap beberapa frame untuk mengurangi overhead
		this._cullTick = (this._cullTick || 0) + 1;
		if ((this._cullTick % 10) === 0) try { this.updateAdaptiveCulling(); } catch (_) { }

		// reset edge flags per frame
		this.input.shootPressed = false;
		this.input.shootReleased = false;

		// pool housekeeping: decay TTL dan recycle
		this._poolTick(dt);

		// render: gunakan composer kecuali device low-end -> pakai renderer langsung
		if (this._lowEnd) {
			this.renderer.render(this.scene, this.camera);
		} else {
			this.postFX.uniforms['time'].value = performance.now() * 0.001;
			this.composer.render();
		}

		// flush HUD (delegated to hudController)
		try { if (typeof this.flushHudIfDirty === 'function') this.flushHudIfDirty(); } catch (_) { }
	}

	setFps(fps) {
		if (!fps || fps <= 0) { this.targetFps = 0; this._minFrameTime = 0; return; }
		const clamped = Math.max(30, Math.min(240, fps));
		this.targetFps = clamped;
		this._minFrameTime = 1 / this.targetFps;
	}

	updatePlayer(dt) {
		const speed = (this.input.run ? this.player.speedRun : this.player.speedWalk);
		// powerup speed boost
		const speedBoost = (this.powerups.speed > 0) ? 1.3 : 1.0;
		const direction = new THREE.Vector3();
		direction.set(0, 0, 0);
		if (this.input.forward) direction.z += 1;
		if (this.input.backward) direction.z -= 1;
		if (this.input.left) direction.x -= 1;
		if (this.input.right) direction.x += 1;
		if (direction.lengthSq() > 0) direction.normalize();

		const camDir = new THREE.Vector3();
		this.camera.getWorldDirection(camDir);
		camDir.y = 0; camDir.normalize();
		const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
		const move = new THREE.Vector3();
		move.copy(camDir).multiplyScalar(direction.z).add(camRight.multiplyScalar(direction.x));
		if (move.lengthSq() > 0) move.normalize();

		const step = speed * speedBoost * dt;
		this.tryMove(move.multiplyScalar(step));
		// footstep SFX sederhana
		if ((this.input.forward || this.input.backward || this.input.left || this.input.right)) {
			this._footTimer = (this._footTimer || 0) - dt;
			if (this._footTimer <= 0) { this._footTimer = this.input.run ? 0.26 : 0.42; try { this.audio.footstep({ run: this.input.run }); } catch (_) { } }
		}

		// Jump & gravity
		const gravity = -20;
		if (this.input.jump && !this.player.jumping) {
			this.player.vy = 8.5;
			this.player.jumping = true;
		}
		this.player.vy += gravity * dt;
		this.player.y += this.player.vy * dt;
		if (this.player.y <= 1.6) { this.player.y = 1.6; this.player.vy = 0; this.player.jumping = false; }
		this.controls.getObject().position.y = this.player.y;

		// tembakan diproses terpusat di handleFireInputs()
	}

	tryMove(delta) {
		try { const impl = this.tryMove; const proto = Object.getPrototypeOf(this).tryMove; if (impl && impl !== proto) return impl.call(this, delta); } catch (_) { }
		// no-op fallback
	}

	findHitEnemy(obj) {
		let node = obj;
		while (node) {
			if (node.userData && node.userData.enemy) return node.userData.enemy;
			node = node.parent;
		}
		return null;
	}

	performSyncedShotRay() {
		this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

		// 1. Gather Valid Raycast Targets
		// Enemy meshes are real Object3Ds
		const enemyMeshes = (this._enemyMeshes && this._enemyMeshes.length > 0) ? this._enemyMeshes : this.world.enemies.map(e => e.mesh).filter(m => m && m.isObject3D);

		// Obstacles: Filter out virtual objects (like buildings defined only by position)
		// and include the actual InstancedMesh for buildings if it exists.
		let obs = this._obstacleMeshes;
		if (!obs) {
			obs = this.world.obstacles.map(o => o.mesh).filter(m => m && m.isObject3D);
			if (this._buildingInst) obs.push(this._buildingInst);
			this._obstacleMeshes = obs; // Cache it
		}

		const candidates = enemyMeshes.concat(obs);
		if (candidates.length === 0) {
			// fallback
			const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
			return { point: this.camera.position.clone().add(dir.multiplyScalar(100)), enemy: null };
		}

		const firstHits = this.raycaster.intersectObjects(candidates, true);
		let targetPoint = null;
		let targetEnemy = null;
		for (const hit of firstHits) {
			// Check if hit is enemy
			let e = this.findHitEnemy(hit.object);
			// Special case: Building InstancedMesh
			// If we hit a building, it's not an enemy, just a blocker.
			if (e) { targetPoint = hit.point.clone(); targetEnemy = e; break; }
			if (!targetPoint) targetPoint = hit.point.clone();
			// Since we want the FIRST hit, if it's not enemy, it's a blocker (wall/building), so stop.
			break;
		}
		// ... logic continues ...
		if (!targetPoint) {
			const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
			targetPoint = this.camera.position.clone().add(dir.multiplyScalar(100));
		}
		const muzzlePos = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
		const toTarget = targetPoint.clone().sub(muzzlePos);
		const dist = toTarget.length();
		toTarget.normalize();
		const maxValidate = 7;
		const secondRay = new THREE.Raycaster(muzzlePos, toTarget, 0, Math.min(dist, maxValidate));
		const blockers = this._obstacleMeshes || obs; // reuse cached meshes
		const blockHits = secondRay.intersectObjects(blockers, true);
		if (blockHits.length > 0) {
			return { point: blockHits[0].point.clone(), enemy: null };
		}
		return { point: targetPoint, enemy: targetEnemy };
	}

	tryShoot() {
		const now = performance.now() / 1000;
		const baseRate = (this.player.weapon === 'pistol' ? this.player.fireRate : 1.5);
		const effRate = baseRate * (this.perks?.fireRateMult || 1.0);
		const interval = 1 / effRate;
		if (now - this.player.lastShotTime < interval) return;
		if (this.player.reloading) return;
		if (this._switchAnim.active) return; // blokir tembak saat transisi
		if (this.player.weapon === 'pistol') {
			if (this.player.ammoInMag <= 0) { this.audio.click(); return; }
			this.player.lastShotTime = now;
			this.player.ammoInMag -= 1;
			try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
			this.audio.shoot();
			try { this.audio.duckBgm(0.45, 160); } catch (_) { }
			this.kickRecoil();
			this.playMuzzleFlash();
			this.spawnMuzzleLight();
			this.spawnMuzzleSmoke();
			this.ejectCasing();
			this.shake.amp = Math.min(1.2, this.shake.amp + 0.15);

			// arah tembak dengan aim assist cone (derajat)
			const coneDeg = this.config.aimAssistDeg || 0;
			const { point, enemy } = this.performSyncedShotRay();
			let shotPoint = point;
			if (point && coneDeg > 0) {
				const rad = (coneDeg * Math.PI) / 180;
				const offX = (Math.random() - 0.5) * rad;
				const offY = (Math.random() - 0.5) * rad;
				const camPos = this.camera.position.clone();
				const to = point.clone().sub(camPos).normalize();
				const up = new THREE.Vector3(0, 1, 0);
				const right = new THREE.Vector3().crossVectors(to, up).normalize();
				const trueUp = new THREE.Vector3().crossVectors(right, to).normalize();
				const dir = to.clone().add(right.multiplyScalar(offX)).add(trueUp.multiplyScalar(offY)).normalize();
				shotPoint = camPos.add(dir.multiplyScalar(100));
			}
			if (shotPoint) {
				const start = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
				this.spawnTracer(start, shotPoint);
				this.spawnBulletSparks(start, shotPoint);
				this.spawnImpactDecal(shotPoint);
				try { this.audio.playSample && this.audio.playSample('gunshot', { position: start, volume: 0.9 }); } catch (_) { }
			}
			if (enemy && point) {
				// headshot kasar: jika titik kena lebih tinggi dari pusat musuh
				const head = enemy.mesh.position.clone(); head.y += 1.5;
				const isHead = point.distanceTo(head) < 0.6;
				const dmgBase = this.damageByDifficulty(28, 12);
				const dmgMult = (this.powerups.damage > 0 ? 1.5 : 1.0) * (this.perks?.damageMult || 1.0) * (isHead ? 1.8 : 1.0);
				const dead = enemy.applyDamage(dmgBase * dmgMult);
				this.audio.hit();
				try { this.audio.playSample && this.audio.playSample('hit', { position: point, volume: 0.9 }); } catch (_) { }
				if (isHead) { try { this.audio.headshot(); } catch (_) { } this.spawnHitMarker(point); this.spawnHitSparks(point, 26, 0xffc07a); }
				else { this.spawnHitMarker(point); this.spawnHitSparks(point, 10, 0xfff1a8); }
				if (dead) {
					this.addScore(10 * (isHead ? 1.5 : 1.0));
					this.player.kills = (this.player.kills || 0) + 1;
					this.onEnemyKilled();
					// catat kematian wave sebelum menghapus enemy agar counter sinkron
					try { this.recordEnemyDeath(enemy); } catch (_) { }
					this.removeEnemy(enemy);
					try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
					// spawn pengganti hanya jika sistem wave sedang aktif
					try {
						if (this.waveState === 'idle') { this.spawnEnemy(); }
					} catch (_) { /* ignore fallback when spawn blocked */ }
				}
			}
		}
	}

	handleFireInputs() {
		if (this._switchAnim.active) return;
		// Pistol: tahan untuk auto-fire sesuai fireRate
		if (this.player.weapon === 'pistol') {
			if (this.input.shoot) this.tryShoot();
			return;
		}
		// Granat: tahan = mode aim, lepas = lempar
		if (this.player.weapon === 'grenade' && this.input.shootReleased) {
			if (this.player.grenades <= 0) { this.audio.click(); return; }
			const now = performance.now() / 1000;
			const interval = 1 / 1.5;
			if (now - this.player.lastShotTime < interval) return;
			this.player.lastShotTime = now;
			this.player.grenades -= 1;
			try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
			this.audio.shoot();
			this.throwGrenade();
			this.clearGrenadeTrajectory();
		}
	}

	throwGrenade() {
		const start = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
		const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
		// beri sedikit arc ke atas
		const initialSpeed = 16;
		const upBoost = 0.6; // komponen vertikal
		const vel = new THREE.Vector3(dir.x, Math.max(0.2, dir.y) + upBoost, dir.z).normalize().multiplyScalar(initialSpeed);
		// play throw sample
		try { this.audio.playSample && this.audio.playSample('hit', { position: start, volume: 0.6 }); } catch (_) { }
		const g = new Grenade(this.scene, start, vel, {
			obstacles: this.world.obstacles,
			bounds: this.world.bounds,
			fuse: 1.6,
			explodeOnImpact: true,
			onExplode: (center) => {
				// compute power based on player perks (consistent for damage and VFX)
				const perkMult = (this.perks && this.perks.grenadeDmg) ? this.perks.grenadeDmg : 1.0;
				const powerMultiplier = 1.5 * Math.max(1, perkMult);
				// visual + audio
				this.spawnExplosion(center, powerMultiplier);
				this.spawnHitSparks(center, 48 * Math.max(1, Math.round(powerMultiplier)), 0xffe08a);
				this.shake.amp = Math.min(6.0, this.shake.amp + 1.6 * powerMultiplier);
				try { this.audio.playSample && this.audio.playSample('explosion', { position: center, volume: 0.6 * powerMultiplier }); } catch (_) { }
				if (this.audio) try { this.audio.explosion({ volume: 1.0 * powerMultiplier }); } catch (_) { }
				// apply area damage scaled by powerMultiplier
				const radius = 12.0 * Math.max(1, powerMultiplier);
				for (const e of [...this.world.enemies]) {
					const d = e.mesh.position.distanceTo(center);
					if (d < radius) {
						const base = this.damageByDifficulty(Math.floor(110 * Math.max(1, powerMultiplier)), Math.floor(40 * Math.max(1, powerMultiplier)));
						const factor = Math.max(0, 1 - (d / radius));
						const dmg = base * (0.35 + 0.65 * factor);
						const dead = e.applyDamage(dmg);
						if (dead) {
							this.addScore(12);
							try { this.recordEnemyDeath(e); } catch (_) { }
							this.removeEnemy(e);
							try { if (this.waveState === 'idle') { this.spawnEnemy(); } } catch (_) { }
						}
					}
				}
				try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
			}
		});
		this.world.grenades.push(g);
	}

	spawnHitSparks(center, count = 8, color = 0xfff1a8) {
		if (!this._pointsPool) return;
		// NaN Guard: Prevent "Computed radius is NaN" errors
		if (!isValidVector3(center)) return;

		let entry = this._pointsPool.find(x => !x.busy);
		if (!entry) entry = this._pointsPool[0];
		const pts = entry.obj;
		const max = pts.userData._maxCount || 64;
		const arr = pts.geometry.attributes.position.array;
		let used = Math.min(count, max);
		for (let i = 0; i < used; i++) {
			const a = Math.random() * Math.PI * 2; const r = Math.random() * 0.6;
			arr[i * 3 + 0] = center.x + Math.cos(a) * r;
			arr[i * 3 + 1] = center.y + Math.random() * 0.6;
			arr[i * 3 + 2] = center.z + Math.sin(a) * r;
		}
		// fill rest with last value to avoid glitches
		for (let i = used; i < max; i++) { arr[i * 3 + 0] = arr[(used - 1) * 3 + 0]; arr[i * 3 + 1] = arr[(used - 1) * 3 + 1]; arr[i * 3 + 2] = arr[(used - 1) * 3 + 2]; }
		pts.geometry.attributes.position.needsUpdate = true;
		pts.material.color.setHex(color);
		pts.visible = true; entry.busy = true; entry.ttl = 0.25;
	}

	spawnBulletSparks(start, end) {
		if (!this._pointsPool) return;
		// NaN Guard: Prevent "Computed radius is NaN" errors
		if (!isValidVector3(start) || !isValidVector3(end)) return;

		let entry = this._pointsPool.find(x => !x.busy);
		if (!entry) entry = this._pointsPool[0];
		const pts = entry.obj;
		const max = pts.userData._maxCount || 64;
		const arr = pts.geometry.attributes.position.array;
		const count = Math.min(12, max);
		for (let i = 0; i < count; i++) {
			const t = i / (count - 1);
			arr[i * 3 + 0] = THREE.MathUtils.lerp(start.x, end.x, t) + (Math.random() - 0.5) * 0.02;
			arr[i * 3 + 1] = THREE.MathUtils.lerp(start.y, end.y, t) + (Math.random() - 0.5) * 0.02;
			arr[i * 3 + 2] = THREE.MathUtils.lerp(start.z, end.z, t) + (Math.random() - 0.5) * 0.02;
		}
		for (let i = count; i < max; i++) { arr[i * 3 + 0] = arr[(count - 1) * 3 + 0]; arr[i * 3 + 1] = arr[(count - 1) * 3 + 1]; arr[i * 3 + 2] = arr[(count - 1) * 3 + 2]; }
		pts.geometry.attributes.position.needsUpdate = true;
		pts.material.color.setHex(0xfff1a8);
		pts.visible = true; entry.busy = true; entry.ttl = 0.12;
	}

	spawnExplosion(center, powerMultiplier = 1.0) {
		// NaN Guard: Prevent errors from invalid position
		if (!isValidVector3(center)) return;

		const group = new THREE.Group();
		group.position.copy(center);

		const particleQualityScale = Math.max(1, Math.round((this.config && this.config.particles ? this.config.particles : 300) / 150));
		// Massive Shake
		this.shake.amp = Math.min(12.0, (this.shake.amp || 0) + 2.5 * Math.min(4, particleQualityScale) * Math.max(1, powerMultiplier)); // Stronger shake

		// 1. Core Glow (Intense)
		const glow = new THREE.Mesh(new THREE.SphereGeometry(0.4 * powerMultiplier, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));

		// 2. Shock Rings (Multiple)
		const ringGeo = new THREE.RingGeometry(0.2, 0.4, 32);
		const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
		const ring1 = new THREE.Mesh(ringGeo, ringMat.clone()); ring1.rotation.x = -Math.PI / 2;
		const ring2 = new THREE.Mesh(ringGeo, ringMat.clone()); ring2.rotation.x = -Math.PI / 2; ring2.material.color.setHex(0xffaa00);

		// 3. Smoke Column
		const smokeTex = this._getSmokeTexture();
		const smokeMat = new THREE.SpriteMaterial({ map: smokeTex, color: 0x222222, transparent: true, opacity: 0.8, depthWrite: false });
		const smoke = new THREE.Sprite(smokeMat); smoke.scale.set(8, 8, 1);

		// 4. Fireball Sprites
		const fireMat = new THREE.SpriteMaterial({ map: smokeTex, color: 0xff5500, transparent: true, opacity: 1.0, depthWrite: false, blending: THREE.AdditiveBlending });
		const fireball = new THREE.Sprite(fireMat); fireball.scale.set(5 * powerMultiplier, 5 * powerMultiplier, 1);

		group.add(glow, ring1, ring2, smoke, fireball);
		this.scene.add(group);

		// 5. Flash Light
		const flash = new THREE.PointLight(0xff5500, 8.0 * powerMultiplier, 40 * powerMultiplier);
		flash.position.copy(center);
		flash.position.y += 1.0;
		this.scene.add(flash);
		setTimeout(() => this.scene.remove(flash), 150);

		// 6. Debris & Sparks
		const debrisCount = Math.min(150, Math.floor(100 * particleQualityScale * powerMultiplier));
		const debris = this._spawnDebris(center, debrisCount);
		// Ember sparks
		try { this.spawnHitSparks(center.clone().add(new THREE.Vector3(0, 0.5, 0)), Math.floor(120 * powerMultiplier), 0xffaa00); } catch (_) { }

		// Screen Flash
		this._screenFlash(0.8, 150);

		// Animation Loop
		let t = 0;
		const tick = () => {
			if (t > 1.2) {
				// Cleanup
				this.scene.remove(group);
				glow.geometry.dispose(); glow.material.dispose();
				ring1.geometry.dispose(); ring1.material.dispose();
				ring2.geometry.dispose();
				smoke.material.dispose(); fireMat.dispose();
				return;
			}

			const easeOut = 1 - Math.pow(1 - t, 3);

			glow.scale.setScalar(0.1 + easeOut * 4.0);
			glow.material.opacity = 1 - t;

			ring1.scale.setScalar(1 + easeOut * 35.0); ring1.material.opacity = 0.8 * (1 - t);
			ring2.scale.setScalar(1 + easeOut * 25.0); ring2.material.opacity = 0.6 * (1 - t);

			fireball.scale.setScalar((5 * powerMultiplier) + t * 4); fireball.material.opacity = 1 - Math.pow(t, 0.5);
			smoke.scale.setScalar(8 + t * 15); smoke.material.opacity = 0.8 * (1 - t);
			smoke.position.y += 0.1;

			t += 0.04;
			requestAnimationFrame(tick);
		};
		tick();

		setTimeout(() => { try { this.scene.remove(debris.obj); debris.dispose(); } catch (_) { } }, 2000);
	}

	_getSmokeTexture() {
		if (this._smokeTex) return this._smokeTex;
		const size = 128; const data = new Uint8Array(size * size * 4);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const i = (y * size + x) * 4;
				const dx = x - size / 2; const dy = y - size / 2; const d = Math.sqrt(dx * dx + dy * dy) / (size / 2);
				const alpha = Math.max(0, 1 - Math.pow(d, 1.6));
				data[i] = 200; data[i + 1] = 200; data[i + 2] = 200; data[i + 3] = Math.floor(alpha * 255);
			}
		}
		this._smokeTex = new THREE.DataTexture(data, size, size); this._smokeTex.needsUpdate = true; this._smokeTex.minFilter = THREE.LinearFilter; this._smokeTex.magFilter = THREE.LinearFilter;
		return this._smokeTex;
	}

	_spawnDebris(center, count) {
		// NaN Guard: Prevent "Computed radius is NaN" errors
		if (!isValidVector3(center)) return { obj: null, dispose: () => { } };

		// jika ada pool, gunakan pool untuk menghindari alokasi
		if (this._debrisPool && this._debrisPool.length > 0) {
			let entry = this._debrisPool.find(x => !x.busy);
			if (!entry) entry = this._debrisPool[0];
			const pts = entry.obj;
			const max = pts.userData._maxCount || 64;
			const used = Math.min(count, max);
			const arr = pts.geometry.attributes.position.array;
			entry.count = used; entry.busy = true; entry.ttl = 0.6; entry.velocities = [];
			for (let i = 0; i < used; i++) {
				arr[i * 3 + 0] = center.x; arr[i * 3 + 1] = center.y; arr[i * 3 + 2] = center.z;
				const a = Math.random() * Math.PI * 2; const v = 6 + Math.random() * 10;
				entry.velocities[i] = { vx: Math.cos(a) * v, vy: 3 + Math.random() * 6, vz: Math.sin(a) * v };
			}
			for (let i = used; i < max; i++) { arr[i * 3 + 0] = arr[(used - 1) * 3 + 0]; arr[i * 3 + 1] = arr[(used - 1) * 3 + 1]; arr[i * 3 + 2] = arr[(used - 1) * 3 + 2]; }
			pts.geometry.attributes.position.needsUpdate = true; pts.visible = true;
			return { obj: pts, dispose: () => { try { pts.visible = false; } catch (_) { } } };
		}
		// fallback original alokasi jika pool tidak ada
		const geom = new THREE.BufferGeometry();
		const positions = new Float32Array(count * 3);
		const velocities = [];
		for (let i = 0; i < count; i++) {
			positions[i * 3 + 0] = center.x; positions[i * 3 + 1] = center.y; positions[i * 3 + 2] = center.z;
			const a = Math.random() * Math.PI * 2; const v = 8 + Math.random() * 10;
			velocities.push({ vx: Math.cos(a) * v, vy: 3 + Math.random() * 6, vz: Math.sin(a) * v });
		}
		geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const mat = new THREE.PointsMaterial({ color: 0xffae5a, size: 0.06, transparent: true, opacity: 0.95 });
		const pts = new THREE.Points(geom, mat);
		this.scene.add(pts);
		let t = 0; const tick = () => {
			if (t > 0.5) { return; }
			const pos = geom.attributes.position.array;
			for (let i = 0; i < count; i++) {
				velocities[i].vy += -12 * 0.016;
				pos[i * 3 + 0] += velocities[i].vx * 0.016;
				pos[i * 3 + 1] += velocities[i].vy * 0.016;
				pos[i * 3 + 2] += velocities[i].vz * 0.016;
			}
			geom.attributes.position.needsUpdate = true;
			t += 0.016; requestAnimationFrame(tick);
		}; tick();
		return { obj: pts, dispose: () => { try { geom.dispose(); mat.dispose(); } catch (_) { } } };
	}

	_screenFlash(intensity = 0.4, durationMs = 120) {
		const el = document.getElementById('transition'); if (!el) return;
		el.style.background = `rgba(255,241,168,${intensity})`;
		el.classList.remove('hidden'); el.classList.add('show');
		setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.classList.add('hidden'); el.style.background = '#000'; }, 200); }, durationMs);
	}

	damageByDifficulty(base, variance) {
		switch (this.config.difficulty) {
			case 'hard': return base + Math.random() * variance * 0.9;
			case 'insane': return base + Math.random() * variance * 0.8;
			default: return base + Math.random() * variance;
		}
	}

	reload() {
		if (this.player.weapon !== 'pistol') return;
		if (this.player.reloading) return;
		const need = this.player.magSize - this.player.ammoInMag;
		if (need <= 0 || this.player.ammoReserve <= 0) return;
		this.player.reloading = true;
		this.audio.reload();
		const fx = document.getElementById('reloadFX'); if (fx) { fx.classList.remove('hidden'); fx.classList.add('play'); setTimeout(() => { fx.classList.remove('play'); fx.classList.add('hidden'); }, 500); }
		// show reload cooldown in HUD
		let cd = 0.9; // seconds
		try { if (this.hud && typeof this.hud.setSkillCooldown === 'function') this.hud.setSkillCooldown(cd); } catch (_) { }
		const cdInterval = setInterval(() => {
			cd -= 0.1;
			try { if (this.hud && typeof this.hud.setSkillCooldown === 'function') this.hud.setSkillCooldown(Math.max(0, cd)); } catch (_) { }
			if (cd <= 0) { clearInterval(cdInterval); try { if (this.hud && typeof this.hud.setSkillCooldown === 'function') this.hud.setSkillCooldown(0); } catch (_) { } }
		}, 100);
		setTimeout(() => {
			const toLoad = Math.min(need, this.player.ammoReserve);
			this.player.ammoInMag += toLoad;
			this.player.ammoReserve -= toLoad;
			this.player.reloading = false;
			try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
			clearInterval(cdInterval);
			try { if (this.hud && typeof this.hud.setSkillCooldown === 'function') this.hud.setSkillCooldown(0); } catch (_) { }
		}, 900);
	}

	spawnHitMarker(point) {
		const g = new THREE.SphereGeometry(0.05, 8, 8);
		const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
		const s = new THREE.Mesh(g, m);
		s.position.copy(point);
		this.scene.add(s);
		setTimeout(() => this.scene.remove(s), 120);
	}

	spawnTracer(start, end, color = 0xfff1a8) {
		// try reuse tracer from pool
		if (!this._tracerPool) return;
		// NaN Guard: Prevent "Computed radius is NaN" errors
		if (!isValidVector3(start)) return;
		if (end && !isValidVector3(end)) return;

		let entry = this._tracerPool.find(x => !x.busy);
		if (!entry) entry = this._tracerPool[0];
		const line = entry.obj;
		const posAttr = line.geometry.attributes.position.array;
		// jika origin sangat rendah (mis. proxy mesh di ground), angkat agar terlihat dari badan
		const s = start.clone(); if (!s.y || s.y < 0.6) s.y = 1.6;
		posAttr[0] = s.x; posAttr[1] = s.y; posAttr[2] = s.z;
		const toVec = end ? end : (() => { const d = new THREE.Vector3(); this.camera.getWorldDirection(d); return start.clone().add(d.multiplyScalar(30)); })();
		// add small controlled jitter to simulate minor misses (keeps visual variety)
		try {
			const dirVec = toVec.clone().sub(s).normalize();
			const right = new THREE.Vector3().crossVectors(dirVec, new THREE.Vector3(0, 1, 0)).normalize();
			const up = new THREE.Vector3().crossVectors(right, dirVec).normalize();
			const jitterScale = 0.02; // controlled amount
			const jitter = right.multiplyScalar((Math.random() - 0.5) * jitterScale).add(up.multiplyScalar((Math.random() - 0.5) * jitterScale * 0.6));
			toVec.add(jitter);
		} catch (_) { }
		// jika target rendah, set y ke sama dengan origin agar tracer lurus
		const t = toVec.clone(); if (!t.y || t.y < 0.6) t.y = s.y;
		posAttr[3] = t.x; posAttr[4] = t.y; posAttr[5] = t.z;
		line.geometry.attributes.position.needsUpdate = true;
		line.material.color.setHex(color);
		line.visible = true; entry.busy = true; entry.ttl = 0.12; // seconds (diperpanjang sedikit agar lintasan lebih jelas)
		// jika device quality tinggi, biarkan tracer sedikit lebih lama
		try { if ((this.config && this.config.particles) && this.config.particles > 300) entry.ttl = 0.24; else entry.ttl = 0.16; } catch (_) { }
		// whizz SFX if near camera
		try { const cam = this.camera.position; const seg = new THREE.Vector3().subVectors(toVec, start); const toCam = new THREE.Vector3().subVectors(cam, start); const t = Math.max(0, Math.min(1, toCam.dot(seg.clone().normalize()) / seg.length())); const closest = start.clone().add(seg.multiplyScalar(t)); if (closest.distanceTo(cam) < 2.2) { try { this.audio.whizz(); } catch (_) { } } } catch (_) { }
		// add short-lived tracer glow points along beam
		try { this.spawnTracerGlow(start, end, color, 12); } catch (_) { } // lebih banyak glow
	}

	// short burst of glow points along tracer to create trail bloom
	spawnTracerGlow(start, end, color = 0xfff1a8, count = 6) {
		if (!this._pointsPool) return;
		// NaN Guard: Prevent "Computed radius is NaN" errors
		if (!isValidVector3(start) || !isValidVector3(end)) return;

		let entry = this._pointsPool.find(x => !x.busy);
		if (!entry) entry = this._pointsPool[0];
		const pts = entry.obj;
		const max = pts.userData._maxCount || 64;
		const arr = pts.geometry.attributes.position.array;
		const used = Math.min(count, max);
		for (let i = 0; i < used; i++) {
			const t = i / (used - 1);
			const x = THREE.MathUtils.lerp(start.x, end.x, t) + (Math.random() - 0.5) * 0.02;
			const y = THREE.MathUtils.lerp(start.y, end.y, t) + (Math.random() - 0.5) * 0.02;
			const z = THREE.MathUtils.lerp(start.z, end.z, t) + (Math.random() - 0.5) * 0.02;
			arr[i * 3 + 0] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
		}
		for (let i = used; i < max; i++) { arr[i * 3 + 0] = arr[(used - 1) * 3 + 0]; arr[i * 3 + 1] = arr[(used - 1) * 3 + 1]; arr[i * 3 + 2] = arr[(used - 1) * 3 + 2]; }
		pts.geometry.attributes.position.needsUpdate = true;
		pts.material.color.setHex(color);
		pts.visible = true; entry.busy = true; entry.ttl = 0.12;
	}

	playMuzzleFlash() {
		if (!this.weapon) return;
		this.weapon.flash.visible = true;
		try { this.flashBloom(0.9, 0.12); } catch (_) { }
		// small spark burst at muzzle
		try {
			const pos = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
			this.spawnHitSparks(pos, 8, 0xfff1a8);
		} catch (_) { }
		setTimeout(() => { if (this.weapon) this.weapon.flash.visible = false; }, 40);
	}

	kickRecoil() {
		if (!this.weapon) return;
		this.weapon.recoilX += 0.08;
		this.weapon.recoilY += (Math.random() - 0.5) * 0.02;
		this.weapon.recoilZ += 0.02;
	}

	updateWeaponSwitch(dt) {
		if (this._switchAnim && this._switchAnim.active) {
			// Animate
			this._switchAnim.t += dt * 4.0;
			if (this._switchAnim.t >= 1) {
				this._switchAnim.active = false;
				this.weapon.group.position.y = this.weapon.basePos.y;
				// Finish switch
				this.player.weapon = this._switchAnim.next;
				// Update HUD Weapon Name/Icon
				try {
					if (this.hud && typeof this.hud.setWeapon === 'function') {
						const n = this.player.weapon === 'pistol' ? 'PISTOL' : (this.player.weapon === 'rocket' ? 'ROCKET LAUNCHER' : (this.player.weapon === 'shotgun' ? 'SHOTGUN' : 'ASSAULT RIFLE'));
						this.hud.setWeapon(n, '');
					}
					// Update Ammo Display for new weapon
					this.markHudDirty();
				} catch (_) { }
			} else {
				// Dip down effect
				const t = this._switchAnim.t;
				const yOff = Math.sin(t * Math.PI) * -0.4;
				this.weapon.group.position.y = this.weapon.basePos.y + yOff;
			}
			return;
		}

		// Input Check
		let next = null;
		if (this.input.keys && this.input.keys['1']) next = 'pistol';
		else if (this.input.keys && this.input.keys['2']) next = 'assault';
		else if (this.input.keys && this.input.keys['3']) next = 'shotgun';
		else if (this.input.keys && this.input.keys['4']) next = 'rocket';

		if (next && next !== this.player.weapon) {
			// Start Switch
			this._switchAnim = { active: true, t: 0, next: next };
			try { this.audio.click(); } catch (_) { } // Switch sound
		}
	}

	updateWeapon(dt) {
		if (!this.weapon || !this.player || !this.weapon.group) return;
		this.weapon.recoilX = THREE.MathUtils.damp(this.weapon.recoilX, 0, 10, dt);
		this.weapon.recoilY = THREE.MathUtils.damp(this.weapon.recoilY, 0, 10, dt);
		this.weapon.recoilZ = THREE.MathUtils.damp(this.weapon.recoilZ, 0, 14, dt);

		const basePos = new THREE.Vector3(0.38, -0.26, -0.6);
		const baseRot = new THREE.Euler(-0.03, 0.08, 0);

		const speedFactor = (this.input.forward || this.input.backward || this.input.left || this.input.right) ? (this.input.run ? 1.6 : 1.0) : 0.0;
		const t = performance.now() * 0.008 * (1 + speedFactor);
		const bobX = Math.sin(t) * 0.005 * speedFactor;
		const bobY = Math.abs(Math.cos(t)) * 0.006 * speedFactor;

		this.weapon.group.position.set(
			basePos.x + bobX,
			basePos.y + bobY - this.weapon.recoilZ,
			basePos.z
		);
		this.weapon.group.rotation.set(
			baseRot.x - this.weapon.recoilX,
			baseRot.y + this.weapon.recoilY,
			baseRot.z
		);
	}

	spawnEnemy() {
		try {
			const impl = this.spawnEnemy; const proto = Object.getPrototypeOf(this).spawnEnemy;
			if (impl && impl !== proto) return impl.call(this);
		} catch (_) { }
	}

	removeEnemy(enemy) {
		try { enemy.dispose(this.scene); } catch (e) { console.warn('[RemoveEnemy] dispose failed', e); }
		this.world.enemies = this.world.enemies.filter(e => e !== enemy);
		this._enemyMeshes = this.world.enemies.map(e => e.mesh);
		console.debug('[RemoveEnemy] removed', { remaining: this.world.enemies.length });
		// jadwalkan refresh HUD (throttled)
		try { this.markHudDirty(); } catch (_) { }
	}

	spawnInitialAllies() {
		// Spawn Allies (Same Team as Player)
		const p = this.controls.getObject().position;
		const count = 5;
		for (let i = 0; i < count; i++) {
			const pos = this.spawnPositionPoissonAround(p, 6 + i * 0.5, 12 + i * 2, 4.0, 300);
			const ally = new Ally(this.scene, pos);
			ally.team = this.player.team; // Assign Team
			this.world.allies.push(ally);
			if (!this.scene.userData) this.scene.userData = {};
			if (!this.scene.userData._alliesList) this.scene.userData._alliesList = [];
			this.scene.userData._alliesList.push(ally);
		}
		try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
	}

	spawnAlly() {
		const p = this.controls.getObject().position;
		const pos = this.spawnPositionPoissonAround(p, 3.0, 8.0, 3.0, 200);
		const ally = new Ally(this.scene, pos);
		ally.team = this.player.team; // Assign Team
		this.world.allies.push(ally);
		if (!this.scene.userData) this.scene.userData = {};
		if (!this.scene.userData._alliesList) this.scene.userData._alliesList = [];
		this.scene.userData._alliesList.push(ally);
		try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
	}

	removeAlly(ally) {
		ally.dispose(this.scene);
		this.world.allies = this.world.allies.filter(a => a !== ally);
		// juga hapus dari cache scene
		try { if (this.scene.userData && this.scene.userData._alliesList) this.scene.userData._alliesList = this.scene.userData._alliesList.filter(a => a !== ally); } catch (_) { }
		try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
		setTimeout(() => this.spawnAllyWithEmerge(), 1600);
	}

	spawnAllyWithEmerge() {
		// pilih posisi sekitar player namun tidak terlalu dekat
		const p = this.controls.getObject().position;
		let pos = null;
		for (let attempt = 0; attempt < 14; attempt++) {
			const cand = new THREE.Vector3(p.x + (Math.random() - 0.5) * 12, 0, p.z + (Math.random() - 0.5) * 12);
			let tooClose = false;
			for (const a of this.world.allies) { if (a.mesh && a.mesh.position.distanceTo(cand) < 3.5) { tooClose = true; break; } }
			if (!tooClose) { pos = cand; break; }
		}
		if (!pos) pos = new THREE.Vector3(p.x + (Math.random() - 0.5) * 10, 0, p.z + (Math.random() - 0.5) * 10);
		// VFX: portal ring kecil dan partikel debu dari tanah
		const ringGeo = new THREE.RingGeometry(0.2, 0.25, 32);
		const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
		const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, 0.02, pos.z);
		this.scene.add(ring);
		const dust = this._spawnDebris(new THREE.Vector3(pos.x, 0.05, pos.z), 30);
		try { this.audio.summon(); } catch (_) { }
		// Beacon cahaya
		const beacon = new THREE.SpotLight(0x38bdf8, 2.0, 20, Math.PI / 5, 0.5, 1.2);
		beacon.position.set(pos.x, 4, pos.z);
		beacon.target.position.set(pos.x, 0, pos.z);
		this.scene.add(beacon); this.scene.add(beacon.target);
		let t = 0; const tick = () => {
			if (t > 1) { this.scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); return; }
			ring.scale.setScalar(THREE.MathUtils.lerp(1, 6, t)); ring.material.opacity = 0.9 * (1 - t);
			beacon.intensity = 2.0 * (1 - t);
			t += 0.06; requestAnimationFrame(tick);
		}; tick();
		setTimeout(() => { this.scene.remove(dust.obj); dust.dispose(); }, 500);
		// munculnya ally dari tanah: lerp Y dari -0.5 ke 1 (tinggi badan 1)
		setTimeout(() => {
			const ally = new Ally(this.scene, pos);
			ally.team = this.player.team; // Assign Team
			this.world.allies.push(ally);
			// juga tambah ke cache scene
			if (!this.scene.userData) this.scene.userData = {};
			if (!this.scene.userData._alliesList) this.scene.userData._alliesList = [];
			this.scene.userData._alliesList.push(ally);
			if (ally.mesh) { ally.mesh.position.y = -0.5; let k = 0; const rise = () => { if (k >= 1) return; k += 0.06; ally.mesh.position.y = THREE.MathUtils.lerp(-0.5, 1, k); requestAnimationFrame(rise); }; rise(); }
			try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
			setTimeout(() => { this.scene.remove(beacon); this.scene.remove(beacon.target); }, 600);
		}, 180);
	}

	updateAllies(dt) {
		const playerPos = this.controls.getObject().position;
		const difficultyMultiplier = (this.config.difficulty === 'hard') ? 1.25 : (this.config.difficulty === 'insane' ? 1.6 : 1.0);
		const worldCenter = new THREE.Vector3(0, 1, 0);
		const context = { playerPos, enemies: this.world.enemies, obstacles: this.world.obstacles, pickups: this.world.pickups, difficultyMultiplier, worldCenter };
		// Thinning: on low-end, only update a subset of allies each frame (round-robin)
		const allySkip = this._lowEnd ? 2 : 1;
		this._allyPhase = (this._allyPhase || 0) % allySkip;
		for (let ai = 0; ai < this.world.allies.length; ai++) {
			if (this._lowEnd && (ai % allySkip) !== this._allyPhase) continue;
			const ally = this.world.allies[ai];
			const action = ally.update(dt, context);
			if (action.shoot && action.target) {
				const start = ally.mesh.position.clone();
				const end = action.target.mesh.position.clone();
				this.spawnTracer(start, end, 0x38bdf8);
				const baseDmg = this.damageByDifficulty(14, 8);
				const dmg = baseDmg * (ally.damageMult || 1.0);
				const shotDist = start.distanceTo(end);
				const distFactor = THREE.MathUtils.clamp(1 - (shotDist / 60), 0.45, 1.0);
				const hitProb = Math.max(0.08, Math.min(0.98, (ally.accuracy || 0.7) * distFactor));
				if (Math.random() < hitProb) {
					const dead = action.target.applyDamage(dmg);
					if (dead) {
						this.addScore(6);
						ally.kills = (ally.kills || 0) + 1;
						// catat kill untuk killstreak & wave accounting
						try { this.onEnemyKilled(); } catch (_) { }
						try { this.recordEnemyDeath(action.target); } catch (_) { }
						this.removeEnemy(action.target);
						try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
						try { if (this.waveState === 'idle') { this.spawnEnemy(); } } catch (_) { /* ignore fallback when spawn blocked */ }
					}
				} else {
					const missAng = (Math.random() - 0.5) * 0.35; const rot = new THREE.Matrix4().makeRotationY(missAng);
					const dir = end.clone().sub(start).setY(0).normalize().applyMatrix4(rot);
					const missPoint = start.clone().add(dir.multiplyScalar(shotDist));
					this.spawnTracer(start, missPoint, 0x38bdf8);
				}
			}
		}
		if (this._lowEnd) this._allyPhase = (this._allyPhase + 1) % allySkip;
	}

	updateEnemies(dt) {
		const playerPos = this.controls.getObject().position;
		const playerMoving = (this.input.forward || this.input.backward || this.input.left || this.input.right);
		// atur skill musuh ringan berdasarkan skor agar dinamis
		const dynamicSkill = Math.min(1.8, 1.0 + this.world.score / 200);
		const difficultyMultiplier = (this.config.difficulty === 'hard') ? 1.25 : (this.config.difficulty === 'insane' ? 1.6 : 1.0);
		// Thinning: on low-end, skip some enemies each frame (round-robin phase)
		const enemySkip = this._lowEnd ? 2 : 1;
		this._enemyPhase = (this._enemyPhase || 0) % enemySkip;
		for (let ei = 0; ei < this.world.enemies.length; ei++) {
			if (this._lowEnd && (ei % enemySkip) !== this._enemyPhase) continue;
			const enemy = this.world.enemies[ei];
			const act = enemy.update(dt, playerPos, this.world.obstacles, this._obstacleMeshes, { grenades: this.world.grenades, skill: dynamicSkill, playerMoving, difficultyMultiplier });

			// Update logic usually handles target selection, but let's ensure 'enemy' knows its team
			enemy.team = (this.player.team === 'RED' ? 'BLUE' : 'RED');

			if (act.contact) {
				this.takePlayerDamage(this.damageByDifficulty(10, 5) * dt, enemy.mesh.position.clone(), enemy.team);
			}
			if (act.shoot) {
				let target = { pos: playerPos, isPlayer: true };
				let nd = enemy.mesh.position.distanceTo(playerPos);
				for (const ally of this.world.allies) {
					const d = enemy.mesh.position.distanceTo(ally.mesh.position);
					if (d < nd) { nd = d; target = { pos: ally.mesh.position, isPlayer: false, ally }; }
				}
				const nowMs = performance.now();
				if (nowMs - this._lastEnemyTracerMs > 50) {
					const origin = enemy.mesh.position.clone();
					if (!origin.y || origin.y < 0.6) origin.y = 1.6;
					const dir = target.pos.clone().sub(origin).setY(0).normalize();
					const spread = (1 - (act.acc ?? 0.6)) * 0.15;
					const ang = (Math.random() - 0.5) * spread;
					const rot = new THREE.Matrix4().makeRotationY(ang);
					const d3 = dir.clone().applyMatrix4(rot);
					const end = origin.clone().add(d3.multiplyScalar(nd));
					this.spawnTracer(origin, end, 0xff6b6b);
					try { this.spawnHitSparks(new THREE.Vector3(origin.x, origin.y + 0.05, origin.z), 4, 0xff6b6b); } catch (_) { }
					this.showShotIndicator(enemy.mesh.position.clone());
					this.playEnemyShotAudio(enemy.mesh.position.clone());
					this.spawnEnemyMuzzleFlash(enemy.mesh.position.clone());
					this._lastEnemyTracerMs = nowMs;
				}
				if (target.isPlayer) {
					const hitProb = Math.max(0.1, Math.min(0.9, (act.acc ?? 0.6)));
					if (Math.random() < hitProb) {
						this.takePlayerDamage(this.damageByDifficulty(8, 6), enemy.mesh.position.clone(), enemy.team);
						try { this.audio.ricochet(); } catch (_) { }
						if (this.player.health <= 0) { this.gameOver(); return; }
						try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
					}
				} else if (target.ally) {
					const hitProbA = Math.max(0.1, Math.min(0.9, (act.acc ?? 0.6)) * 0.95);
					if (Math.random() < hitProbA) {
						target.ally.health -= this.damageByDifficulty(10, 6);
						if (target.ally.health <= 0) this.removeAlly(target.ally);
					}
				}
			}
		}
		if (this._lowEnd) this._enemyPhase = (this._enemyPhase + 1) % enemySkip;
	}

	updateGrenades(dt) {
		for (const g of [...this.world.grenades]) {
			if (!g.alive) { this.world.grenades = this.world.grenades.filter(x => x !== g); continue; }
			g.update(dt);
			if (!g.alive) { this.world.grenades = this.world.grenades.filter(x => x !== g); }
		}
	}

	// ====== Grenade trajectory prediction ======
	initGrenadeTrajectory() {
		if (this.weapon.trajLine) return;
		const segments = 30;
		this.weapon.trajPositions = new Float32Array((segments + 1) * 3);
		const geom = new THREE.BufferGeometry();
		geom.setAttribute('position', new THREE.BufferAttribute(this.weapon.trajPositions, 3));
		const mat = new THREE.LineBasicMaterial({ color: 0x9ae66e, transparent: true, opacity: 0.85 });
		this.weapon.trajLine = new THREE.Line(geom, mat);
		this.scene.add(this.weapon.trajLine);
		// marker impact
		if (!this.weapon.trajImpact) {
			const rim = new THREE.RingGeometry(0.18, 0.22, 32);
			const rimMat = new THREE.MeshBasicMaterial({ color: 0x9ae66e, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
			const ring = new THREE.Mesh(rim, rimMat); ring.rotation.x = -Math.PI / 2; ring.visible = false;
			this.weapon.trajImpact = ring; this.scene.add(ring);
		}
	}

	clearGrenadeTrajectory() {
		// Fix (Guard Clause): Check if grenade system/weapon exists
		if (!this.weapon || !this.weapon.trajLine) return;

		this.scene.remove(this.weapon.trajLine);
		this.weapon.trajLine.geometry.dispose();
		this.weapon.trajLine.material.dispose();
		this.weapon.trajLine = null;
		this.weapon.trajPositions = null;
		if (this.weapon.trajImpact) this.weapon.trajImpact.visible = false;
	}

	updateGrenadeAim(dt) {
		// Fix (Guard Clause): Safety check before accessing player/weapon properties
		if (!this.player || !this.weapon) return;

		// tampilkan hanya saat senjata granat aktif dan tombol mouse kiri ditekan (menahan untuk aim)
		if (this.player.weapon !== 'grenade') { this.clearGrenadeTrajectory(); return; }
		if (!this.input.shoot) { this.clearGrenadeTrajectory(); return; }
		this.initGrenadeTrajectory();
		if (!this.weapon.trajLine) return;
		const positions = this.weapon.trajLine.geometry.attributes.position.array;
		const segments = positions.length / 3 - 1;
		// ambil start & velocity sama seperti saat lempar
		const start = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
		const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
		const initialSpeed = 16; const upBoost = 0.6;
		const vel = new THREE.Vector3(dir.x, Math.max(0.2, dir.y) + upBoost, dir.z).normalize().multiplyScalar(initialSpeed);
		const g = -9.8;
		let p = start.clone(); let v = vel.clone();
		const step = 0.05;
		let impact = null;
		for (let i = 0; i <= segments; i++) {
			positions[i * 3 + 0] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
			// integrasi euler kecil untuk preview
			v.y += g * step;
			const next = p.clone().addScaledVector(v, step);
			// cek tabrakan tanah/obstacle sederhana untuk menghentikan garis
			let hit = false;
			if (next.y <= 0.12) {
				// Interpolasi titik tepat saat menyentuh tanah (y=0.12)
				const denom = Math.max(1e-6, (next.y - p.y));
				const t = (0.12 - p.y) / denom;
				const exact = new THREE.Vector3(
					THREE.MathUtils.lerp(p.x, next.x, t),
					0.12,
					THREE.MathUtils.lerp(p.z, next.z, t)
				);
				impact = exact.clone();
				hit = true; p.copy(exact);
			}
			else {
				for (const o of this.world.obstacles) {
					const bp = o.mesh.position; const half = o.half;
					const insideX = Math.abs(next.x - bp.x) <= (half.x + 0.12);
					const insideZ = Math.abs(next.z - bp.z) <= (half.z + 0.12);
					const insideY = Math.abs(next.y - bp.y) <= (half.y + 0.12);
					if (insideX && insideZ && insideY) { hit = true; break; }
				}
			}
			if (!hit) p.copy(next);
			if (hit) {
				if (!impact) impact = p.clone();
				// isi sisa titik dengan posisi impact
				for (let j = i + 1; j <= segments; j++) { positions[j * 3 + 0] = p.x; positions[j * 3 + 1] = p.y; positions[j * 3 + 2] = p.z; }
				break;
			}
		}
		this.weapon.trajLine.geometry.attributes.position.needsUpdate = true;
		if (this.weapon.trajImpact && impact) { this.weapon.trajImpact.visible = true; this.weapon.trajImpact.position.set(impact.x, impact.y + 0.01, impact.z); }
	}

	showShotIndicator(fromPos) {
		const now = performance.now();
		if (now - this._lastIndicatorMs < 60) return; // sedikit lebih sering
		this._lastIndicatorMs = now;
		const indicator = document.getElementById('shotIndicator');
		if (!indicator) return;
		// arah dari player ke penembak
		const playerPos = this.controls.getObject().position.clone();
		const dir = new THREE.Vector3().subVectors(fromPos, playerPos); dir.y = 0; dir.normalize();
		// ambil arah kamera (forward XZ)
		const camF = new THREE.Vector3(); this.camera.getWorldDirection(camF); camF.y = 0; camF.normalize();
		const angle = Math.atan2(dir.x, dir.z) - Math.atan2(camF.x, camF.z);
		indicator.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
		indicator.classList.add('visible');
		clearTimeout(this._shotIndicatorTimer);
		this._shotIndicatorTimer = setTimeout(() => indicator.classList.remove('visible'), 280);
	}

	playEnemyShotAudio(fromPos) {
		const now = performance.now();
		if (now - this._lastEnemyShotSfxMs < 70) return; // throttle suara musuh
		this._lastEnemyShotSfxMs = now;
		try {
			this.audio.ensureCtx();
			const ctx = this.audio.ctx;
			const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
			const gain = ctx.createGain(); gain.gain.value = 0.12; // reduced
			const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 260;
			if (panner) {
				// pan berdasarkan posisi relatif X
				const relX = fromPos.x - this.controls.getObject().position.x;
				const pan = Math.max(-1, Math.min(1, relX / 20));
				panner.pan.value = pan;
				osc.connect(gain).connect(panner).connect(this.audio.sfxGain);
			} else {
				osc.connect(gain).connect(this.audio.sfxGain);
			}
			osc.start();
			setTimeout(() => { try { osc.stop(); gain.disconnect(); if (panner) panner.disconnect(); } catch (e) { } }, 120);
		} catch (_) { }
	}

	updatePickups(dt) {
		try { const impl = this.updatePickups; const proto = Object.getPrototypeOf(this).updatePickups; if (impl && impl !== proto) return impl.call(this, dt); } catch (_) { }
		// fallback: no-op
	}

	createAmbientParticles() {
		const count = this.config.particles;
		const geo = new THREE.BufferGeometry();
		const positions = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			positions[i * 3 + 0] = (Math.random() - 0.5) * this.world.bounds * 2;
			positions[i * 3 + 1] = Math.random() * 6 + 1;
			positions[i * 3 + 2] = (Math.random() - 0.5) * this.world.bounds * 2;
		}
		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const mat = new THREE.PointsMaterial({ color: 0x8fb3ff, size: 0.05, transparent: true, opacity: 0.5 });
		this.particles = new THREE.Points(geo, mat);
		// allow frustum culling so particles stop rendering when offscreen
		try { this.particles.frustumCulled = true; } catch (_) { }
		this.scene.add(this.particles);
	}

	updateParticles(dt) {
		if (!this.particles) return;
		this._particleTick = (this._particleTick || 0) + 1;
		// on low-end devices or when particle count large, skip frames to reduce CPU/GPU
		const skip = (this._lowEnd || (this.config.particles > 400)) ? 3 : 1;
		if ((this._particleTick % skip) !== 0) return;
		this.particles.rotation.y += dt * 0.02;
	}

	gameOver() {
		this.player.health = 0;
		try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
		this.startDeathAnim();
	}

	startDeathAnim() {
		if (this._deathAnim.active) return;
		this._deathAnim = { active: true, t: 0 };
		try { this.audio.duckBgm(0.2, 800); this.audio.playerHurt(); } catch (_) { }
	}

	updateDeathAnim(dt) {
		if (!this._deathAnim.active) return;
		const d = this._deathAnim; d.t += dt;
		// kamera jatuh ke samping + turun
		const k = Math.min(1, d.t / 1.0);
		const fall = THREE.MathUtils.smoothstep(k, 0, 1);
		const camObj = this.controls.getObject();
		camObj.position.y = THREE.MathUtils.lerp(this.player.y, Math.max(0.4, this.player.y - 1.0), fall);
		this.camera.rotation.z = THREE.MathUtils.lerp(0, 0.9, fall);
		// layar fade gelap via transition overlay
		if (k > 0.2) {
			const el = document.getElementById('transition');
			if (el) { el.classList.remove('hidden'); el.style.transition = 'opacity 0.8s ease'; el.style.background = '#000'; el.style.opacity = Math.min(1, (k - 0.2) / 0.6); }
		}
		if (k >= 1.0) {
			this._deathAnim.active = false;
			this.animating = false;
			this.controls.unlock();
			window.dispatchEvent(new CustomEvent('game:gameOver', { detail: { score: this.world.score } }));
		}
	}

	// NOTE: setupEvents() is defined earlier in this class (around line 976)
	// It handles: resize, canvas click for pointer lock, controls lock/unlock events,
	// window blur, and visibility change. Pause menu buttons are handled in pages/game.js.

	updateHUD() {
		try { const impl = this.updateHUD; const proto = Object.getPrototypeOf(this).updateHUD; if (impl && impl !== proto) return impl.call(this); } catch (_) { }
	}

	pulseHitVignette(fromPos) {
		const el = document.getElementById('hitVignette'); if (!el) return;
		el.classList.remove('hidden'); el.classList.add('show');
		clearTimeout(this._hitVigTimer);
		this._hitVigTimer = setTimeout(() => { el.classList.remove('show'); el.classList.add('hidden'); }, 180);
	}

	spawnEnemyMuzzleFlash(pos) {
		const flash = new THREE.PointLight(0xff6b6b, 2.0, 6);
		flash.position.copy(new THREE.Vector3(pos.x, 1.6, pos.z));
		this.scene.add(flash);
		try { this.flashBloom(0.6, 0.08); } catch (_) { }
		try { this.spawnHitSparks(new THREE.Vector3(pos.x, 1.6, pos.z), 6, 0xff6b6b); } catch (_) { }
		setTimeout(() => this.scene.remove(flash), 60);
	}

	spawnMuzzleLight() {
		try { if (this._activeMuzzleLight) { this.scene.remove(this._activeMuzzleLight); this._activeMuzzleLight = null; } } catch (_) { }
		const light = new THREE.PointLight(0xfff1a8, 1.2, 4); // reduced intensity and range
		light.position.copy(this.weapon.muzzle.getWorldPosition(new THREE.Vector3()));
		this.scene.add(light); this._activeMuzzleLight = light;
		// small sprite glow at muzzle
		try {
			const tex = this._getSmokeTexture();
			const mat = new THREE.SpriteMaterial({ map: tex, color: 0xfff1a8, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false });
			const spr = new THREE.Sprite(mat);
			spr.scale.set(0.16, 0.16, 1); // smaller flash sprite
			spr.position.copy(light.position);
			this.scene.add(spr);
			setTimeout(() => { try { this.scene.remove(spr); mat.dispose(); } catch (_) { } }, 60); // shorter lifetime
		} catch (_) { }
		setTimeout(() => { try { this.scene.remove(light); if (this._activeMuzzleLight === light) this._activeMuzzleLight = null; } catch (_) { } }, 40); // shorter
	}

	spawnMuzzleSmoke() {
		const tex = this._getSmokeTexture();
		const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }); // slightly dimmer
		const spr = new THREE.Sprite(mat);
		spr.scale.set(0.36, 0.36, 1); // smaller smoke
		spr.position.copy(this.weapon.muzzle.getWorldPosition(new THREE.Vector3()));
		this.scene.add(spr);
		let t = 0; const tick = () => {
			if (t > 1) { this.scene.remove(spr); mat.dispose(); return; }
			spr.material.opacity = 0.45 * (1 - t);
			spr.scale.setScalar(THREE.MathUtils.lerp(0.36, 1.4, t));
			spr.position.y += 0.002;
			t += 0.09; requestAnimationFrame(tick);
		}; tick();
	}

	ejectCasing() {
		if (!this._casingPool) return;
		let entry = this._casingPool.find(x => !x.busy);
		if (!entry) entry = this._casingPool[0];
		const mesh = entry.obj;
		const origin = this.weapon.group.localToWorld(new THREE.Vector3(-0.06, -0.02, -0.1));
		mesh.position.copy(origin); mesh.visible = true;
		entry.busy = true; entry.ttl = 0.6;
		entry.vel.set(-0.5 + Math.random() * -0.6, 0.8 + Math.random() * 0.5, -0.2 + Math.random() * 0.4);
		entry.rotSpeed.set(0.2 + Math.random() * 0.3, 0.2 + Math.random() * 0.4, 0.1 + Math.random() * 0.3);
	}

	spawnImpactDecal(point) {
		if (!point) return;
		if (!this._decalPool) return;
		let entry = this._decalPool.find(x => !x.busy);
		if (!entry) entry = this._decalPool[0];
		const mesh = entry.obj;
		mesh.position.set(point.x, point.y + 0.01, point.z);
		mesh.visible = true; entry.busy = true; entry.ttl = 0.4;
	}

	updateCameraShake(dt) {
		// decay amplitude
		this.shake.amp = Math.max(0, this.shake.amp - this.shake.decay * dt);
		this._shakeTime += dt * 60;
		const a = this.shake.amp;
		if (a > 0.0001) {
			const n1 = Math.sin(this._shakeTime * 0.13);
			const n2 = Math.sin(this._shakeTime * 0.29 + 1.7);
			const n3 = Math.sin(this._shakeTime * 0.47 + 0.6);
			const offX = (n1 * 0.4 + n2 * 0.6) * 0.004 * a;
			const offY = (n2 * 0.5 + n3 * 0.5) * 0.003 * a;
			const offZ = (n1 * 0.3 + n3 * 0.7) * 0.002 * a;
			this._shakeOffset.set(offX, offY, offZ);
			this.camera.position.add(this._shakeOffset);
			// FOV punch ringan
			this.camera.fov = THREE.MathUtils.lerp(this._fovBase, this._fovBase + 1.8 * a, 0.6);
			this.camera.updateProjectionMatrix();
		}
		else if (this.camera.fov !== this._fovBase) {
			this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this._fovBase, 0.2);
			this.camera.updateProjectionMatrix();
		}
	}

	queueWeaponSwitch(target, label = 'Pistol', hint = '[1]') {
		if (this._switchAnim.active || this.player.weapon === target || this.player.reloading) { return; }
		this._switchAnim.active = true; this._switchAnim.t = 0; this._switchAnim.dir = -1; this._switchAnim.duration = 0.16; this._switchAnim.target = target;
		this._switchAnim.onComplete = () => {
			this.player.weapon = target; try { this.markHudDirty(); } catch (_) { }
			// update HUD weapon pill (use simple emoji icons)
			try {
				if (this.hud && typeof this.hud.setWeapon === 'function') {
					const icon = (target === 'grenade') ? '💣' : '🔫';
					this.hud.setWeapon(label || (target === 'grenade' ? 'Granat' : 'Pistol'), icon);
				}
			} catch (_) { }
			this._switchAnim.dir = 1; this._switchAnim.t = 0; this._switchAnim.duration = 0.14;
		};
		try { this.audio.weaponSwitch(); this.audio.duckBgm(0.6, 180); } catch (_) { }
		// toast UI
		this.showWeaponToast(label, hint);
	}

	showWeaponToast(label, hint) {
		const el = document.getElementById('weaponToast'); if (!el) return;
		el.querySelector('.label').textContent = label;
		el.querySelector('.sub').textContent = hint;
		el.classList.remove('hidden');
		el.classList.add('show');
		clearTimeout(this._toastTimer);
		this._toastTimer = setTimeout(() => { el.classList.add('hidden'); el.classList.remove('show'); }, 1300);
	}

	updateWeaponSwitch(dt) {
		if (!this._switchAnim.active || !this.weapon) return;
		const a = this._switchAnim;
		a.t += dt;
		const k = Math.min(1, a.t / a.duration);
		// progress: 0->1 untuk lower, lalu raise
		const dir = a.dir; // -1 turun, +1 naik
		const p = dir < 0 ? k : k;
		const drop = dir < 0 ? THREE.MathUtils.lerp(0, -0.22, p) : THREE.MathUtils.lerp(-0.22, 0, p);
		const tilt = dir < 0 ? THREE.MathUtils.lerp(0, 0.24, p) : THREE.MathUtils.lerp(0.24, 0, p);
		// terapkan ke weapon group relatif base
		const bp = this.weapon.basePos; const br = this.weapon.baseRot;
		this.weapon.group.position.set(bp.x, bp.y + drop, bp.z);
		this.weapon.group.rotation.set(br.x + tilt, br.y, br.z);
		if (k >= 1) {
			if (dir < 0 && typeof a.onComplete === 'function') { const cb = a.onComplete; a.onComplete = null; cb(); a.t = 0; return; }
			if (dir > 0) { a.active = false; }
		}
	}

	onEnemyKilled() {
		// killstreak
		this._streak.count += 1; this._streak.timer = 3.0;
		if (this._streak.count >= 2) { this.showStreakToast(`Killstreak x${this._streak.count}!`); try { this.audio.streak(); } catch (_) { } }
	}

	showStreakToast(text) { const el = document.getElementById('streakToast'); if (!el) return; el.textContent = text; el.classList.remove('hidden'); el.classList.add('show'); clearTimeout(this._streakToastTimer); this._streakToastTimer = setTimeout(() => { el.classList.add('hidden'); el.classList.remove('show'); }, 1600); }

	updatePowerups(dt) {
		// timer decrease
		for (const k of Object.keys(this.powerups)) { if (this.powerups[k] > 0) this.powerups[k] = Math.max(0, this.powerups[k] - dt); }
		// streak timer decay
		if (this._streak.timer > 0) { this._streak.timer -= dt; if (this._streak.timer <= 0) this._streak.count = 0; }
		// render HUD
		const wrap = document.getElementById('powerups'); if (!wrap) return; wrap.innerHTML = '';
		const active = Object.entries(this.powerups).filter(([k, v]) => v > 0);
		if (active.length === 0) { wrap.classList.add('hidden'); return; }
		wrap.classList.remove('hidden');
		for (const [k, v] of active) { const d = document.createElement('div'); d.className = 'pu'; d.textContent = `${k.toUpperCase()} ${Math.ceil(v)}s`; wrap.appendChild(d); }
	}

	takePlayerDamage(amount, fromPos, shooterTeam) {
		// Friendly Fire Check
		if (shooterTeam && this.player.team && shooterTeam === this.player.team) return;

		let dmg = amount;
		if (this.perks && this.perks.shield > 0) {
			const use = Math.min(this.perks.shield, dmg);
			this.perks.shield -= use; dmg -= use;
		}
		if (dmg > 0) {
			this.player.health -= dmg;
		}
		this.pulseHitVignette(fromPos || this.controls.getObject().position.clone());
		const nowMs = performance.now();
		if (nowMs - this._lastHurtSfxMs > 140) { try { this.audio.playerHurt(); } catch (_) { } this._lastHurtSfxMs = nowMs; }
		if (this.player.health <= 0) { this.gameOver(); return; }
		try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
	}

	// ===== Pools for short-lived effects to reduce allocations =====
	_initPools() {
		try { const impl = this._initPools; const proto = Object.getPrototypeOf(this)._initPools; if (impl && impl !== proto) return impl.call(this); } catch (_) { }
	}

	_poolTick(dt) {
		try { const impl = this._poolTick; const proto = Object.getPrototypeOf(this)._poolTick; if (impl && impl !== proto) return impl.call(this, dt); } catch (_) { }
	}

	_getSparkTexture() {
		if (this._sparkTex) return this._sparkTex;
		const size = 64; const data = new Uint8Array(size * size * 4);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const i = (y * size + x) * 4;
				const dx = (x - size / 2) / (size / 2);
				const dy = (y - size / 2) / (size / 2);
				const d = Math.sqrt(dx * dx + dy * dy);
				const a = Math.max(0, 1 - d);
				const alpha = Math.pow(a, 2.2);
				data[i] = 255; data[i + 1] = 241; data[i + 2] = 168; data[i + 3] = Math.floor(alpha * 255);
			}
		}
		this._sparkTex = new THREE.DataTexture(data, size, size); this._sparkTex.needsUpdate = true; this._sparkTex.minFilter = THREE.LinearFilter; this._sparkTex.magFilter = THREE.LinearFilter; return this._sparkTex;
	}

	flashBloom(amount = 0.8, duration = 0.12) {
		try {
			if (!this.bloom) return;
			const orig = this.bloom.strength;
			this.bloom.strength = Math.min(2.5, orig + amount);
			setTimeout(() => { try { this.bloom.strength = orig; } catch (_) { } }, duration * 1000);
		} catch (_) { }
	}

	// spawnBeam: lebih tebal/terang untuk efek laser/energy (reuses tracer pool)
	spawnBeam(start, end, color = 0xffffff, duration = 0.12) {
		if (!this._tracerPool) return;
		// NaN Guard: Prevent "Computed radius is NaN" errors
		if (!isValidVector3(start)) return;
		if (end && !isValidVector3(end)) return;

		let entry = this._tracerPool.find(x => !x.busy);
		if (!entry) entry = this._tracerPool[0];
		const line = entry.obj;
		const posAttr = line.geometry.attributes.position.array;
		posAttr[0] = start.x; posAttr[1] = start.y; posAttr[2] = start.z;
		const toVec = end ? end : start.clone().add(new THREE.Vector3(0, 0, -1));
		posAttr[3] = toVec.x; posAttr[4] = toVec.y; posAttr[5] = toVec.z;
		line.geometry.attributes.position.needsUpdate = true;
		line.material.color.setHex(color);
		line.material.opacity = 0.95;
		line.visible = true; entry.busy = true; entry.ttl = duration;
		// slight glow via bloom boost
		try { this.flashBloom(0.35, duration * 0.9); } catch (_) { }
	}

	// Poisson-like sampling around player to avoid clumping (fast approximation)
	spawnPositionPoissonAround(center, minRadius = 3, maxRadius = 8, minDist = 3.0, samples = 200) {
		// sample uniformly over annulus area using sqrt trick
		for (let i = 0; i < samples; i++) {
			const a = Math.random() * Math.PI * 2;
			const r = Math.sqrt(Math.random() * (maxRadius * maxRadius - minRadius * minRadius) + minRadius * minRadius);
			const cand = new THREE.Vector3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
			let tooClose = false;
			for (const aobj of this.world.allies) { if (aobj.mesh && aobj.mesh.position.distanceTo(cand) < minDist) { tooClose = true; break; } }
			if (!tooClose) return cand;
		}
		// fallback random
		const ang = Math.random() * Math.PI * 2; const rr = minRadius + Math.random() * (maxRadius - minRadius);
		return new THREE.Vector3(center.x + Math.cos(ang) * rr, 0, center.z + Math.sin(ang) * rr);
	}

	openChatPrompt(force = false) {
		// fallback: open chat overlay input for non-blocking entry
		try {
			const menuEl = (typeof document !== 'undefined') ? document.getElementById('menu') : null;
			if (!force && ((menuEl && !menuEl.classList.contains('hidden')) || (typeof document !== 'undefined' && document.body.classList.contains('paused')))) return;
			const w = document.getElementById('chatOverlay');
			if (w) {
				w.style.display = (w.style.display === 'none' ? 'flex' : 'none');
				const inp = document.getElementById('chatInput');
				if (w.style.display !== 'none') { if (inp) inp.focus(); try { this.updateChatAllyList(); } catch (_) { } }
			}
		} catch (_) { }
	}

	// basic parser: map keywords to ally actions
	sendChatToAllies(msg) {
		// block chat commands when main menu visible or paused
		const menuEl = (typeof document !== 'undefined') ? document.getElementById('menu') : null;
		if ((menuEl && !menuEl.classList.contains('hidden')) || (typeof document !== 'undefined' && document.body.classList.contains('paused'))) return;
		const m = msg.toLowerCase();
		const isAttack = m.includes('attack') || m.includes('serang');
		const isHold = m.includes('hold') || m.includes('tahan');
		const isRegroup = m.includes('regroup') || m.includes('balik') || m.includes('regroup');
		const isFollow = m.includes('follow') || m.includes('ikut');
		for (const ally of this.world.allies) {
			try {
				if (isAttack) {
					ally.showChatMessage('Attack!', 1400);
					// find nearest enemy and engage
					let ne = null, nd = Infinity; for (const e of this.world.enemies) { const d = e.mesh.position.distanceTo(ally.mesh.position); if (d < nd) { nd = d; ne = e; } }
					if (ne) { ally.state = 'engage'; ally.targetEnemy = ne; ally.nextThink = 0.04; }
					// log ally reply
					try { this.addChatLog(ally.name, 'Enemy spotted!', 'ally'); } catch (_) { }
				} else if (isHold) {
					ally.showChatMessage('Holding', 1200);
					ally.state = 'hold'; ally.waypoint = ally.mesh.position.clone(); ally.targetEnemy = null;
					try { this.addChatLog(ally.name, 'Holding position', 'ally'); } catch (_) { }
				} else if (isRegroup) {
					ally.showChatMessage('Regrouping', 1200);
					ally.state = 'regroup'; ally.waypoint = this.controls.getObject().position.clone(); ally.nextThink = 0.05;
					try { this.addChatLog(ally.name, 'Regrouping', 'ally'); } catch (_) { }
				} else if (isFollow) {
					ally.showChatMessage('Following', 1200);
					ally.state = 'regroup'; ally.waypoint = this.controls.getObject().position.clone(); ally.nextThink = 0.05;
					try { this.addChatLog(ally.name, 'Following', 'ally'); } catch (_) { }
				} else {
					ally.showChatMessage('Roger', 900);
					try { this.addChatLog(ally.name, 'Roger', 'ally'); } catch (_) { }
				}
			} catch (_) { }
		}
	}

	createChatOverlayUI() {
		// delegasikan pembuatan chat UI ke modul eksternal
		createChatOverlayUI(this);
	}

	updateChatAllyList() {
		try { const impl = this.updateChatAllyList; const proto = Object.getPrototypeOf(this).updateChatAllyList; if (impl && impl !== proto) return impl.call(this); } catch (_) { }
	}

	cycleSelectedAlly() {
		try {
			// clear previous selection
			if (this._selectedAllyIndex >= 0 && this.world.allies[this._selectedAllyIndex]) this.world.allies[this._selectedAllyIndex].setSelected(false);
			if (!this.world.allies || this.world.allies.length === 0) { this._selectedAllyIndex = -1; this.updateChatAllyList(); return; }
			let next = this._selectedAllyIndex + 1;
			if (next >= this.world.allies.length) next = -1; // wrap to all
			this._selectedAllyIndex = next;
			if (this._selectedAllyIndex >= 0) this.world.allies[this._selectedAllyIndex].setSelected(true);
			// reflect in UI select
			try { const sel = document.getElementById('chatTargetSel'); if (sel) sel.value = (this._selectedAllyIndex === -1 ? 'all' : this._selectedAllyIndex.toString()); } catch (_) { }
			this.updateChatAllyList();
		} catch (_) { }
	}

	sendChatToAlly(msg, ally) {
		try {
			// guard: jangan jalankan jika menu/pause aktif
			const menuEl = (typeof document !== 'undefined') ? document.getElementById('menu') : null;
			if ((menuEl && !menuEl.classList.contains('hidden')) || (typeof document !== 'undefined' && document.body.classList.contains('paused'))) return;
			if (!ally) return;
			try { this.addChatLog('You', msg, 'player'); } catch (_) { }
			ally.showChatMessage(msg, 1400);
			const m = msg.toLowerCase();
			if (m.includes('attack') || m.includes('serang')) { // find nearest enemy
				let ne = null, nd = Infinity; for (const e of this.world.enemies) { const d = e.mesh.position.distanceTo(ally.mesh.position); if (d < nd) { nd = d; ne = e; } }
				if (ne) { ally.state = 'engage'; ally.targetEnemy = ne; ally.nextThink = 0.04; ally.showChatMessage('On it!', 900); try { this.addChatLog(ally.name, 'On it!', 'ally'); } catch (_) { } }
			} else if (m.includes('hold') || m.includes('tahan')) { ally.state = 'hold'; ally.waypoint = ally.mesh.position.clone(); ally.targetEnemy = null; try { this.addChatLog(ally.name, 'Holding', 'ally'); } catch (_) { } }
			else if (m.includes('regroup') || m.includes('balik')) { ally.state = 'regroup'; ally.waypoint = this.controls.getObject().position.clone(); ally.nextThink = 0.05; try { this.addChatLog(ally.name, 'Regrouping', 'ally'); } catch (_) { } }
			else if (m.includes('follow') || m.includes('ikut')) { ally.state = 'regroup'; ally.waypoint = this.controls.getObject().position.clone(); ally.nextThink = 0.05; try { this.addChatLog(ally.name, 'Following', 'ally'); } catch (_) { } }
		} catch (_) { }
	}

	// Adaptive culling: nonaktifkan grup instanced ketika kamera jauh untuk kurangi draw cost
	updateAdaptiveCulling() {
		try {
			const camPos = this.camera.position;
			// thresholds (tweakable)
			const pillarThresh = this._lowEnd ? 80 : 140;
			const platThresh = this._lowEnd ? 100 : 180;
			const buildingThresh = this._lowEnd ? 160 : 300;
			if (this._pillarInst) {
				const center = new THREE.Vector3(0, 1, 0); // world center roughly
				const d = camPos.distanceTo(center);
				this._pillarInst.visible = (d <= pillarThresh);
			}
			if (this._platInst) {
				const center = new THREE.Vector3(0, 1, 0);
				const d = camPos.distanceTo(center);
				this._platInst.visible = (d <= platThresh);
			}
			if (this._buildingInst) {
				const center = new THREE.Vector3(0, 1, 0);
				const d = camPos.distanceTo(center);
				this._buildingInst.visible = (d <= buildingThresh);
			}
		} catch (_) { }
	}

	// centralized score handler: update score and reduce enemy counters per 10 points
	addScore(points) {
		try {
			const pts = Number(points) || 0;
			this.world.score = (this.world.score || 0) + pts;
			// Track kills for session stats (anti-cheat)
			if (pts >= 10 && this.sessionManager) {
				this.sessionManager.recordKill();
			}
			try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
		} catch (_) { }
	}

	recordEnemyDeath(enemy) {
		// default implementation: increment per-wave kill counter and update HUD/wave state
		try {
			// jika objek enemy diberikan, pastikan dihitung sekali saja
			if (enemy && typeof enemy === 'object') {
				if (enemy._deathCounted) return;
				enemy._deathCounted = true;
			}
			if (typeof this._enemiesKilledThisWave !== 'number') this._enemiesKilledThisWave = 0;
			this._enemiesKilledThisWave += 1;
			// jika waveTotal diketahui dan sudah tercapai, masuk cooldown
			try {
				if (typeof this.waveTotal === 'number' && this._enemiesKilledThisWave >= this.waveTotal) {
					if (this.waveState !== 'cooldown') {
						this.waveState = 'cooldown';
						this.waveTimer = 6.0;
						try { console.info('[Wave] all scheduled enemies killed, entering cooldown'); } catch (_) { }
					}
				}
			} catch (_) { }
			try { this.markHudDirty(); } catch (_) { try { this.updateHUD(); } catch (_) { } }
		} catch (_) { }
	}

	// markHudDirty() disediakan oleh hudController; jangan duplikasi
} 