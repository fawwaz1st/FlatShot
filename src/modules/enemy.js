import * as THREE from 'three';

const BODY_COLOR = 0xf24e1e;

export class Enemy {
	constructor(scene, position) {
		this.health = 80;
		this.speed = 2.6 + Math.random();
		this.radius = 0.5;
		this.baseShootCooldown = 0.7 + Math.random() * 0.5;
		this.shootCooldown = this.baseShootCooldown;
		this.lastShoot = 0;
		this.mesh = this.createMesh();
		this.mesh.position.copy(new THREE.Vector3(position.x, 1, position.z));
		scene.add(this.mesh);
		// assign pointer untuk reverse lookup
		try { this.mesh.userData.enemy = this; } catch(_) {}
		// store marker reference for quick update each frame
		try { this._marker = this.mesh.userData && this.mesh.userData._marker ? this.mesh.userData._marker : null; } catch(_) { this._marker = null; }
		this._ray = new THREE.Raycaster();
		// AI state tambahan
		this.state = 'hunt';
		this.lastSeenPos = this.mesh.position.clone();
		this.evadeTimer = 0;
		this.strafeDir = (Math.random()<0.5?-1:1);
		this.strafeTimer = 0;
		// reuse temporary vectors untuk kurangi alokasi per-frame
		this._tmpVec = new THREE.Vector3();
		this._tmpVec2 = new THREE.Vector3();
		this._lastHasLOS = false;
		this.nextThink = 0.0; // throttle expensive logic
		this._thinkIntervalBase = 0.12; // base interval (s)
	}

