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
		this._ray = new THREE.Raycaster();
		// AI state tambahan
		this.state = 'hunt';
		this.lastSeenPos = this.mesh.position.clone();
		this.evadeTimer = 0;
		this.strafeDir = (Math.random()<0.5?-1:1);
		this.strafeTimer = 0;
	}

	createMesh() {
		const group = new THREE.Group();
		const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 6, 12), new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.7 }));
		body.castShadow = false;
		group.add(body);
		const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x330000 }));
		eye.position.set(0, 0.5, 0.35);
		group.add(eye);
		return group;
	}

	applyDamage(amount) {
		this.health -= amount;
		return this.health <= 0;
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
		const { grenades = [], skill = 1.0, playerMoving = false } = opts;
		const pos = this.mesh.position;
		const target = new THREE.Vector3(playerPos.x, pos.y, playerPos.z);

		const toPlayer = target.clone().sub(pos);
		const dist = toPlayer.length();
		if (dist > 0.0001) toPlayer.normalize();

		const avoid = new THREE.Vector3();
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
		const hasLOS = this._hasLineOfSight(target, obstacles, obstacleMeshesCached);
		if (hasLOS) this.lastSeenPos.copy(target);

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
			const toLast = this.lastSeenPos.clone().sub(pos).setY(0);
			if (toLast.lengthSq() > 0.01) {
				toLast.normalize();
				pos.x += toLast.x * this.speed * dt;
				pos.z += toLast.z * this.speed * dt;
			}
		} else if (dist > 6) {
			pos.x += dir.x * this.speed * dt;
			pos.z += dir.z * this.speed * dt;
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
		acc = 0.35 + 0.5*nearFactor + 0.15*(skill-1);
		// gerak pemain menurunkan akurasi sedikit
		if (playerMoving) acc *= 0.88;
		const now = performance.now() / 1000;
		// cooldown adaptif (sedikit lebih agresif saat dekat)
		this.shootCooldown = Math.max(0.25, this.baseShootCooldown - 0.2*nearFactor - 0.1*(skill-1));
		if (dist >= 6 && dist <= 35 && hasLOS) {
			if (now - this.lastShoot > this.shootCooldown) {
				this.lastShoot = now;
				shoot = true;
				// peluang burst: cepatkan next shot sedikit
				if (Math.random() < 0.35) { this.lastShoot -= 0.15; }
			}
		}
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