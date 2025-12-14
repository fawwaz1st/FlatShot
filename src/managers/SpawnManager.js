import * as THREE from 'three';
import { Ally } from '../modules/ally.js';
import { Enemy } from '../modules/enemy.js';

export function attachSpawnManager(game) {
	try {
		// spawnEnemy (override/centralize spawn logic)
		game.spawnEnemy = function () {
			try { console.debug('[Spawn] spawnEnemy called', { currentCount: (this.world && this.world.enemies) ? this.world.enemies.length : 0, spawnLocked: this._spawnLocked }); } catch (_) { }
			// prevent rapid repeated spawns
			if (this._spawnLocked) { try { console.debug('[Spawn] spawn skipped due to spawnLock'); } catch (_) { }; return; }
			const bounds = this.world.bounds - 5;
			const pos = new THREE.Vector3((Math.random() - 0.5) * bounds * 2, 0, (Math.random() - 0.5) * bounds * 2);
			const p = this.controls.getObject ? this.controls.getObject().position : new THREE.Vector3(0, 0, 0);
			// ensure spawn not too close to player
			if (pos.distanceTo(new THREE.Vector3(p.x, 0, p.z)) < 10) pos.add(new THREE.Vector3(10, 0, 0));

			// dynamic difficulty based on play time (seconds)
			const playSec = Math.max(0, Number(this._playTimeSeconds) || 0);
			const difficultyScale = 1 + Math.max(0, Math.min(3, playSec / 120)); // +1 per 120s, cap +3

			// cap overall enemies to avoid runaway
			const currentCount = (this.world && this.world.enemies) ? this.world.enemies.length : 0;
			const hardLimit = (this.config && this.config.maxEnemies) ? this.config.maxEnemies : 350;
			const softLimit = Math.max(0, hardLimit - 50);
			if (currentCount >= hardLimit) return;
			if (currentCount > softLimit) {
				const prob = (hardLimit - currentCount) / (hardLimit - softLimit);
				if (Math.random() > prob) return; // thinner spawn chance as we near hard limit
			}

			// increase spawn chance with difficulty (but keep randomization)
			const baseSpawnChance = 0.8; // base probability to spawn when called
			const spawnChance = Math.min(0.98, baseSpawnChance + (difficultyScale - 1) * 0.06);
			if (Math.random() > spawnChance) return;

			try {
				let enemyObj = this.getEnemyFromPool();
				if (!enemyObj) return; // Pool full

				// activate and buff stats
				enemyObj.activate(pos, difficultyScale); // handle placement and reset inside activate

				// spawn SFX/vfx
				try { if (this.audio) { this.audio.synthesizeSample && this.audio.synthesizeSample('spawn'); this.audio.playSample && this.audio.playSample('spawn', { volume: 0.9, position: pos }); } } catch (_) { }
				try { const d = this._spawnDebris(pos.clone().add(new THREE.Vector3(0, 0.02, 0)), 12); setTimeout(() => { try { this.scene.remove(d.obj); d.dispose(); } catch (_) { } }, 420); } catch (_) { }

				// Apply extra buffs if needed (activate handles base, but we can override)
				const accBuff = Math.min(1.6, 1 + (difficultyScale - 1) * 0.1);
				try { enemyObj.accuracy = Math.min(0.99, (enemyObj.accuracy || 0.6) * accBuff); } catch (_) { }

				this.world.enemies.push(enemyObj);
				this._enemyMeshes = this.world.enemies.map(e => e.mesh);
				try { console.debug('[Spawn] spawned enemy (pool)', { total: this.world.enemies.length, difficultyScale }); } catch (_) { }
				// mark HUD for refresh (throttled in main loop)
				try { this.markHudDirty(); } catch (_) { }
				// lock brief window to avoid immediate chain spawns
				this._spawnLocked = true; setTimeout(() => { try { this._spawnLocked = false; } catch (_) { } }, Math.max(30, 80 - Math.floor((difficultyScale - 1) * 10)));
			} catch (e) { console.error('[Spawn] spawnEnemy error', e); }
		};

		// spawn initial allies
		game.spawnInitialAllies = function () {
			const p = this.controls.getObject().position;
			const count = 5;
			for (let i = 0; i < count; i++) {
				const pos = this.spawnPositionPoissonAround(p, 6 + i * 0.5, 12 + i * 2, 4.0, 300);
				const ally = new Ally(this.scene, pos);
				this.world.allies.push(ally);
				if (!this.scene.userData) this.scene.userData = {};
				if (!this.scene.userData._alliesList) this.scene.userData._alliesList = [];
				this.scene.userData._alliesList.push(ally);
			}
			this.markHudDirty();
			try { this.flushHudIfDirty && this.flushHudIfDirty(); } catch (_) { }
		};

		// spawn single ally
		game.spawnAlly = function () {
			const p = this.controls.getObject().position;
			const pos = this.spawnPositionPoissonAround(p, 3.0, 8.0, 3.0, 200);
			const ally = new Ally(this.scene, pos);
			this.world.allies.push(ally);
			if (!this.scene.userData) this.scene.userData = {};
			if (!this.scene.userData._alliesList) this.scene.userData._alliesList = [];
			this.scene.userData._alliesList.push(ally);
			this.markHudDirty();
		};

		// remove ally and schedule respawn
		game.removeAlly = function (ally) {
			ally.dispose(this.scene);
			this.world.allies = this.world.allies.filter(a => a !== ally);
			try { if (this.scene.userData && this.scene.userData._alliesList) this.scene.userData._alliesList = this.scene.userData._alliesList.filter(a => a !== ally); } catch (_) { }
			this.markHudDirty();
			setTimeout(() => this.spawnAllyWithEmerge(), 1600);
		};

		// emergent spawn with VFX
		game.spawnAllyWithEmerge = function () {
			const p = this.controls.getObject().position;
			let pos = null;
			for (let attempt = 0; attempt < 14; attempt++) {
				const cand = new THREE.Vector3(p.x + (Math.random() - 0.5) * 12, 0, p.z + (Math.random() - 0.5) * 12);
				let tooClose = false;
				for (const a of this.world.allies) { if (a.mesh && a.mesh.position.distanceTo(cand) < 3.5) { tooClose = true; break; } }
				if (!tooClose) { pos = cand; break; }
			}
			if (!pos) pos = new THREE.Vector3(p.x + (Math.random() - 0.5) * 10, 0, p.z + (Math.random() - 0.5) * 10);
			const ringGeo = new THREE.RingGeometry(0.2, 0.25, 32);
			const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
			const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, 0.02, pos.z);
			this.scene.add(ring);
			const dust = this._spawnDebris(new THREE.Vector3(pos.x, 0.05, pos.z), 30);
			try { this.audio.summon(); } catch (_) { }
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
			setTimeout(() => {
				const ally = new Ally(this.scene, pos);
				this.world.allies.push(ally);
				// also add to cache
				if (!this.scene.userData) this.scene.userData = {};
				if (!this.scene.userData._alliesList) this.scene.userData._alliesList = [];
				this.scene.userData._alliesList.push(ally);
				if (ally.mesh) { ally.mesh.position.y = -0.5; let k = 0; const rise = () => { if (k >= 1) return; k += 0.06; ally.mesh.position.y = THREE.MathUtils.lerp(-0.5, 1, k); requestAnimationFrame(rise); }; rise(); }
				this.markHudDirty();
				setTimeout(() => { this.scene.remove(beacon); this.scene.remove(beacon.target); }, 600);
			}, 180);
		};

		// removeEnemy: dispose enemy and update caches
		game.removeEnemy = function (enemy) {
			try {
				// Don't dispose geometry, just disable pool object
				if (enemy.disable) enemy.disable();
				else enemy.dispose(this.scene); // fallback
			} catch (e) { console.warn('[RemoveEnemy] disable failed', e); }

			this.world.enemies = this.world.enemies.filter(e => e !== enemy);
			this._enemyMeshes = this.world.enemies.map(e => e.mesh);
			console.debug('[RemoveEnemy] removed', { remaining: this.world.enemies.length });
			try { this.markHudDirty(); } catch (_) { }
			// play death SFX and explosion VFX
			try { if (this.audio) { this.audio.synthesizeSample && this.audio.synthesizeSample('death'); this.audio.playSample && this.audio.playSample('death', { volume: 0.9, position: enemy.mesh.position }); } } catch (_) { }
			try { const debris = this._spawnDebris(enemy.mesh.position.clone(), 26); setTimeout(() => { try { this.scene.remove(debris.obj); debris.dispose(); } catch (_) { } }, 600); } catch (_) { }
		};

	} catch (_) { }
}