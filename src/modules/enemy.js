import * as THREE from 'three';
import { GameConfig } from '../game/config.js';

const BODY_COLOR = 0xf24e1e;

// Shared Resources (Static)
const SharedGeo = {
	capsule: new THREE.CapsuleGeometry(0.35, 0.8, 6, 12),
	box: new THREE.BoxGeometry(0.6, 1.2, 0.6),
	eye: new THREE.SphereGeometry(0.12, 8, 8)
};
const SharedMat = {
	body: new THREE.MeshStandardMaterial({
		color: 0x220000,
		roughness: 0.2,
		metalness: 0.8,
		emissive: 0xff0044,
		emissiveIntensity: 0.6
	}),
	proxy: new THREE.MeshBasicMaterial({ color: 0xff0044, wireframe: true }),
	eye: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.0 })
};

export class Enemy {
	constructor(scene) {
		this.mesh = this.createMesh();
		// Move initial placement to activate()
		this.mesh.visible = false;
		scene.add(this.mesh);

		try { this.mesh.userData.enemy = this; } catch (_) { }
		try { this._marker = this.mesh.userData._marker || null; } catch (_) { }

		this._ray = new THREE.Raycaster();
		this._tmpVec = new THREE.Vector3();
		this._tmpVec2 = new THREE.Vector3();

		// State
		this.active = false;
		this._dead = true;
	}

	createMesh() {
		const group = new THREE.Group();
		// High-detail
		const high = new THREE.Mesh(SharedGeo.capsule, SharedMat.body);
		high.castShadow = false;
		group.add(high);
		// Low-detail
		const low = new THREE.Mesh(SharedGeo.box, SharedMat.proxy);
		low.visible = false;
		group.add(low);
		// Eye
		const eye = new THREE.Mesh(SharedGeo.eye, SharedMat.eye);
		eye.position.set(0, 0.5, 0.35);
		group.add(eye);

		group.userData._high = high; group.userData._low = low;

		// Marker
		try {
			const markerMat = new THREE.SpriteMaterial({ color: 0xff6b6b, depthTest: false, depthWrite: false });
			const marker = new THREE.Sprite(markerMat);
			marker.scale.set(0.6, 0.6, 0.6);
			marker.position.set(0, 1.8, 0);
			marker.renderOrder = 9999;
			marker.material.opacity = 0.95;
			group.add(marker);
			group.userData._marker = marker;
		} catch (_) { }
		return group;
	}

	activate(position, difficultyMultiplier = 1.0) {
		this.active = true;
		this._dead = false;
		this.mesh.visible = true;
		this.mesh.position.copy(position);
		this.mesh.position.y = 1;

		// Reset stats based on config
		const conf = GameConfig.enemy || {};
		this.health = (conf.baseHealth || 80) * difficultyMultiplier;
		this.speed = ((conf.baseSpeed || 2.6) + Math.random()) * (1.0 + (difficultyMultiplier - 1) * 0.1);
		this.radius = 0.5;
		this.baseShootCooldown = 0.7 + Math.random() * 0.5;
		this.shootCooldown = this.baseShootCooldown;
		this.lastShoot = 0;

		this.state = 'hunt';
		this.lastSeenPos = this.mesh.position.clone();
		this.evadeTimer = 0;
		this.strafeDir = (Math.random() < 0.5 ? -1 : 1);
		this.strafeTimer = 0;
		this._lastHasLOS = false;
		this.nextThink = 0.0;
		this._thinkIntervalBase = 0.12;
	}

	disable() {
		this.active = false;
		this._dead = true;
		this.mesh.visible = false;
		this.mesh.position.set(0, -100, 0); // Hide far away
	}

	applyDamage(amount) {
		if (this._dead || !this.active) return false;
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
		// use cached collision meshes
		const blockers = obstacleMeshesCached || obstacles.map(o => o.mesh);
		const hits = this._ray.intersectObjects(blockers, true);
		return hits.length === 0;
	}

