import * as THREE from 'three';
import { Enemy } from './enemy.js';

export default class Commander extends Enemy {
	constructor(scene, position) {
		super(scene, position);
		this.isCommander = true;
		// buffed stats
		this.health = 320;
		this.speed = 1.6; // slower but more tactical
		this.baseShootCooldown = Math.max(0.36, (this.baseShootCooldown||0.6) - 0.18);
		this.shootCooldown = this.baseShootCooldown;
		// mark visually: warmer color + small banner
		try {
			this.mesh.traverse((m) => {
				if (m.material) {
					try { if (m.material.color) m.material.color.setHex(0xffd166); } catch(_){}
				}
			});
			// add commander badge above head
			const badgeGeom = new THREE.CircleGeometry(0.18, 12);
			const badgeMat = new THREE.MeshBasicMaterial({ color: 0xff8a00 });
			const badge = new THREE.Mesh(badgeGeom, badgeMat);
			badge.rotation.x = -Math.PI/2; badge.position.set(0, 2.05, 0);
			this.mesh.add(badge);
		} catch(_) {}
	}

	// override update to be slightly more tactical: prefer ranged cover & occasional order
	update(dt, playerPos, obstacles, obstacleMeshesCached, opts = {}) {
		const out = super.update(dt, playerPos, obstacles, obstacleMeshesCached, opts);
		try {
			// Commander issues simple orders occasionally: make nearby enemies aggressive
			if (Math.random() < 0.002) {
				try {
					const scene = this.mesh && this.mesh.parent;
					if (scene && scene.userData && scene.userData._gameInstance) {
						const game = scene.userData._gameInstance;
						for (const e of (game.world.enemies||[])) {
							if (e !== this && e.mesh && e.mesh.position.distanceTo(this.mesh.position) < 30) {
								try { e.state = 'engage'; e.targetEnemy = null; e.nextThink = 0.04; } catch(_){}
							}
						}
					}
				} catch(_){}
			}
		} catch(_){}
		return out;
	}
} 