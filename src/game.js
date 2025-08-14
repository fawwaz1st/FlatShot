import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { Enemy } from './modules/enemy.js';
import { Ally } from './modules/ally.js';
import { AmmoPickup } from './modules/pickup.js';
import { HUD } from './modules/hud.js';
import { AudioFX } from './modules/audio.js';
import { Grenade } from './modules/grenade.js';

export default class Game {
	constructor() {
		this.clock = new THREE.Clock();
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x0a0a0f);
		this.scene.fog = new THREE.FogExp2(0x0a0a0f, 0.02);

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(this.renderer.domElement);

		this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 600);
		this.camera.position.set(0, 1.6, 5);

		this.controls = new PointerLockControls(this.camera, this.renderer.domElement);

		this.composer = new EffectComposer(this.renderer);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.25, 0.85);
		this.composer.addPass(this.bloom);

		this.hud = new HUD();
		this.audio = new AudioFX();

		this.input = this.createInputState();
		this.targetFps = 60; // default
		this._accum = 0; this._minFrameTime = 1/this.targetFps;
		this.player = {
			velocity: new THREE.Vector3(),
			speedWalk: 5,
			speedRun: 8.5,
			radius: 0.4,
			health: 100,
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
			bounds: 120,
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

		this.setupLights();
		this.setupWorld();
		this.createWeapon();
		this.setupEvents();
		this.spawnInitialAllies();
		this.createAmbientParticles();
		this.createSunSprite();
		this.updateHUD();
	}

	setAimAssistDegrees(deg){
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
	setFov(deg){
		this.config.fov = Math.max(50, Math.min(110, deg));
		this.camera.fov = this.config.fov; this.camera.updateProjectionMatrix();
	}
	setRenderScale(scale){
		this.config.renderScale = Math.max(0.5, Math.min(1.25, scale));
		const base = Math.min(window.devicePixelRatio, 2);
		this.renderer.setPixelRatio(base * this.config.renderScale);
		this.composer.setSize(window.innerWidth, window.innerHeight);
	}
	setFogDensity(d){ this.config.fogDensity = Math.max(0, Math.min(0.06, d)); this.scene.fog.density = this.config.fogDensity; }
	setDrawDistance(dist){ this.config.drawDistance = Math.max(150, Math.min(1500, dist)); this.camera.far = this.config.drawDistance; this.camera.updateProjectionMatrix(); }
	setParticles(count){
		this.config.particles = Math.max(0, Math.min(2000, Math.floor(count)));
		if (this.particles) { this.scene.remove(this.particles); this.particles.geometry.dispose(); this.particles.material.dispose(); this.particles = null; }
		if (this.config.particles > 0) this.createAmbientParticles();
	}
	applyGraphicsPreset(p){
		// low/medium/high/ultra
		switch(p){
			case 'low': this.setRenderScale(0.7); this.setBloom(0.3); this.setFogDensity(0.01); this.setParticles(150); this.setDrawDistance(500); break;
			case 'medium': this.setRenderScale(0.9); this.setBloom(0.5); this.setFogDensity(0.02); this.setParticles(300); this.setDrawDistance(600); break;
			case 'high': this.setRenderScale(1.0); this.setBloom(0.7); this.setFogDensity(0.02); this.setParticles(400); this.setDrawDistance(800); break;
			case 'ultra': default: this.setRenderScale(1.1); this.setBloom(0.9); this.setFogDensity(0.025); this.setParticles(600); this.setDrawDistance(1000); break;
		}
	}

	createInputState() {
		const state = {
			forward: false,
			backward: false,
			left: false,
			right: false,
			run: false,
			shoot: false,
			shootPressed: false,
			shootReleased: false,
			jump: false
		};
		const onKey = (e, down) => {
			switch (e.code) {
				case 'Digit1': if (down) { this.player.weapon = 'pistol'; this.updateHUD(); } break;
				case 'Digit2': if (down) { this.player.weapon = 'grenade'; this.updateHUD(); } break;
				case 'KeyW': case 'ArrowUp': state.forward = down; break;
				case 'KeyS': case 'ArrowDown': state.backward = down; break;
				case 'KeyA': case 'ArrowLeft': state.left = down; break;
				case 'KeyD': case 'ArrowRight': state.right = down; break;
				case 'ShiftLeft': case 'ShiftRight': state.run = down; break;
				case 'Space': state.jump = down; break;
				case 'KeyR': if (down) this.reload(); break;
				case 'Escape': if (down) this.pauseToMenu(); break;
			}
		};
		window.addEventListener('keydown', (e) => onKey(e, true));
		window.addEventListener('keyup', (e) => onKey(e, false));
		this.renderer.domElement.addEventListener('mousedown', (e) => {
			if (e.button === 0) { state.shoot = true; state.shootPressed = true; }
		});
		this.renderer.domElement.addEventListener('mouseup', (e) => {
			if (e.button === 0) { state.shoot = false; state.shootReleased = true; }
		});
		return state;
	}

	setupLights() {
		const hemi = new THREE.HemisphereLight(0x6670ff, 0x111122, 0.35);
		this.scene.add(hemi);
		this.sun = new THREE.DirectionalLight(0xffffff, 0.9);
		this.sun.position.set(10, 20, 10);
		this.sun.castShadow = false;
		this.scene.add(this.sun);
	}

	setupWorld() {
		const floorGeo = new THREE.PlaneGeometry(1000, 1000, 1, 1);
		const floorMat = new THREE.MeshStandardMaterial({ color: 0x0e1116, metalness: 0.12, roughness: 0.9 });
		const floor = new THREE.Mesh(floorGeo, floorMat);
		floor.rotation.x = -Math.PI / 2;
		floor.receiveShadow = false;
		floor.position.y = 0;
		this.scene.add(floor);

		const bounds = this.world.bounds;
		const wallMat = new THREE.MeshStandardMaterial({ color: 0x1b2330, metalness: 0.1, roughness: 0.9 });
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
		wallMeshes[0].position.set(0, wallH/2, -bounds);
		wallMeshes[1].position.set(0, wallH/2, bounds);
		wallMeshes[2].position.set(-bounds, wallH/2, 0);
		wallMeshes[3].position.set(bounds, wallH/2, 0);
		for (let i = 0; i < wallMeshes.length; i++) {
			const w = wallMeshes[i];
			w.receiveShadow = false;
			this.scene.add(w);
			const halfX = (i < 2) ? bounds : (wallT * 0.5);
			const halfZ = (i < 2) ? (wallT * 0.5) : bounds;
			this.world.obstacles.push({ type: 'wall', mesh: w, half: new THREE.Vector3(halfX, 0, halfZ) });
		}

		// Elemen tambahan map: pilar & platform
		const pillarMat = new THREE.MeshStandardMaterial({ color: 0x223042, roughness: 0.8, metalness: 0.05 });
		for (let i = 0; i < 24; i++) {
			const r = bounds * 0.85 * Math.random();
			const a = Math.random() * Math.PI * 2;
			const x = Math.cos(a) * r;
			const z = Math.sin(a) * r;
			const h = 2 + Math.random() * 6;
			const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, h, 12), pillarMat);
			cyl.position.set(x, h/2, z);
			this.scene.add(cyl);
			this.world.obstacles.push({ type: 'pillar', mesh: cyl, half: new THREE.Vector3(0.8, h/2, 0.8) });
		}

		const platMat = new THREE.MeshStandardMaterial({ color: 0x182333, roughness: 0.9 });
		for (let i = 0; i < 8; i++) {
			const w = 8 + Math.random() * 12;
			const d = 8 + Math.random() * 12;
			const y = 2 + Math.random() * 4;
			const box = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), platMat);
			box.position.set((Math.random()-0.5)*bounds*1.6, y, (Math.random()-0.5)*bounds*1.6);
			this.scene.add(box);
			this.world.obstacles.push({ type: 'platform', mesh: box, half: new THREE.Vector3(w/2, 0.3, d/2) });
		}

		// Tambah beberapa bangunan blok
		const bmat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.85 });
		for (let i = 0; i < 12; i++) {
			const bw = 6 + Math.random() * 10;
			const bh = 4 + Math.random() * 8;
			const bd = 6 + Math.random() * 10;
			const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bmat);
			b.position.set((Math.random()-0.5)*bounds*1.4, bh/2, (Math.random()-0.5)*bounds*1.4);
			this.scene.add(b);
			this.world.obstacles.push({ type: 'building', mesh: b, half: new THREE.Vector3(bw/2, bh/2, bd/2) });
		}

		// cache obstacle meshes untuk optimisasi raycast
		this._obstacleMeshes = this.world.obstacles.map(o => o.mesh);

		for (let i = 0; i < 14; i++) this.spawnEnemy();
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
			trajPositions: null
		};
		this.camera.add(group);
	}

	setupEvents() {
		const el = this.renderer.domElement;
		el.addEventListener('click', () => {
			if (!this.controls.isLocked) {
				this.controls.lock();
				this.dispatchResumeHUD();
			}
		});
		this.controls.addEventListener('lock', () => {
			this.dispatchResumeHUD();
		});
		this.controls.addEventListener('unlock', () => {
			this.pauseToMenu();
		});

		window.addEventListener('resize', () => {
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(window.innerWidth, window.innerHeight);
			this.composer.setSize(window.innerWidth, window.innerHeight);
		});
	}

	start() {
		if (!this.animating) {
			this.animating = true;
			this.loop();
		}
	}

	pauseToMenu() {
		window.dispatchEvent(new Event('game:showMenu'));
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
		this.sun.position.set(Math.cos(cyc) * 20, 10 + elev * 4, Math.sin(cyc) * 20);
		this.scene.background.setHSL(0.62, 0.5, 0.05 + (elev*0.03+0.04));
		this.scene.fog.color.setHSL(0.62, 0.4, 0.05 + (elev*0.03+0.04));

		this.updatePlayer(dt);
		this.updateEnemies(dt);
		this.updateAllies(dt);
		this.updatePickups(dt);
		this.updateGrenades(dt);
		this.updateWeapon(dt);
		this.updateParticles(dt);
		this.updateGrenadeAim(dt);
		this.handleFireInputs();

		// reset edge flags per frame
		this.input.shootPressed = false;
		this.input.shootReleased = false;

		this.composer.render();
	}

	setFps(fps){
		const clamped = Math.max(30, Math.min(240, fps||60));
		this.targetFps = clamped;
		this._minFrameTime = 1 / this.targetFps;
	}

	updatePlayer(dt) {
		const speed = (this.input.run ? this.player.speedRun : this.player.speedWalk);
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

		const step = speed * dt;
		this.tryMove(move.multiplyScalar(step));

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
		const pos = this.controls.getObject().position;
		const next = this.tmpVec3.copy(pos).add(delta);

		const max = this.world.bounds - 1.0;
		next.x = Math.max(-max, Math.min(max, next.x));
		next.z = Math.max(-max, Math.min(max, next.z));

		const radius = this.player.radius + 0.05;
		for (let iter=0; iter<2; iter++) {
			for (const o of this.world.obstacles) {
				const p = next;
				const bp = o.mesh.position;
				const half = o.half;
				const dx = Math.max(Math.abs(p.x - bp.x) - (half.x + radius), 0);
				const dz = Math.max(Math.abs(p.z - bp.z) - (half.z + radius), 0);
				const dist = Math.hypot(dx, dz);
				if (dist < 0.001) {
					const nx = p.x - bp.x;
					const nz = p.z - bp.z;
					const len = Math.hypot(nx, nz) || 1;
					p.x = bp.x + (nx / len) * (half.x + radius + 0.001);
					p.z = bp.z + (nz / len) * (half.z + radius + 0.001);
				}
			}
		}
		pos.set(next.x, this.player.y, next.z);
	}

	findHitEnemy(obj) {
		let node = obj;
		while (node) {
			const found = this.world.enemies.find(e => e.mesh === node);
			if (found) return found;
			node = node.parent;
		}
		return null;
	}

	performSyncedShotRay() {
		this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
		const enemyMeshes = this.world.enemies.map(e => e.mesh);
		const firstHits = this.raycaster.intersectObjects(enemyMeshes.concat(this.world.obstacles.map(o=>o.mesh)), true);
		let targetPoint = null;
		let targetEnemy = null;
		for (const hit of firstHits) {
			const e = this.findHitEnemy(hit.object);
			if (e) { targetPoint = hit.point.clone(); targetEnemy = e; break; }
			if (!targetPoint) targetPoint = hit.point.clone();
		}
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
		const blockers = this.world.obstacles.map(o=>o.mesh);
		const blockHits = secondRay.intersectObjects(blockers, true);
		if (blockHits.length > 0) {
			return { point: blockHits[0].point.clone(), enemy: null };
		}
		return { point: targetPoint, enemy: targetEnemy };
	}

	tryShoot() {
		const now = performance.now() / 1000;
		const interval = 1 / (this.player.weapon === 'pistol' ? this.player.fireRate : 1.5);
		if (now - this.player.lastShotTime < interval) return;
		if (this.player.reloading) return;
		if (this.player.weapon === 'pistol') {
			if (this.player.ammoInMag <= 0) { this.audio.click(); return; }
			this.player.lastShotTime = now;
			this.player.ammoInMag -= 1;
			this.updateHUD();
			this.audio.shoot();
			this.kickRecoil();
			this.playMuzzleFlash();
			this.shake.amp = Math.min(1.2, this.shake.amp + 0.15);

			// arah tembak dengan aim assist cone (derajat)
			const coneDeg = this.config.aimAssistDeg || 0;
			const { point, enemy } = this.performSyncedShotRay();
			let shotPoint = point;
			if (point && coneDeg > 0) {
				const rad = (coneDeg * Math.PI) / 180;
				const offX = (Math.random()-0.5) * rad;
				const offY = (Math.random()-0.5) * rad;
				const camPos = this.camera.position.clone();
				const to = point.clone().sub(camPos).normalize();
				const up = new THREE.Vector3(0,1,0);
				const right = new THREE.Vector3().crossVectors(to, up).normalize();
				const trueUp = new THREE.Vector3().crossVectors(right, to).normalize();
				const dir = to.clone().add(right.multiplyScalar(offX)).add(trueUp.multiplyScalar(offY)).normalize();
				shotPoint = camPos.add(dir.multiplyScalar(100));
			}
			if (shotPoint) {
				const start = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
				this.spawnTracer(start, shotPoint);
				this.spawnBulletSparks(start, shotPoint);
			}
			if (enemy && point) {
				const dead = enemy.applyDamage(this.damageByDifficulty(28, 12));
				this.audio.hit();
				this.spawnHitMarker(point);
				this.spawnHitSparks(point, 10, 0xfff1a8);
				if (dead) { this.world.score += 10; this.updateHUD(); this.removeEnemy(enemy); this.spawnEnemy(); }
			}
		}
	}

	handleFireInputs(){
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
			this.updateHUD();
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
		const g = new Grenade(this.scene, start, vel, {
			obstacles: this.world.obstacles,
			bounds: this.world.bounds,
			fuse: 1.6,
			explodeOnImpact: true,
			onExplode: (center)=>{
				this.spawnExplosion(center);
				this.spawnHitSparks(center, 48, 0xffe08a);
				this.shake.amp = Math.min(3.0, this.shake.amp + 1.6);
				if (this.audio) try { this.audio.explosion({ volume: 1.0 }); } catch(_) {}
				// radius besar dengan falloff lembut
				const radius = 12.0;
				for (const e of [...this.world.enemies]) {
					const d = e.mesh.position.distanceTo(center);
					if (d < radius) {
						const base = this.damageByDifficulty(110, 40);
						const factor = Math.max(0, 1 - (d / radius));
						const dmg = base * (0.35 + 0.65 * factor); // tidak nol di tepi
						const dead = e.applyDamage(dmg);
						if (dead) { this.world.score += 12; this.removeEnemy(e); this.spawnEnemy(); }
					}
				}
				this.updateHUD();
			}
		});
		this.world.grenades.push(g);
	}

	spawnHitSparks(center, count = 8, color = 0xfff1a8) {
		const geom = new THREE.BufferGeometry();
		const positions = new Float32Array(count * 3);
		for (let i=0;i<count;i++) {
			const a = Math.random()*Math.PI*2; const r = Math.random()*0.6;
			positions[i*3+0] = center.x + Math.cos(a)*r;
			positions[i*3+1] = center.y + Math.random()*0.6;
			positions[i*3+2] = center.z + Math.sin(a)*r;
		}
		geom.setAttribute('position', new THREE.BufferAttribute(positions,3));
		const mat = new THREE.PointsMaterial({ color, size: 0.05, transparent:true, opacity:0.9 });
		const pts = new THREE.Points(geom, mat);
		this.scene.add(pts);
		setTimeout(()=>{ this.scene.remove(pts); geom.dispose(); mat.dispose(); }, 250);
	}

	spawnBulletSparks(start, end) {
		const count = 12;
		const geom = new THREE.BufferGeometry();
		const positions = new Float32Array(count*3);
		for (let i=0;i<count;i++) {
			const t = i/(count-1);
			positions[i*3+0] = THREE.MathUtils.lerp(start.x, end.x, t) + (Math.random()-0.5)*0.02;
			positions[i*3+1] = THREE.MathUtils.lerp(start.y, end.y, t) + (Math.random()-0.5)*0.02;
			positions[i*3+2] = THREE.MathUtils.lerp(start.z, end.z, t) + (Math.random()-0.5)*0.02;
		}
		geom.setAttribute('position', new THREE.BufferAttribute(positions,3));
		const mat = new THREE.PointsMaterial({ color: 0xfff1a8, size: 0.025, transparent:true, opacity:0.8 });
		const pts = new THREE.Points(geom, mat);
		this.scene.add(pts);
		setTimeout(()=>{ this.scene.remove(pts); geom.dispose(); mat.dispose(); }, 120);
	}

	spawnExplosion(center) {
		const group = new THREE.Group();
		group.position.copy(center);
		// core glow
		const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
		// shock rings
		const ringGeo = new THREE.RingGeometry(0.2, 0.24, 48);
		const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
		const ring1 = new THREE.Mesh(ringGeo, ringMat.clone()); ring1.rotation.x = -Math.PI/2;
		const ring2 = new THREE.Mesh(ringGeo, ringMat.clone()); ring2.rotation.x = -Math.PI/2; ring2.material.color.setHex(0xffc07a);
		// smoke billboard sederhana (sprite)
		const smokeTex = this._getSmokeTexture();
		const smokeMat = new THREE.SpriteMaterial({ map: smokeTex, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
		const smoke = new THREE.Sprite(smokeMat); smoke.scale.set(6, 6, 1);
		// debris titik
		const debris = this._spawnDebris(center, 50);
		// flash light
		const flash = new THREE.PointLight(0xfff1a8, 3.0, 28);
		group.add(glow); group.add(ring1); group.add(ring2); group.add(smoke); group.add(flash);
		this.scene.add(group);
		// screen flash halus via overlay
		this._screenFlash(0.45, 160);
		let t = 0;
		const tick = () => {
			if (t > 1.1) { this.scene.remove(group); glow.geometry.dispose(); glow.material.dispose(); ring1.geometry.dispose(); ring1.material.dispose(); ring2.material.dispose(); smoke.material.map?.dispose?.(); smoke.material.dispose(); return; }
			const s = THREE.MathUtils.lerp(0.3, 9.0, t);
			glow.scale.setScalar(s);
			ring1.scale.setScalar(THREE.MathUtils.lerp(1, 26, t)); ring1.material.opacity = 0.95 * (1 - t);
			ring2.scale.setScalar(THREE.MathUtils.lerp(1, 18, Math.min(1, t*1.4))); ring2.material.opacity = 0.85 * (1 - Math.min(1, t*1.4));
			smoke.material.opacity = 0.9 * (1 - Math.min(1, (t-0.1)*0.9)); smoke.scale.setScalar(THREE.MathUtils.lerp(4, 16, t));
			flash.intensity = 3.0 * (1 - t);
			t += 0.05;
			requestAnimationFrame(tick);
		};
		tick();
		// cleanup debris
		setTimeout(()=>{ this.scene.remove(debris.obj); debris.dispose(); }, 600);
	}

	_getSmokeTexture(){
		if (this._smokeTex) return this._smokeTex;
		const size = 128; const data = new Uint8Array(size*size*4);
		for (let y=0;y<size;y++){
			for (let x=0;x<size;x++){
				const i = (y*size + x)*4;
				const dx = x-size/2; const dy = y-size/2; const d = Math.sqrt(dx*dx+dy*dy)/(size/2);
				const alpha = Math.max(0, 1 - Math.pow(d, 1.6));
				data[i]=200; data[i+1]=200; data[i+2]=200; data[i+3]=Math.floor(alpha*255);
			}
		}
		this._smokeTex = new THREE.DataTexture(data, size, size); this._smokeTex.needsUpdate = true; this._smokeTex.minFilter = THREE.LinearFilter; this._smokeTex.magFilter = THREE.LinearFilter;
		return this._smokeTex;
	}

	_spawnDebris(center, count){
		const geom = new THREE.BufferGeometry();
		const positions = new Float32Array(count*3);
		const velocities = [];
		for (let i=0;i<count;i++){
			positions[i*3+0] = center.x; positions[i*3+1] = center.y; positions[i*3+2] = center.z;
			const a = Math.random()*Math.PI*2; const r = Math.random()*1.5; const v = 8 + Math.random()*10;
			velocities.push({ vx: Math.cos(a)*v, vy: 3+Math.random()*6, vz: Math.sin(a)*v });
		}
		geom.setAttribute('position', new THREE.BufferAttribute(positions,3));
		const mat = new THREE.PointsMaterial({ color: 0xffae5a, size: 0.06, transparent: true, opacity: 0.95 });
		const pts = new THREE.Points(geom, mat);
		this.scene.add(pts);
		let t = 0; const tick = ()=>{
			if (t>0.5) { return; }
			const pos = geom.attributes.position.array;
			for (let i=0;i<count;i++){
				velocities[i].vy += -12 * 0.016;
				pos[i*3+0] += velocities[i].vx * 0.016;
				pos[i*3+1] += velocities[i].vy * 0.016;
				pos[i*3+2] += velocities[i].vz * 0.016;
			}
			geom.attributes.position.needsUpdate = true;
			t += 0.016; requestAnimationFrame(tick);
		}; tick();
		return { obj: pts, dispose: ()=>{ try{ geom.dispose(); mat.dispose(); }catch(_){} } };
	}

	_screenFlash(intensity = 0.4, durationMs = 120){
		const el = document.getElementById('transition'); if (!el) return;
		el.style.background = `rgba(255,241,168,${intensity})`;
		el.classList.remove('hidden'); el.classList.add('show');
		setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>{ el.classList.add('hidden'); el.style.background = '#000'; }, 200); }, durationMs);
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
		const fx = document.getElementById('reloadFX'); if (fx){ fx.classList.remove('hidden'); fx.classList.add('play'); setTimeout(()=>{ fx.classList.remove('play'); fx.classList.add('hidden'); }, 500); }
		setTimeout(() => {
			const toLoad = Math.min(need, this.player.ammoReserve);
			this.player.ammoInMag += toLoad;
			this.player.ammoReserve -= toLoad;
			this.player.reloading = false;
			this.updateHUD();
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
		const length = 30;
		const dir = new THREE.Vector3();
		this.camera.getWorldDirection(dir);
		const to = end ? end.clone() : start.clone().add(dir.multiplyScalar(length));
		const points = [start, to];
		const geom = new THREE.BufferGeometry().setFromPoints(points);
		const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
		const line = new THREE.Line(geom, mat);
		this.scene.add(line);
		// SFX whizz jika dekat kamera
		const cam = this.camera.position;
		const seg = new THREE.Vector3().subVectors(end, start);
		const toCam = new THREE.Vector3().subVectors(cam, start);
		const t = Math.max(0, Math.min(1, toCam.dot(seg.clone().normalize()) / seg.length()));
		const closest = start.clone().add(seg.multiplyScalar(t));
		if (closest.distanceTo(cam) < 2.2) { try { this.audio.whizz(); } catch(_) {} }
		setTimeout(() => {
			mat.opacity = 0.0;
			this.scene.remove(line);
			geom.dispose(); mat.dispose();
		}, 60);
	}

	playMuzzleFlash() {
		if (!this.weapon) return;
		this.weapon.flash.visible = true;
		setTimeout(() => { if (this.weapon) this.weapon.flash.visible = false; }, 40);
	}

	kickRecoil() {
		if (!this.weapon) return;
		this.weapon.recoilX += 0.08;
		this.weapon.recoilY += (Math.random() - 0.5) * 0.02;
		this.weapon.recoilZ += 0.02;
	}

	updateWeapon(dt) {
		if (!this.weapon) return;
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
		const bounds = this.world.bounds - 5;
		const pos = new THREE.Vector3((Math.random() - 0.5) * bounds * 2, 0, (Math.random() - 0.5) * bounds * 2);
		const p = this.controls.getObject ? this.controls.getObject().position : new THREE.Vector3(0, 0, 0);
		if (pos.distanceTo(new THREE.Vector3(p.x, 0, p.z)) < 10) pos.add(new THREE.Vector3(10, 0, 0));
		const enemy = new Enemy(this.scene, pos);
		this.world.enemies.push(enemy);
	}

	removeEnemy(enemy) {
		enemy.dispose(this.scene);
		this.world.enemies = this.world.enemies.filter(e => e !== enemy);
	}

	spawnInitialAllies() {
		for (let i = 0; i < 5; i++) this.spawnAlly();
	}

	spawnAlly() {
		const p = this.controls.getObject().position;
		const pos = new THREE.Vector3(p.x + (Math.random()-0.5)*6, 0, p.z + (Math.random()-0.5)*6);
		const ally = new Ally(this.scene, pos);
		this.world.allies.push(ally);
		this.updateHUD();
	}

	removeAlly(ally) {
		ally.dispose(this.scene);
		this.world.allies = this.world.allies.filter(a => a !== ally);
		this.updateHUD();
		setTimeout(() => this.spawnAlly(), 2000);
	}

	updateAllies(dt) {
		const playerPos = this.controls.getObject().position;
		const context = { playerPos, enemies: this.world.enemies, obstacles: this.world.obstacles, pickups: this.world.pickups };
		for (const ally of this.world.allies) {
			const action = ally.update(dt, context);
			if (action.shoot && action.target) {
				const start = ally.mesh.position.clone();
				const end = action.target.mesh.position.clone();
				this.spawnTracer(start, end, 0x38bdf8);
				const dead = action.target.applyDamage(this.damageByDifficulty(14, 8));
				if (dead) {
					this.world.score += 6;
					this.updateHUD();
					this.removeEnemy(action.target);
					this.spawnEnemy();
				}
			}
		}
	}

	updateEnemies(dt) {
		const playerPos = this.controls.getObject().position;
		for (const enemy of this.world.enemies) {
			const act = enemy.update(dt, playerPos, this.world.obstacles, this._obstacleMeshes);
			if (act.contact) {
				this.player.health -= this.damageByDifficulty(10, 5) * dt;
				if (Math.random() < 0.05) this.audio.playerHurt();
				if (this.player.health <= 0) { this.gameOver(); return; }
				this.updateHUD();
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
					this.spawnTracer(enemy.mesh.position.clone(), target.pos.clone(), 0xff6b6b);
					this.showShotIndicator(enemy.mesh.position.clone());
					this.playEnemyShotAudio(enemy.mesh.position.clone());
					this.spawnEnemyMuzzleFlash(enemy.mesh.position.clone());
					this._lastEnemyTracerMs = nowMs;
				}
				if (target.isPlayer) {
					this.player.health -= this.damageByDifficulty(8, 6);
					this.pulseHitVignette(enemy.mesh.position.clone());
					// ricochet kecil di sekitar kamera agar terasa kena
					try { this.audio.ricochet(); } catch(_) {}
					if (this.player.health <= 0) { this.gameOver(); return; }
					this.updateHUD();
				} else if (target.ally) {
					target.ally.health -= this.damageByDifficulty(10, 6);
					if (target.ally.health <= 0) this.removeAlly(target.ally);
				}
			}
		}

		// Inisiatif: auto-scaling jumlah musuh berdasarkan skor
		const desired = 12 + Math.floor(this.world.score / 30);
		if (this.world.enemies.length < desired && this.animating) {
			this.spawnEnemy();
		}

		// ambience pertempuran: ledakan jauh acak
		if (Math.random() < 0.004) {
			const a = Math.random() * Math.PI * 2; const r = 30 + Math.random()*60;
			const p = new THREE.Vector3(playerPos.x + Math.cos(a)*r, 0.1, playerPos.z + Math.sin(a)*r);
			this.spawnExplosion(p);
			if (this.audio) try { this.audio.explosion({ volume: 0.4 }); } catch(_) {}
		}
	}

	updateGrenades(dt){
		for (const g of [...this.world.grenades]) {
			if (!g.alive) { this.world.grenades = this.world.grenades.filter(x=>x!==g); continue; }
			g.update(dt);
			if (!g.alive) { this.world.grenades = this.world.grenades.filter(x=>x!==g); }
		}
	}

	// ====== Grenade trajectory prediction ======
	initGrenadeTrajectory(){
		if (this.weapon.trajLine) return;
		const segments = 30;
		this.weapon.trajPositions = new Float32Array((segments+1) * 3);
		const geom = new THREE.BufferGeometry();
		geom.setAttribute('position', new THREE.BufferAttribute(this.weapon.trajPositions, 3));
		const mat = new THREE.LineBasicMaterial({ color: 0x9ae66e, transparent: true, opacity: 0.85 });
		this.weapon.trajLine = new THREE.Line(geom, mat);
		this.scene.add(this.weapon.trajLine);
		// marker impact
		if (!this.weapon.trajImpact) {
			const rim = new THREE.RingGeometry(0.18, 0.22, 32);
			const rimMat = new THREE.MeshBasicMaterial({ color: 0x9ae66e, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
			const ring = new THREE.Mesh(rim, rimMat); ring.rotation.x = -Math.PI/2; ring.visible = false;
			this.weapon.trajImpact = ring; this.scene.add(ring);
		}
	}

	clearGrenadeTrajectory(){
		if (!this.weapon.trajLine) return;
		this.scene.remove(this.weapon.trajLine);
		this.weapon.trajLine.geometry.dispose();
		this.weapon.trajLine.material.dispose();
		this.weapon.trajLine = null;
		this.weapon.trajPositions = null;
		if (this.weapon.trajImpact) this.weapon.trajImpact.visible = false;
	}

	updateGrenadeAim(dt){
		// tampilkan hanya saat senjata granat aktif dan tombol mouse kiri ditekan (menahan untuk aim)
		if (this.player.weapon !== 'grenade') { this.clearGrenadeTrajectory(); return; }
		if (!this.input.shoot) { this.clearGrenadeTrajectory(); return; }
		this.initGrenadeTrajectory();
		if (!this.weapon.trajLine) return;
		const positions = this.weapon.trajLine.geometry.attributes.position.array;
		const segments = positions.length/3 - 1;
		// ambil start & velocity sama seperti saat lempar
		const start = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
		const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
		const initialSpeed = 16; const upBoost = 0.6;
		const vel = new THREE.Vector3(dir.x, Math.max(0.2, dir.y) + upBoost, dir.z).normalize().multiplyScalar(initialSpeed);
		const g = -9.8;
		let p = start.clone(); let v = vel.clone();
		const step = 0.05;
		let impact = null;
		for (let i=0;i<=segments;i++){
			positions[i*3+0] = p.x; positions[i*3+1] = p.y; positions[i*3+2] = p.z;
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
				for (let j=i+1;j<=segments;j++){ positions[j*3+0]=p.x; positions[j*3+1]=p.y; positions[j*3+2]=p.z; }
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
		this._shotIndicatorTimer = setTimeout(()=>indicator.classList.remove('visible'), 280);
	}

	playEnemyShotAudio(fromPos){
		const now = performance.now();
		if (now - this._lastEnemyShotSfxMs < 70) return; // throttle suara musuh
		this._lastEnemyShotSfxMs = now;
		try {
			this.audio.ensureCtx();
			const ctx = this.audio.ctx;
			const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
			const gain = ctx.createGain(); gain.gain.value = 0.25;
			const osc = ctx.createOscillator(); osc.type='square'; osc.frequency.value=260;
			if (panner) {
				// pan berdasarkan posisi relatif X
				const relX = fromPos.x - this.controls.getObject().position.x;
				const pan = Math.max(-1, Math.min(1, relX / 20));
				panner.pan.value = pan;
				osc.connect(gain).connect(panner).connect(this.audio.masterGain);
			} else {
				osc.connect(gain).connect(this.audio.masterGain);
			}
			osc.start();
			setTimeout(()=>{ try{ osc.stop(); gain.disconnect(); if (panner) panner.disconnect(); }catch(e){} }, 120);
		} catch(_){}
	}

	updatePickups(dt) {
		const now = performance.now() / 1000;
		if (now - this.world.lastPickupSpawn > 3.5 && this.world.pickups.length < 8) {
			this.world.lastPickupSpawn = now;
			const bounds = this.world.bounds - 5;
			const pos = new THREE.Vector3((Math.random()-0.5)*bounds*2, 0, (Math.random()-0.5)*bounds*2);
			const r = Math.random();
			const type = r < 0.65 ? 'pistol' : (r < 0.85 ? 'grenade' : 'health');
			const p = new AmmoPickup(this.scene, pos, type);
			this.world.pickups.push(p);
		}

		for (const p of this.world.pickups) p.update(dt);
		const playerPosXZ = this.controls.getObject().position;
		for (const p of [...this.world.pickups]) {
			if (!p.alive) continue;
			if (p.mesh.position.distanceTo(playerPosXZ) < 1.2) {
				if (p.type === 'grenade') this.player.grenades += p.amount; 
				else if (p.type === 'health') this.player.health = Math.min(100, this.player.health + p.amount);
				else this.player.ammoReserve += p.amount;
				p.dispose(this.scene);
				this.world.pickups = this.world.pickups.filter(x => x !== p);
				this.updateHUD();
				continue;
			}
			for (const ally of this.world.allies) {
				if (!p.alive) break;
				if (p.mesh.position.distanceTo(ally.mesh.position) < 1.2) {
					if (p.type === 'grenade') this.player.grenades += Math.max(1, Math.floor(p.amount * 0.5));
					else if (p.type === 'health') this.player.health = Math.min(100, this.player.health + Math.floor(p.amount * 0.5));
					else this.player.ammoReserve += Math.floor(p.amount * 0.5);
					p.dispose(this.scene);
					this.world.pickups = this.world.pickups.filter(x => x !== p);
					this.updateHUD();
					break;
				}
			}
		}
	}

	createAmbientParticles() {
		const count = this.config.particles;
		const geo = new THREE.BufferGeometry();
		const positions = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			positions[i*3+0] = (Math.random()-0.5) * this.world.bounds * 2;
			positions[i*3+1] = Math.random() * 6 + 1;
			positions[i*3+2] = (Math.random()-0.5) * this.world.bounds * 2;
		}
		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const mat = new THREE.PointsMaterial({ color: 0x8fb3ff, size: 0.05, transparent: true, opacity: 0.5 });
		this.particles = new THREE.Points(geo, mat);
		this.scene.add(this.particles);
	}

	updateParticles(dt) {
		if (!this.particles) return;
		this.particles.rotation.y += dt * 0.02;
	}

	gameOver() {
		this.player.health = 0;
		this.updateHUD();
		this.animating = false;
		this.controls.unlock();
		window.dispatchEvent(new CustomEvent('game:gameOver', { detail: { score: this.world.score } }));
	}

	updateHUD() {
		const hpEl = document.getElementById('hp');
		const ammoEl = document.getElementById('ammo');
		const reserveEl = document.getElementById('reserve');
		const ammoWrap = document.getElementById('ammoWrap');
		const hpBar = document.getElementById('hpBar');
		const ammoBar = document.getElementById('ammoBar');
		const gWrap = document.getElementById('gWrap');
		const scoreEl = document.getElementById('score');
		const alliesEl = document.getElementById('allies');

		if (hpEl) hpEl.textContent = Math.max(0, this.player.health | 0).toString();
		if (ammoEl) ammoEl.textContent = this.player.ammoInMag.toString();
		if (reserveEl) reserveEl.textContent = this.player.ammoReserve.toString();
		if (ammoWrap) ammoWrap.textContent = `${this.player.ammoInMag}/${this.player.ammoReserve}`;

		const hpPct = Math.max(0, Math.min(1, this.player.health / 100));
		const ammoPct = Math.max(0, Math.min(1, this.player.ammoInMag / Math.max(1, this.player.magSize)));
		if (hpBar) hpBar.style.width = (hpPct * 100) + '%';
		if (ammoBar) ammoBar.style.width = (ammoPct * 100) + '%';
		if (gWrap) { gWrap.innerHTML = ''; for (let i=0;i<this.player.grenades;i++) { const d=document.createElement('div'); d.className='dot'; gWrap.appendChild(d);} }
		if (scoreEl) scoreEl.textContent = this.world.score.toString();
		if (alliesEl) alliesEl.textContent = this.world.allies.length.toString();
	}

	pulseHitVignette(fromPos){
		const el = document.getElementById('hitVignette'); if (!el) return;
		el.classList.remove('hidden'); el.classList.add('show');
		clearTimeout(this._hitVigTimer);
		this._hitVigTimer = setTimeout(()=>{ el.classList.remove('show'); el.classList.add('hidden'); }, 180);
	}

	spawnEnemyMuzzleFlash(pos){
		const flash = new THREE.PointLight(0xff6b6b, 2.0, 6);
		flash.position.copy(new THREE.Vector3(pos.x, 1.6, pos.z));
		this.scene.add(flash);
		setTimeout(()=> this.scene.remove(flash), 60);
	}
} 