import * as THREE from 'three';

const BODY_COLOR = 0xf24e1e;

export class Enemy {
	constructor(scene, position) {
		this.health = 80;
		this.speed = 2.6 + Math.random();
		this.radius = 0.5;
		this.shootCooldown = 0.7 + Math.random() * 0.5;
		this.lastShoot = 0;
		this.mesh = this.createMesh();
		this.mesh.position.copy(new THREE.Vector3(position.x, 1, position.z));
		scene.add(this.mesh);
		this._ray = new THREE.Raycaster();
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

	update(dt, playerPos, obstacles, obstacleMeshesCached) {
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

		const dir = toPlayer.add(avoid.multiplyScalar(0.8)).normalize();
		if (dist > 6) {
			pos.x += dir.x * this.speed * dt;
			pos.z += dir.z * this.speed * dt;
		} else if (dist > 2.2) {
			// strafe mengelilingi pemain saat cukup dekat
			const right = new THREE.Vector3(-dir.z, 0, dir.x);
			const side = (Math.random() < 0.5 ? 1 : -1);
			pos.x += right.x * this.speed * 0.6 * dt * side;
			pos.z += right.z * this.speed * 0.6 * dt * side;
		}

		this.mesh.lookAt(target);

		let didContact = dist < 1.2;
		let shoot = false;
		if (dist >= 6 && dist <= 35) {
			const now = performance.now() / 1000;
			if (now - this.lastShoot > this.shootCooldown && this._hasLineOfSight(target, obstacles, obstacleMeshesCached)) {
				this.lastShoot = now;
				shoot = true;
			}
		}
		return { contact: didContact, shoot };
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