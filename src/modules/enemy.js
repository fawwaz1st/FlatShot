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
		// UNIFIED VISUALS (Match MenuBot)
		const group = new THREE.Group();
		const role = (Math.random() < 0.3) ? 'SNIPER' : ((Math.random() < 0.5) ? 'ASSAULT' : 'FLANKER');
		this.role = role;
		const color = (Math.random() < 0.5) ? 0x00f0ff : 0xff3366; // Random team or assigned later?
		// Note: Enemy typically has fixed team/color in game mode? 
		// For now default to Red-ish for enemy if not specified, 
		// IF 'team' is passed in activate, we should update color there.
		// For createMesh, we build geometry. 

		const bodyH = role === 'SNIPER' ? 1.0 : (role === 'ASSAULT' ? 1.3 : 1.2);
		const bodyW = role === 'ASSAULT' ? 0.7 : 0.6;

		// 1. Body
		const body = new THREE.Mesh(
			new THREE.CapsuleGeometry(bodyW * 0.5, bodyH, 4, 8),
			new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.6 })
		);
		body.position.y = bodyH * 0.8;
		group.add(body);
		group.userData._body = body; // ref for color update

		// 2. Armor
		const vest = new THREE.Mesh(
			new THREE.BoxGeometry(bodyW * 1.1, bodyH * 0.5, bodyW * 1.1),
			new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 })
		);
		vest.position.y = 0.2;
		body.add(vest);

		// 3. Eye
		const eye = new THREE.Mesh(
			new THREE.BoxGeometry(bodyW * 0.8, 0.2, 0.3),
			new THREE.MeshBasicMaterial({ color: 0xffffff })
		);
		eye.position.set(0, bodyH * 0.3, bodyW * 0.4);
		body.add(eye);

		// 4. Weapon (Simplified)
		const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
		weapon.position.set(0.4, 0, 0.5);
		body.add(weapon);

		// Marker
		try {
			const markerMat = new THREE.SpriteMaterial({ color: 0xff6b6b, depthTest: false, depthWrite: false });
			const marker = new THREE.Sprite(markerMat);
			marker.scale.set(0.6, 0.6, 0.6);
			marker.position.set(0, 2.2, 0);
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
		this.mesh.position.y = 0;

		const conf = GameConfig.enemy || {};
		this.health = (conf.baseHealth || 100) * difficultyMultiplier;
		this.speed = 4.0;
		this.state = 'IDLE';

		// AI Stats
		this.reactionTimer = 0.5; // Delay before shooting
		this.hasSeenPlayer = false;

		// Update Color check (if needed) based on game state
		// ...
	}

	update(dt, playerPos, obstacles, obstacleMeshes, opts = {}) {
		if (this._dead) return { contact: false, shoot: false, acc: 0 };

		const distToPlayer = this.mesh.position.distanceTo(playerPos);
		const hasLOS = this._hasLineOfSight(playerPos, obstacles, obstacleMeshes);

		// --- AI STATE MACHINE ---
		if (this.state === 'IDLE') {
			if (distToPlayer < 30 && hasLOS) {
				this.state = 'CHASE';
				this.reactionTimer = 0.4 + Math.random() * 0.3; // Reset reaction on first sight
			}
		}
		else if (this.state === 'CHASE') {
			if (!hasLOS) {
				// Lost sight, move to last known? For now just IDLE after delay
				if (Math.random() < 0.01) this.state = 'IDLE';
			} else {
				// Move logic
				if (distToPlayer > 10) {
					// Move towards
					const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position).normalize();
					this.mesh.position.add(dir.multiplyScalar(this.speed * dt));
					this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);
				} else {
					// Strafe?
					this.state = 'ATTACK';
				}
			}
		}
		else if (this.state === 'ATTACK') {
			this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);
			if (distToPlayer > 15) this.state = 'CHASE';
		}

		// --- SHOOTING WITH DELAY ---
		let shoot = false;
		if (hasLOS) {
			if (this.reactionTimer > 0) {
				this.reactionTimer -= dt;
			} else {
				// Ready to fire
				this.shootCooldown = (this.shootCooldown || 0.5) - dt;
				if (this.shootCooldown <= 0) {
					shoot = true;
					this.shootCooldown = 0.6 + Math.random() * 0.4;
				}
			}
		} else {
			this.reactionTimer = 0.2; // Quick reset if lost sight
		}

		// Visual Marker Update
		try { if (this.mesh.userData._marker) this.mesh.userData._marker.visible = (hasLOS && distToPlayer < 40); } catch (_) { }

		return { contact: (distToPlayer < 1.0), shoot, acc: 0.8 };
	}

	dispose(scene) {
		// Shared resources (geometry/material) are NOT disposed here because they are static
		scene.remove(this.mesh);
	}
} 