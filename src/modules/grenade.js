import * as THREE from 'three';

export class Grenade {
	constructor(scene, startPosition, initialVelocity, options = {}) {
		this.scene = scene;
		this.position = startPosition.clone();
		this.velocity = initialVelocity.clone();
		this.radius = options.radius ?? 0.12;
		this.gravity = options.gravity ?? -9.8;
		this.restitution = options.restitution ?? 0.38; // koefisien pantul
		this.friction = options.friction ?? 0.92; // gesekan horizontal saat menyentuh tanah
		this.fuse = options.fuse ?? 1.2; // detik
		this.explodeOnImpact = options.explodeOnImpact ?? true;
		this.alive = true;
		this.elapsed = 0;
		this.onExplode = options.onExplode || (()=>{});
		this.obstacles = options.obstacles || [];
		this.bounds = options.bounds ?? 120;

		this.mesh = this.createMesh();
		this.mesh.position.copy(this.position);
		scene.add(this.mesh);
	}

	createMesh(){
		const geo = new THREE.IcosahedronGeometry(this.radius, 0);
		const mat = new THREE.MeshStandardMaterial({ color: 0x9ae66e, roughness: 0.6, metalness: 0.1, emissive: 0x001a00 });
		const m = new THREE.Mesh(geo, mat);
		m.castShadow = false; m.receiveShadow = false;
		return m;
	}

	update(dt){
		if (!this.alive) return;
		this.elapsed += dt;
		// jika hanya ingin meledak saat impact, abaikan fuse
		if (!this.explodeOnImpact && this.fuse != null && this.elapsed >= this.fuse) { this.explode(); return; }

		// Integrasi sederhana
		this.velocity.y += this.gravity * dt;
		this.position.addScaledVector(this.velocity, dt);

		// Benturan lantai (y=0)
		if (this.position.y - this.radius <= 0) {
			this.position.y = this.radius;
			if (this.explodeOnImpact) { this.explode(); return; }
			if (Math.abs(this.velocity.y) > 1.2) {
				this.velocity.y = -this.velocity.y * this.restitution;
			} else {
				// berhenti vertikal kecil, gesekan horizontal
				this.velocity.y = 0;
				this.velocity.x *= this.friction;
				this.velocity.z *= this.friction;
			}
		}

		// Tabrakan batas arena (XZ)
		const max = this.bounds - 0.5;
		if (this.position.x < -max + this.radius) { this.position.x = -max + this.radius; if (this.explodeOnImpact) { this.explode(); return; } this.velocity.x = -this.velocity.x * this.restitution; }
		if (this.position.x >  max - this.radius) { this.position.x =  max - this.radius; if (this.explodeOnImpact) { this.explode(); return; } this.velocity.x = -this.velocity.x * this.restitution; }
		if (this.position.z < -max + this.radius) { this.position.z = -max + this.radius; if (this.explodeOnImpact) { this.explode(); return; } this.velocity.z = -this.velocity.z * this.restitution; }
		if (this.position.z >  max - this.radius) { this.position.z =  max - this.radius; if (this.explodeOnImpact) { this.explode(); return; } this.velocity.z = -this.velocity.z * this.restitution; }

		// Tabrakan kotak AABB sederhana (XZ) pada ketinggian rendah
		for (const o of this.obstacles) {
			const bp = o.mesh.position; const half = o.half;
			// cek hanya jika ketinggian granat berada dekat tinggi objek (platform/pilar) bagian bawah
			if (this.position.y <= half.y + this.radius + 0.2) {
				const insideX = Math.abs(this.position.x - bp.x) <= (half.x + this.radius);
				const insideZ = Math.abs(this.position.z - bp.z) <= (half.z + this.radius);
				const insideY = Math.abs(this.position.y - bp.y) <= (half.y + this.radius);
				if (insideX && insideZ && insideY) {
					if (this.explodeOnImpact) { this.explode(); return; }
					// dorong keluar sepanjang normal planar jika tidak meledak-on-impact
					const nx = this.position.x - bp.x; const nz = this.position.z - bp.z; const len = Math.hypot(nx, nz) || 1;
					this.position.x = bp.x + (nx/len) * (Math.max(half.x, this.radius) + this.radius + 0.001);
					this.position.z = bp.z + (nz/len) * (Math.max(half.z, this.radius) + this.radius + 0.001);
					const n = new THREE.Vector3(nx/len, 0, nz/len);
					const v = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
					const refl = v.clone().sub(n.multiplyScalar(2 * v.dot(n)));
					this.velocity.x = refl.x * this.restitution; this.velocity.z = refl.z * this.restitution;
				}
			}
		}

		// Update mesh
		this.mesh.position.copy(this.position);
		this.mesh.rotation.x += dt * 8;
		this.mesh.rotation.z += dt * 6;
	}

	explode(){
		if (!this.alive) return;
		this.alive = false;
		this.onExplode(this.position.clone());
		this.dispose();
	}

	dispose(){
		this.scene.remove(this.mesh);
		try {
			this.mesh.geometry?.dispose();
			if (Array.isArray(this.mesh.material)) this.mesh.material.forEach(m=>m.dispose());
			else this.mesh.material?.dispose();
		} catch(_){ }
	}
} 