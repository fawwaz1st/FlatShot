import * as THREE from 'three';

export class AmmoPickup {
	constructor(scene, position, type = 'pistol') {
		this.type = type; // 'pistol' | 'grenade' | 'health'
		this.mesh = this.createMesh(type);
		this.mesh.position.copy(position.clone().setY(0.5));
		this.amount = type === 'grenade' ? (1 + Math.floor(Math.random() * 1)) : (type === 'health' ? (15 + Math.floor(Math.random()*20)) : (20 + Math.floor(Math.random() * 25)));
		this.alive = true;
		scene.add(this.mesh);
	}

	createMesh(type) {
		const color = (type === 'grenade') ? 0x9ae66e : (type === 'health' ? 0xff6b6b : 0x30cfd0);
		const emiss = (type === 'grenade') ? 0x0e2b0a : (type === 'health' ? 0x451515 : 0x0b2b3b);
		const g = new THREE.BoxGeometry(0.5, 0.5, 0.5);
		const m = new THREE.MeshStandardMaterial({ color, emissive: emiss, emissiveIntensity: 0.8, metalness: 0.4, roughness: 0.2 });
		const mesh = new THREE.Mesh(g, m);
		const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x0f1b26 }));
		base.position.y = -0.3;
		mesh.add(base);
		// Billboard icon
		const iconGeo = new THREE.PlaneGeometry(0.18, 0.18);
		const iconMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
		const icon = new THREE.Mesh(iconGeo, iconMat);
		icon.position.y = 0.5;
		icon.rotateY(Math.PI/4);
		mesh.add(icon);
		return mesh;
	}

	update(dt) {
		if (!this.alive) return;
		this.mesh.rotation.y += dt * 1.2;
		this.mesh.position.y = 0.5 + Math.sin(performance.now() * 0.004) * 0.06;
	}

	dispose(scene) {
		if (!this.alive) return;
		this.alive = false;
		scene.remove(this.mesh);
		this.mesh.traverse((o) => {
			if (o.geometry) o.geometry.dispose();
			if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); }
		});
	}
}

export class SkillPickup {
	constructor(scene, position, { tier = 'C', key = 'sprinter', color = 0x30cfd0 } = {}) {
		this.isSkill = true;
		this.tier = tier; // 'C' | 'B' | 'A'
		this.key = key;
		this.mesh = this.createMesh(color);
		this.mesh.position.copy(position.clone().setY(0.6));
		this.alive = true;
		scene.add(this.mesh);
	}

	createMesh(color) {
		const group = new THREE.Group();
		const bodyMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.6, transparent: true, opacity: 0.85 });
		// hexagon prism
		const hex = new THREE.CylinderGeometry(0.35, 0.35, 0.12, 6);
		const mesh = new THREE.Mesh(hex, bodyMat);
		group.add(mesh);
		// floating badge plane
		const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
		plane.position.set(0, 0.32, 0);
		group.add(plane);
		return group;
	}

	update(dt) {
		if (!this.alive) return;
		this.mesh.rotation.y += dt * 1.4;
		this.mesh.position.y = 0.6 + Math.sin(performance.now() * 0.004) * 0.08;
	}

	dispose(scene) {
		if (!this.alive) return;
		this.alive = false;
		scene.remove(this.mesh);
		this.mesh.traverse((o) => {
			if (o.geometry) o.geometry.dispose();
			if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); }
		});
	}
} 