	createMesh() {
		const group = new THREE.Group();
		// High-detail body (close)
		const high = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 6, 12), new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.7 }));
		high.castShadow = false;
		group.add(high);
		// Low-detail proxy (far): simple box
		const low = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), new THREE.MeshBasicMaterial({ color: BODY_COLOR }));
		low.visible = false;
		group.add(low);
		const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x330000 }));
		eye.position.set(0, 0.5, 0.35);
		group.add(eye);
		// tag untuk lookup cepat dari ray hits
		group.userData.enemy = null; // akan diisi oleh constructor setelah return
		// store refs untuk LOD toggle
		group.userData._high = high; group.userData._low = low;

		// marker sprite: simple colored billboard above head to indicate presence
		try {
			const markerMat = new THREE.SpriteMaterial({ color: 0xff6b6b, depthTest: false, depthWrite: false });
			const marker = new THREE.Sprite(markerMat);
			marker.scale.set(0.6, 0.6, 0.6);
			marker.position.set(0, 1.8, 0);
			marker.renderOrder = 9999;
			marker.material.opacity = 0.95;
			group.add(marker);
			group.userData._marker = marker;
		} catch(_) {}
		return group;
	}

	applyDamage(amount) {
		// jika sudah mati sebelumnya, jangan hitung ulang (mencegah double-counting)
		if (this._dead) return false;
		this.health -= amount;
		if (this.health <= 0) {
			this._dead = true;
			return true;
		}
		return false;
	}

	_hasLineOfSight(targetPos, obstacles, obstacleMeshesCached) {
		const from = this.mesh.position.clone();
		from.y += 0.6;
		const dir = targetPos.clone().sub(from);
		const dist = dir.length();
		dir.normalize();
		this._ray.set(from, dir);
		this._ray.far = dist;
		const blockers = obstacleMeshesCached || obstacles.map(o=>o.mesh);
		const hits = this._ray.intersectObjects(blockers, true);
		return hits.length === 0;
	}

	update(dt, playerPos, obstacles, obstacleMeshesCached, opts = {}) {
		const { grenades = [], skill = 1.0, playerMoving = false, difficultyMultiplier = 1.0 } = opts;
		// adaptasi interval berdasarkan difficulty/skill: makin sulit -> think lebih sering
		this.nextThink -= dt;
		const thinkInterval = Math.max(0.04, this._thinkIntervalBase / (0.8 + 0.5 * difficultyMultiplier + 0.4 * (skill-1)));
		const doHeavyThink = (this.nextThink <= 0);
		if (doHeavyThink) this.nextThink = thinkInterval;
		const pos = this.mesh.position;
		const target = this._tmpVec.set(playerPos.x, pos.y, playerPos.z);

		const toPlayer = this._tmpVec2.copy(target).sub(pos);
		const dist = toPlayer.length();
		if (dist > 0.0001) toPlayer.normalize();

		let avoid = this._tmpVec.clone().set(0,0,0);
		// obstacle avoidance is relatively cheap compared to raycasts; keep every frame but simple
		for (const o of obstacles) {
			const b = o.mesh.position;
			const half = o.half;
			const dx = Math.max(Math.abs(pos.x - b.x) - half.x, 0);
			const dz = Math.max(Math.abs(pos.z - b.z) - half.z, 0);
			const d = Math.hypot(dx, dz);
			if (d < this.radius + 0.6) {
				const nx = pos.x - b.x;
				const nz = pos.z - b.z;
				const len = Math.hypot(nx, nz) || 1;
				avoid.x += nx / len;
				avoid.z += nz / len;
			}
		}

		// Reaksi granat: menjauh singkat
		let nearestGrenadeD = Infinity;
		for (const g of grenades) {
			if (!g.alive || !g.mesh) continue;
			const d = g.mesh.position.distanceTo(pos);
			if (d < nearestGrenadeD) nearestGrenadeD = d;
		}
		if (nearestGrenadeD < 6) { this.evadeTimer = Math.max(this.evadeTimer, 0.5); }
		if (this.health < 30 && dist < 8) { this.evadeTimer = Math.max(this.evadeTimer, 0.4); }

		// Update LOS & last seen
		let hasLOS = this._lastHasLOS;
		if (doHeavyThink) {
			hasLOS = this._hasLineOfSight(target, obstacles, obstacleMeshesCached);
			this._lastHasLOS = hasLOS;
			if (hasLOS) this.lastSeenPos.copy(target);
		}

		// Gerak: evasion > hunt > strafe
		const dir = toPlayer.add(avoid.multiplyScalar(0.8)).normalize();
		this.strafeTimer -= dt;
		if (this.strafeTimer <= 0) { this.strafeTimer = 0.6 + Math.random()*0.7; this.strafeDir *= -1; }
		if (this.evadeTimer > 0) {
			this.evadeTimer -= dt;
			// lari menjauh dari player/granat
			const away = target.clone().sub(pos).setY(0).normalize().multiplyScalar(-1);
			pos.x += away.x * (this.speed*1.4) * dt;
			pos.z += away.z * (this.speed*1.4) * dt;
		} else if (!hasLOS && dist < 35) {
			// Investigate ke last seen
			const toLast = this._tmpVec2.copy(this.lastSeenPos).sub(pos).setY(0);
			if (toLast.lengthSq() > 0.01) {
				toLast.normalize();
				pos.x += toLast.x * this.speed * dt;
				pos.z += toLast.z * this.speed * dt;
			}
			// if low HP try to find nearby cover
			if (this.health < 45) {
				let nearestObs = null; let nd = Infinity;
				for (const o of obstacles || []) { try { const d = o.mesh.position.distanceTo(pos); if (d < nd) { nd = d; nearestObs = o; } } catch(_){} }
				if (nearestObs && nd < 18) {
					const dirToObs = nearestObs.mesh.position.clone().sub(pos).setY(0).normalize().multiplyScalar(0.85);
					pos.x += dirToObs.x * this.speed * dt * 1.2; pos.z += dirToObs.z * this.speed * dt * 1.2;
				}
			}
		} else if (dist > 6) {
			// Flanking behaviour: if somewhat close and has LOS, more aggressive flanking in groups
			const flankChance = (hasLOS && dist < 28) ? 0.18 + Math.min(0.42, (1 - (Math.min(6, obstacles.length||0) / 12))) : 0.08;
			if (hasLOS && dist < 28 && Math.random() < flankChance) {
				const right = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
				// choose side based on strafeDir
				const flankDir = right.multiplyScalar(this.strafeDir * 0.8).add(avoid.multiplyScalar(0.4)).normalize();
				pos.x += flankDir.x * this.speed * 0.9 * dt;
				pos.z += flankDir.z * this.speed * 0.9 * dt;
			} else {
				pos.x += dir.x * this.speed * dt;
				pos.z += dir.z * this.speed * dt;
			}
			// micro-coordination: if many enemies nearby, one of them will become bolder (higher fire rate)
			try {
				const nearby = (obstacles && obstacles.length) ? obstacles : this._tmpNearbyCount || 0;
				if (this._aggrTimer === undefined) this._aggrTimer = 0;
				this._aggrTimer -= dt;
				if (this._aggrTimer <= 0 && Math.random() < 0.06) { this._aggrTimer = 1.2; this.shootCooldown = Math.max(0.12, this.shootCooldown * 0.75); }
			} catch(_){}
		} else if (dist > 2.2) {
			const right = new THREE.Vector3(-dir.z, 0, dir.x);
			pos.x += right.x * this.speed * 0.6 * dt * this.strafeDir;
			pos.z += right.z * this.speed * 0.6 * dt * this.strafeDir;
		}

		this.mesh.lookAt(target);

		let didContact = dist < 1.2;
		let shoot = false; let acc = 0.6;
		// akurasi dasar dipengaruhi skill dan jarak
		const nearFactor = THREE.MathUtils.clamp((35 - dist)/35, 0, 1);
		// akurasi juga dipengaruhi oleh difficultyMultiplier
		acc = 0.35 + 0.5*nearFactor + 0.18*(skill-1) + 0.12*(difficultyMultiplier-1);
		// gerak pemain menurunkan akurasi sedikit
		if (playerMoving) acc *= 0.88;
		const now = performance.now() / 1000;
		// cooldown adaptif (sedikit lebih agresif saat dekat)
		// lebih agresif di difficulty tinggi
		this.shootCooldown = Math.max(0.18, this.baseShootCooldown - 0.25*nearFactor - 0.12*(skill-1) - 0.08*(difficultyMultiplier-1));
		if (dist >= 6 && dist <= 35 && hasLOS) {
			if (now - this.lastShoot > this.shootCooldown) {
				this.lastShoot = now;
				shoot = true;
				// peluang burst: cepatkan next shot sedikit
				if (Math.random() < 0.35) { this.lastShoot -= 0.15; }
			}
		}
		// LOD: jika jauh dari player, tampilkan low-detail untuk hemat GPU
		try {
			const lodDist = 40;
			if (this.mesh && this.mesh.userData) {
				const high = this.mesh.userData._high;
				const low = this.mesh.userData._low;
				if (high && low) {
					if (dist > lodDist) { high.visible = false; low.visible = true; }
					else { high.visible = true; low.visible = false; }
				}
			}
		} catch(_) {}
		// update marker (scale/visibility) untuk membantu pemain melihat musuh
		try {
			const m = (this.mesh && this.mesh.userData) ? this.mesh.userData._marker : null;
			if (m) {
				m.visible = true;
				// scale sedikit lebih besar saat jauh agar mudah terlihat
				const s = THREE.MathUtils.clamp(0.6 * (1 + (dist / 40)), 0.45, 1.3);
				m.scale.setScalar(s);
			}
		} catch(_) {}
		return { contact: didContact, shoot, acc };
	}

	dispose(scene) {
		scene.remove(this.mesh);
		this.mesh.traverse((obj) => {
			if (obj.geometry) obj.geometry.dispose();
			if (obj.material) {
				if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
				else obj.material.dispose();
			}
		});
	}
} 