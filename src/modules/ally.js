import * as THREE from 'three';

const ALLY_COLOR = 0x38bdf8;

export class Ally {
	constructor(scene, position) {
		this.health = 100;
		this.speed = 3.2 + Math.random() * 0.6;
		this.radius = 0.5;
		this.baseShootCooldown = 0.6 + Math.random() * 0.4;
		this.shootCooldown = this.baseShootCooldown;
		this.lastShoot = 0;
		this.state = 'patrol';
		this.targetEnemy = null;
		this.waypoint = position.clone();
		this.nextThink = 0;
		this.mesh = this.createMesh();
		this.mesh.position.copy(new THREE.Vector3(position.x, 1, position.z));
		scene.add(this.mesh);
		this.coverTimer = 0;
		this.strafeTimer = 0;
	}

	createMesh() {
		const group = new THREE.Group();
		const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 6, 12), new THREE.MeshStandardMaterial({ color: ALLY_COLOR, roughness: 0.6 }));
		group.add(body);
		const visor = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x001133 }));
		visor.position.set(0, 0.5, 0.35);
		group.add(visor);
		return group;
	}

	chooseWaypoint(center, radiusMin = 6, radiusMax = 18) {
		const r = radiusMin + Math.random() * (radiusMax - radiusMin);
		const a = Math.random() * Math.PI * 2;
		return new THREE.Vector3(center.x + Math.cos(a) * r, 1, center.z + Math.sin(a) * r);
	}

	think(context) {
		const { playerPos, enemies, pickups, grenades = [] } = context;
		// Regroup jika terlalu jauh dari player
		const distToPlayer = this.mesh.position.distanceTo(playerPos);
		if (distToPlayer > 35) {
			this.state = 'regroup';
			this.waypoint = this.chooseWaypoint(playerPos, 3, 6);
			this.targetEnemy = null;
			this.nextThink = 0.8 + Math.random() * 0.6;
			return;
		}

		// Retreat jika sekarat dan ada musuh dekat
		let nearestEnemy = null, nd = Infinity;
		for (const e of enemies) {
			const d = e.mesh.position.distanceTo(this.mesh.position);
			if (d < nd) { nd = d; nearestEnemy = e; }
		}
		if (this.health < 35 && nearestEnemy && nd < 8) {
			this.state = 'retreat';
			const away = this.mesh.position.clone().sub(nearestEnemy.mesh.position).setY(0).normalize().multiplyScalar(10);
			this.waypoint = this.mesh.position.clone().add(away);
			this.targetEnemy = nearestEnemy;
			this.nextThink = 0.6 + Math.random() * 0.4;
			return;
		}

		// Evade granat bila dekat
		for (const g of grenades) {
			if (!g.alive || !g.mesh) continue;
			const d = g.mesh.position.distanceTo(this.mesh.position);
			if (d < 6) { this.state = 'evade'; const away = this.mesh.position.clone().sub(g.mesh.position).setY(0).normalize().multiplyScalar(8); this.waypoint = this.mesh.position.clone().add(away); this.nextThink = 0.4 + Math.random()*0.3; return; }
		}

		// Engage jika ada musuh dalam jarak 25
		if (nearestEnemy && nd < 25) {
			this.state = 'engage';
			this.targetEnemy = nearestEnemy;
			this.nextThink = 0.5 + Math.random() * 0.4;
			return;
		}

		// Jika tidak ada musuh dekat, 30% kesempatan cari ammo
		if (pickups.length > 0 && Math.random() < 0.3) {
			let nearestPickup = null, pd = Infinity;
			for (const p of pickups) {
				const d = p.mesh.position.distanceTo(this.mesh.position);
				if (d < pd) { pd = d; nearestPickup = p; }
			}
			if (nearestPickup) {
				this.state = 'seekAmmo';
				this.waypoint = nearestPickup.mesh.position.clone();
				this.targetEnemy = null;
				this.nextThink = 1.0 + Math.random() * 0.6;
				return;
			}
		}

		// Patrol default
		this.state = 'patrol';
		this.waypoint = this.chooseWaypoint(playerPos, 8, 20);
		this.targetEnemy = null;
		this.nextThink = 1.2 + Math.random() * 0.8;
	}

	moveTowards(target, dt) {
		const pos = this.mesh.position;
		const dir = target.clone().setY(pos.y).sub(pos);
		if (dir.lengthSq() > 0.0001) dir.normalize();
		pos.x += dir.x * this.speed * dt;
		pos.z += dir.z * this.speed * dt;
	}

	update(dt, context) {
		const { playerPos, enemies, obstacles, pickups, grenades = [] } = context;

		this.nextThink -= dt;
		if (this.nextThink <= 0) this.think({ playerPos, enemies, pickups, grenades });

		let shoot = false;
		let target = null;

		if (this.state === 'engage' && this.targetEnemy) {
			const epos = this.targetEnemy.mesh.position.clone();
			const dist = epos.distanceTo(this.mesh.position);
			// Bergerak mendekat jika terlalu jauh, strafe jika dekat
			if (dist > 10) {
				this.moveTowards(epos, dt);
			} else if (dist > 4) {
				// strafe
				const toEnemy = epos.clone().sub(this.mesh.position).setY(0).normalize();
				const right = new THREE.Vector3(-toEnemy.z, 0, toEnemy.x);
				const side = (Math.random() < 0.5 ? 1 : -1);
				const strafe = right.multiplyScalar(side * this.speed * 0.6 * dt);
				this.mesh.position.add(strafe);
			}
			// cover sederhana: sesekali offset ke sisi obstacle terdekat
			this.coverTimer -= dt;
			if (this.coverTimer <= 0) {
				let nearest = null, ndc = Infinity;
				for (const o of obstacles){ const d = o.mesh.position.distanceTo(this.mesh.position); if (d < ndc) { ndc = d; nearest = o; } }
				if (nearest && ndc < 4) {
					const toObs = nearest.mesh.position.clone().sub(this.mesh.position).setY(0).normalize();
					const side = new THREE.Vector3(-toObs.z, 0, toObs.x).multiplyScalar(1.2);
					this.mesh.position.add(side.multiplyScalar(0.5));
				}
				this.coverTimer = 0.9 + Math.random()*0.7;
			}
			this.mesh.lookAt(new THREE.Vector3(epos.x, this.mesh.position.y, epos.z));
			// Tembak dengan cooldown adaptif
			const now = performance.now() / 1000;
			// adaptasi cooldown & probabilitas berdasarkan jarak dan health
			const nearFactor = THREE.MathUtils.clamp((25 - dist)/25, 0, 1);
			this.shootCooldown = Math.max(0.3, this.baseShootCooldown - 0.2*nearFactor);
			if (now - this.lastShoot > this.shootCooldown) {
				this.lastShoot = now;
				shoot = true;
				target = this.targetEnemy;
			}
		} else if (this.state === 'seekAmmo') {
			this.moveTowards(this.waypoint, dt);
		} else if (this.state === 'retreat' || this.state === 'regroup' || this.state === 'patrol' || this.state === 'evade') {
			this.moveTowards(this.waypoint, dt);
		}

		return { shoot, target };
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