	update(dt, playerPos, obstacles, obstacleMeshes, opts = {}) {
		if (this._dead) return { contact: false, shoot: false, acc: 0 };

		// Config/Opts
		const { grenades = [], skill = 1.0, playerMoving = false, difficultyMultiplier = 1.0, spatialHash, playerVelocity } = opts;

		// 1. Perception & Prediction (Leading Shot)
		// Assume bullet speed ~ 100 or immediate? If hitscan, leading is weird, but we simulate 'tracking'.
		// Let's assume a virtual delay for realism.
		const distToPlayer = this.mesh.position.distanceTo(playerPos);
		const leadTime = distToPlayer / 60; // arbitrary speed
		const predictedPos = playerPos.clone();
		if (playerVelocity) {
			predictedPos.add(playerVelocity.clone().multiplyScalar(leadTime));
		}

		// Use spatial hash if available
		const collisionCandidates = (spatialHash) ? spatialHash.query(this.mesh.position, 4.0) : obstacles;

		// 2. State Decision (Behavior Tree Lite)
		// States: 'hunt', 'cover', 'flank', 'evade'

		// Check health for Cover
		if (this.health < 30 && distToPlayer < 20) {
			this.state = 'cover';
		} else if (distToPlayer < 8 && this.state !== 'cover') {
			this.state = 'evade'; // Too close
		} else if (distToPlayer > 15 && this._hasLineOfSight(playerPos, obstacles, obstacleMeshes)) {
			// Occasionally flank
			if (Math.random() < 0.01) this.state = 'flank';
			else if (this.state !== 'flank') this.state = 'hunt';
		} else {
			if (this.state === 'evade' && distToPlayer > 12) this.state = 'hunt'; // Reset evade
		}

		// Collision
		const nextPos = this.mesh.position.clone().add(this.velocity.clone().multiplyScalar(dt));

		// Simple collision against obstacles
		for (const o of collisionCandidates) {
			if (o.type === 'road') continue;
			const dx = Math.abs(nextPos.x - o.mesh.position.x) - o.half.x - 0.4;
			const dz = Math.abs(nextPos.z - o.mesh.position.z) - o.half.z - 0.4;
			if (dx < 0 && dz < 0) {
				if (dx > dz) nextPos.x -= (nextPos.x > o.mesh.position.x ? dx : -dx);
				else nextPos.z -= (nextPos.z > o.mesh.position.z ? dz : -dz);
			}
		}
		this.mesh.position.copy(nextPos);

		// Movement Logic based on State
		const moveDir = new THREE.Vector3();

		if (this.state === 'cover') {
			// Find Cover (Object between me and player)
			// Or rather, Object where Player - Object - Me
			// Simplest: Find nearest obstacle, hide behind it relative to player
			let bestCover = null;
			let bestDist = Infinity;

			for (const o of collisionCandidates) {
				if (o.type === 'road' || o.type === 'floor') continue;
				const d = this.mesh.position.distanceTo(o.mesh.position);
				if (d < bestDist && d > 2) { // Don't pick one I'm standing IN 
					const dirToCover = o.mesh.position.clone().sub(playerPos).normalize();
					const coverPos = o.mesh.position.clone().add(dirToCover.multiplyScalar(o.half.x + 1.5)); // Crude
					// Check if coverPos is reachable/safe? 
					bestDist = d;
					bestCover = coverPos;
				}
			}

			if (bestCover) {
				moveDir.copy(bestCover.sub(this.mesh.position)).normalize();
			} else {
				// Panic, run away
				moveDir.copy(this.mesh.position.clone().sub(playerPos).normalize());
			}
		}
		else if (this.state === 'flank') {
			// Move perpendicular
			const toP = playerPos.clone().sub(this.mesh.position).normalize();
			moveDir.set(-toP.z, 0, toP.x); // Right
			if (this.strafeDir < 0) moveDir.negate();
			// Add slight forward
			moveDir.add(toP.multiplyScalar(0.3)).normalize();
		}
		else if (this.state === 'evade') {
			// Run away
			moveDir.copy(this.mesh.position.clone().sub(playerPos).normalize());
		}
		else {
			// Hunt / Default
			moveDir.copy(predictedPos.clone().sub(this.mesh.position).normalize());
			// Stop if too close (maintain engagement distance)
			if (distToPlayer < 10) moveDir.multiplyScalar(0.0); // Stand ground/strafe
		}

		// Apply obstacle avoidance (Steering)
		const avoid = new THREE.Vector3();
		let neighborCount = 0;
		for (const o of collisionCandidates) {
			const d = this.mesh.position.distanceTo(o.mesh.position);
			const safeR = Math.max(o.half.x, o.half.z) + 0.8;
			if (d < safeR) {
				const push = this.mesh.position.clone().sub(o.mesh.position).normalize();
				avoid.add(push);
				neighborCount++;
			}
		}
		if (neighborCount > 0) moveDir.add(avoid.normalize().multiplyScalar(1.5)).normalize();

		// Apply Movement
		this.mesh.position.x += moveDir.x * this.speed * dt;
		this.mesh.position.z += moveDir.z * this.speed * dt;


		// Logic Update (Think)
		this.nextThink -= dt;
		const thinkInterval = Math.max(0.04, this._thinkIntervalBase / (0.8 + 0.5 * difficultyMultiplier + 0.4 * (skill - 1)));
		const doHeavyThink = (this.nextThink <= 0);
		if (doHeavyThink) this.nextThink = thinkInterval;

		let hasLOS = this._lastHasLOS;
		if (doHeavyThink) {
			hasLOS = this._hasLineOfSight(playerPos, obstacles, obstacleMeshes);
			this._lastHasLOS = hasLOS;
			if (hasLOS) this.lastSeenPos.copy(playerPos);
		}

		// Strafe Logic (Randomize when hunting)
		this.strafeTimer -= dt;
		if (this.strafeTimer <= 0) {
			this.strafeTimer = 0.5 + Math.random() * 1.5;
			this.strafeDir *= -1;
		}
		if (this.state === 'hunt' && distToPlayer < 25 && hasLOS) {
			// Strafe perpendicular
			const toP = playerPos.clone().sub(this.mesh.position).normalize();
			const right = new THREE.Vector3(-toP.z, 0, toP.x).multiplyScalar(this.strafeDir);
			this.mesh.position.add(right.multiplyScalar(this.speed * 0.6 * dt));
		}

		// Look At Predicted Position (Smart Aim)
		this.mesh.lookAt(predictedPos);

		// Shooting Logic
		let didContact = distToPlayer < 1.2;
		let shoot = false;

		// Accuracy Calculation (Decreases with distance, improved by skill)
		// Error Margin: 0 = perfect, 1 = terrible
		// Base error 0.1, + distance/100, - skill effect
		const baseAcc = 0.95 + (skill * 0.05); // High skill = better base
		let acc = baseAcc - (distToPlayer * 0.015) + (difficultyMultiplier * 0.05);
		acc = THREE.MathUtils.clamp(acc, 0.2, 0.98);
		if (playerMoving) acc *= 0.9; // Harder to hit moving target
		if (this.state === 'cover') acc *= 0.5; // Blind firing from cover?

		const now = performance.now() / 1000;
		this.shootCooldown = Math.max(0.15, this.baseShootCooldown - (skill * 0.1) - (difficultyMultiplier * 0.1));

		if (distToPlayer <= 40 && hasLOS) {
			if (now - this.lastShoot > this.shootCooldown) {
				this.lastShoot = now;
				shoot = true;
				// Burst variability
				if (Math.random() < 0.4) this.lastShoot -= 0.1;
			}
		}
		// ... (LOD and Marker logic same as before) ...
		try {
			const lodDist = 40;
			const high = this.mesh.userData._high;
			const low = this.mesh.userData._low;
			if (high && low) {
				if (distToPlayer > lodDist) { high.visible = false; low.visible = true; }
				else { high.visible = true; low.visible = false; }
			}
		} catch (_) { }

		try {
			const m = this.mesh.userData._marker;
			if (m) {
				m.visible = true;
				const s = THREE.MathUtils.clamp(0.6 * (1 + (distToPlayer / 40)), 0.45, 1.3);
				m.scale.setScalar(s);
			}
		} catch (_) { }

		return { contact: didContact, shoot, acc };
	}

	dispose(scene) {
		// Shared resources (geometry/material) are NOT disposed here because they are static
		scene.remove(this.mesh);
	}
} 