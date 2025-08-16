import * as THREE from 'three';
import { Grenade } from '../modules/grenade.js';
import { Enemy } from '../modules/enemy.js';

export function attachWeaponController(game){
	try{
		const wc = {};

		wc.tryShoot = function(){
			const now = performance.now() / 1000;
			const baseRate = (this.player.weapon === 'pistol' ? this.player.fireRate : 1.5);
			const effRate = baseRate * (this.perks?.fireRateMult||1.0);
			const interval = 1 / effRate;
			if (now - this.player.lastShotTime < interval) return;
			if (this.player.reloading) return;
			if (this._switchAnim.active) return;
			if (this.player.weapon === 'pistol') {
				if (this.player.ammoInMag <= 0) { this.audio.click(); return; }
				this.player.lastShotTime = now;
				this.player.ammoInMag -= 1;
				try { this.markHudDirty(); } catch(_) { try { this.updateHUD(); } catch(_){} }
				this.audio.shoot();
				try { this.audio.duckBgm(0.45, 160); } catch(_) {}
				this.kickRecoil();
				this.playMuzzleFlash();
				this.spawnMuzzleLight();
				this.spawnMuzzleSmoke();
				this.ejectCasing();
				this.shake.amp = Math.min(1.2, this.shake.amp + 0.15);

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
					this.spawnImpactDecal(shotPoint);
					try { this.audio.playSample && this.audio.playSample('gunshot', { position: start, volume: 0.9 }); } catch(_) {}
				}
				if (enemy && point) {
					const head = enemy.mesh.position.clone(); head.y += 1.5;
					const isHead = point.distanceTo(head) < 0.6;
					const dmgBase = this.damageByDifficulty(28, 12);
					const dmgMult = (this.powerups.damage>0?1.5:1.0) * (this.perks?.damageMult||1.0) * (isHead?1.8:1.0);
					const dead = enemy.applyDamage(dmgBase * dmgMult);
					this.audio.hit();
					try { this.audio.playSample && this.audio.playSample('hit', { position: point, volume: 0.9 }); } catch(_) {}
					if (isHead) { try { this.audio.headshot(); } catch(_) {} this.spawnHitMarker(point); this.spawnHitSparks(point, 26, 0xffc07a); }
					else { this.spawnHitMarker(point); this.spawnHitSparks(point, 10, 0xfff1a8); }
					if (dead) {
						this.addScore(10 * (isHead?1.5:1.0));
						this.player.kills = (this.player.kills||0) + 1;
						this.onEnemyKilled();
						try { this.recordEnemyDeath(enemy); } catch(_) {}
						this.removeEnemy(enemy);
						try { this.markHudDirty(); } catch(_) { try { this.updateHUD(); } catch(_){} }
						try { if (this.waveState === 'idle') { this.spawnEnemy(); } } catch(_) {}
					}
				}
			}
		};

		wc.handleFireInputs = function(){
			if (this._switchAnim.active) return;
			if (this.player.weapon === 'pistol') {
				if (this.input.shoot) this.tryShoot();
				return;
			}
			if (this.player.weapon === 'grenade' && this.input.shootReleased) {
				if (this.player.grenades <= 0) { this.audio.click(); return; }
				const now = performance.now() / 1000;
				const interval = 1 / 1.5;
				if (now - this.player.lastShotTime < interval) return;
				this.player.lastShotTime = now;
				this.player.grenades -= 1;
				try { this.markHudDirty(); } catch(_) { try { this.updateHUD(); } catch(_){} }
				this.audio.shoot();
				this.throwGrenade();
				this.clearGrenadeTrajectory();
			}
		};

		wc.throwGrenade = function(){
			const start = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
			const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
			const initialSpeed = 16; const upBoost = 0.6;
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
					try { this.audio.playSample && this.audio.playSample('explosion', { position: center, volume: 1.0 }); } catch(_) {}
					const radius = 12.0;
					for (const e of [...this.world.enemies]) {
						const d = e.mesh.position.distanceTo(center);
						if (d < radius) {
							const base = this.damageByDifficulty(110, 40);
							const factor = Math.max(0, 1 - (d / radius));
							const dmg = base * (0.35 + 0.65 * factor);
							const dead = e.applyDamage(dmg);
							if (dead) {
								this.addScore(12);
								try { this.recordEnemyDeath(e); } catch(_) {}
								this.removeEnemy(e);
								try { if (this.waveState === 'idle') { this.spawnEnemy(); } } catch(_) { /* ignore fallback when spawn blocked */ }
							}
						}
					}
					try { this.markHudDirty(); } catch(_) { try { this.updateHUD(); } catch(_){} }
				}
			});
			this.world.grenades.push(g);
		};

		wc.spawnHitSparks = function(center, count = 8, color = 0xfff1a8){
			if (!this._pointsPool) return;
			let entry = this._pointsPool.find(x=>!x.busy);
			if (!entry) entry = this._pointsPool[0];
			const pts = entry.obj;
			const max = pts.userData._maxCount || 64;
			const arr = pts.geometry.attributes.position.array;
			let used = Math.min(count, max);
			for (let i=0;i<used;i++){
				const a = Math.random()*Math.PI*2; const r = Math.random()*0.6;
				arr[i*3+0] = center.x + Math.cos(a)*r;
				arr[i*3+1] = center.y + Math.random()*0.6;
				arr[i*3+2] = center.z + Math.sin(a)*r;
			}
			for (let i=used;i<max;i++){ arr[i*3+0]=arr[(used-1)*3+0]; arr[i*3+1]=arr[(used-1)*3+1]; arr[i*3+2]=arr[(used-1)*3+2]; }
			pts.geometry.attributes.position.needsUpdate = true;
			pts.material.color.setHex(color);
			pts.visible = true; entry.busy = true; entry.ttl = 0.25;
		};

		wc.spawnBulletSparks = function(start, end){
			if (!this._pointsPool) return;
			let entry = this._pointsPool.find(x=>!x.busy);
			if (!entry) entry = this._pointsPool[0];
			const pts = entry.obj;
			const max = pts.userData._maxCount || 64;
			const arr = pts.geometry.attributes.position.array;
			const count = Math.min(12, max);
			for (let i=0;i<count;i++){
				const t = i/(count-1);
				arr[i*3+0] = THREE.MathUtils.lerp(start.x, end.x, t) + (Math.random()-0.5)*0.02;
				arr[i*3+1] = THREE.MathUtils.lerp(start.y, end.y, t) + (Math.random()-0.5)*0.02;
				arr[i*3+2] = THREE.MathUtils.lerp(start.z, end.z, t) + (Math.random()-0.5)*0.02;
			}
			for (let i=count;i<max;i++){ arr[i*3+0]=arr[(count-1)*3+0]; arr[i*3+1]=arr[(count-1)*3+1]; arr[i*3+2]=arr[(count-1)*3+2]; }
			pts.geometry.attributes.position.needsUpdate = true;
			pts.material.color.setHex(0xfff1a8);
			pts.visible = true; entry.busy = true; entry.ttl = 0.12;
		};

		wc.spawnTracer = function(start, end, color = 0xfff1a8){
			if (!this._tracerPool) return;
			let entry = this._tracerPool.find(x=>!x.busy);
			if (!entry) entry = this._tracerPool[0];
			const line = entry.obj;
			const posAttr = line.geometry.attributes.position.array;
			const s = start.clone(); if (!s.y || s.y < 0.6) s.y = 1.6;
			posAttr[0] = s.x; posAttr[1] = s.y; posAttr[2] = s.z;
			const toVec = end ? end : (()=>{ const d=new THREE.Vector3(); this.camera.getWorldDirection(d); return start.clone().add(d.multiplyScalar(30)); })();
			const t = toVec.clone(); if (!t.y || t.y < 0.6) t.y = s.y;
			posAttr[3] = t.x; posAttr[4] = t.y; posAttr[5] = t.z;
			line.geometry.attributes.position.needsUpdate = true;
			line.material.color.setHex(color);
			line.visible = true; entry.busy = true; entry.ttl = 0.06;
			try { this.spawnTracerGlow(start, end, color, 6); } catch(_) {}
		};

		wc.spawnImpactDecal = function(point){
			if (!point) return;
			if (!this._decalPool) return;
			let entry = this._decalPool.find(x=>!x.busy);
			if (!entry) entry = this._decalPool[0];
			const mesh = entry.obj;
			mesh.position.set(point.x, point.y + 0.01, point.z);
			mesh.visible = true; entry.busy = true; entry.ttl = 0.4;
		};

		wc.spawnTracerGlow = function(start, end, color = 0xfff1a8, count = 6){
			if (!this._pointsPool) return;
			let entry = this._pointsPool.find(x=>!x.busy);
			if (!entry) entry = this._pointsPool[0];
			const pts = entry.obj;
			const max = pts.userData._maxCount || 64;
			const arr = pts.geometry.attributes.position.array;
			const used = Math.min(count, max);
			for (let i=0;i<used;i++){
				const t = i/(used-1);
				const x = THREE.MathUtils.lerp(start.x, end.x, t) + (Math.random()-0.5)*0.02;
				const y = THREE.MathUtils.lerp(start.y, end.y, t) + (Math.random()-0.5)*0.02;
				const z = THREE.MathUtils.lerp(start.z, end.z, t) + (Math.random()-0.5)*0.02;
				arr[i*3+0] = x; arr[i*3+1] = y; arr[i*3+2] = z;
			}
			for (let i=used;i<max;i++){ arr[i*3+0]=arr[(used-1)*3+0]; arr[i*3+1]=arr[(used-1)*3+1]; arr[i*3+2]=arr[(used-1)*3+2]; }
			pts.geometry.attributes.position.needsUpdate = true;
			pts.material.color.setHex(color);
			pts.visible = true; entry.busy = true; entry.ttl = 0.12;
		};

		wc.spawnHitMarker = function(point){
			const g = new THREE.SphereGeometry(0.05, 8, 8);
			const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
			const s = new THREE.Mesh(g, m);
			s.position.copy(point);
			this.scene.add(s);
			setTimeout(() => this.scene.remove(s), 120);
		};

		wc.playMuzzleFlash = function(){
			if (!this.weapon) return;
			this.weapon.flash.visible = true;
			try { this.flashBloom(0.9, 0.12); } catch(_) {}
			try {
				const pos = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
				this.spawnHitSparks(pos, 8, 0xfff1a8);
			} catch(_) {}
			setTimeout(() => { if (this.weapon) this.weapon.flash.visible = false; }, 40);
		};

		wc.kickRecoil = function(){
			if (!this.weapon) return;
			this.weapon.recoilX += 0.08;
			this.weapon.recoilY += (Math.random() - 0.5) * 0.02;
			this.weapon.recoilZ += 0.02;
		};

		wc.ejectCasing = function(){
			if (!this._casingPool) return;
			let entry = this._casingPool.find(x=>!x.busy);
			if (!entry) entry = this._casingPool[0];
			const mesh = entry.obj;
			const origin = this.weapon.group.localToWorld(new THREE.Vector3(-0.06, -0.02, -0.1));
			mesh.position.copy(origin); mesh.visible = true;
			entry.busy = true; entry.ttl = 0.6;
			entry.vel.set(-0.5 + Math.random()*-0.6, 0.8 + Math.random()*0.5, -0.2 + Math.random()*0.4);
			entry.rotSpeed.set(0.2 + Math.random()*0.3, 0.2 + Math.random()*0.4, 0.1 + Math.random()*0.3);
		};

		wc.spawnMuzzleLight = function(){
			try { if (this._activeMuzzleLight) { this.scene.remove(this._activeMuzzleLight); this._activeMuzzleLight = null; } } catch(_) {}
			const light = new THREE.PointLight(0xfff1a8, 2.2, 6);
			light.position.copy(this.weapon.muzzle.getWorldPosition(new THREE.Vector3()));
			this.scene.add(light); this._activeMuzzleLight = light;
			try {
				const tex = this._getSmokeTexture();
				const mat = new THREE.SpriteMaterial({ map: tex, color: 0xfff1a8, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false });
				const spr = new THREE.Sprite(mat);
				spr.scale.set(0.28, 0.28, 1);
				spr.position.copy(light.position);
				this.scene.add(spr);
				setTimeout(()=>{ try{ this.scene.remove(spr); mat.dispose(); }catch(_){} }, 90);
			} catch(_) {}
			setTimeout(()=>{ try{ this.scene.remove(light); if (this._activeMuzzleLight===light) this._activeMuzzleLight=null; }catch(_){} }, 60);
		};

		wc.spawnMuzzleSmoke = function(){
			const tex = this._getSmokeTexture();
			const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
			const spr = new THREE.Sprite(mat);
			spr.scale.set(0.6, 0.6, 1);
			spr.position.copy(this.weapon.muzzle.getWorldPosition(new THREE.Vector3()));
			this.scene.add(spr);
			let t=0; const tick=()=>{
				if (t>1){ this.scene.remove(spr); mat.dispose(); return; }
				spr.material.opacity = 0.55 * (1 - t);
				spr.scale.setScalar(THREE.MathUtils.lerp(0.6, 2.0, t));
				spr.position.y += 0.002;
				t+=0.08; requestAnimationFrame(tick);
			}; tick();
		};

		// attach to game
		game._weaponController = wc;
		// also bind methods directly for compatibility
		game.tryShoot = wc.tryShoot.bind(game);
		game.handleFireInputs = wc.handleFireInputs.bind(game);
		game.throwGrenade = wc.throwGrenade.bind(game);
		game.spawnHitSparks = wc.spawnHitSparks.bind(game);
		game.spawnBulletSparks = wc.spawnBulletSparks.bind(game);
		game.spawnTracer = wc.spawnTracer.bind(game);
		game.spawnImpactDecal = wc.spawnImpactDecal.bind(game);
		game.spawnTracerGlow = wc.spawnTracerGlow.bind(game);
		game.spawnHitMarker = wc.spawnHitMarker.bind(game);
		game.playMuzzleFlash = wc.playMuzzleFlash.bind(game);
		game.kickRecoil = wc.kickRecoil.bind(game);
		game.ejectCasing = wc.ejectCasing.bind(game);
		game.spawnMuzzleLight = wc.spawnMuzzleLight.bind(game);
		game.spawnMuzzleSmoke = wc.spawnMuzzleSmoke.bind(game);

	} catch(e){ console.error('[WeaponController] attach error', e); }
} 