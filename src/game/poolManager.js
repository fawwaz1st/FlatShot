import * as THREE from 'three';

export function attachPoolManager(game){
	try {
		game._initPools = function(){
			this._tracerPool = [];
			this._tracerMat = new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9 });
			const tracerCount = this._lowEnd ? 12 : 24;
			for (let i=0;i<tracerCount;i++) {
				const geom = new THREE.BufferGeometry();
				const positions = new Float32Array(2*3);
				geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
				const line = new THREE.Line(geom, this._tracerMat);
				line.visible = false; this.scene.add(line);
				this._tracerPool.push({ obj: line, busy: false, ttl: 0 });
			}

			this._pointsPool = [];
			this._pointsMat = new THREE.PointsMaterial({ color: 0xfff1a8, size: 0.05, transparent:true, opacity:0.9 });
			const pointsPoolCount = this._lowEnd ? 6 : 12;
			for (let i=0;i<pointsPoolCount;i++) {
				const maxCount = this._lowEnd ? 32 : 64;
				const geom = new THREE.BufferGeometry();
				const positions = new Float32Array(maxCount*3);
				geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
				const pts = new THREE.Points(geom, this._pointsMat);
				pts.userData._maxCount = maxCount; pts.visible = false; this.scene.add(pts);
				this._pointsPool.push({ obj: pts, busy: false, ttl: 0 });
			}

			this._casingPool = [];
			const casingGeom = new THREE.CylinderGeometry(0.006, 0.006, 0.018, 8);
			const casingMat = new THREE.MeshBasicMaterial({ color: 0xc2b280 });
			const casingCount = this._lowEnd ? 12 : 24;
			for (let i=0;i<casingCount;i++){
				const m = new THREE.Mesh(casingGeom, casingMat);
				m.visible = false; this.scene.add(m);
				this._casingPool.push({ obj: m, busy:false, ttl:0, vel: new THREE.Vector3(), rotSpeed: new THREE.Vector3() });
			}

			this._decalPool = [];
			const decalCount = this._lowEnd ? 8 : 16;
			for (let i=0;i<decalCount;i++){
				const rim = new THREE.RingGeometry(0.12, 0.24, 24);
				const mat = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
				const mesh = new THREE.Mesh(rim, mat); mesh.rotation.x = -Math.PI/2; mesh.visible = false; this.scene.add(mesh);
				this._decalPool.push({ obj: mesh, busy:false, ttl:0 });
			}

			this._debrisPool = [];
			this._debrisMat = new THREE.PointsMaterial({ color: 0xffae5a, size: 0.06, transparent: true, opacity: 0.95 });
			for (let i=0;i<6;i++){
				const max = 64;
				const geom = new THREE.BufferGeometry();
				const positions = new Float32Array(max*3);
				geom.setAttribute('position', new THREE.BufferAttribute(positions,3));
				const pts = new THREE.Points(geom, this._debrisMat);
				pts.userData._maxCount = max; pts.visible = false; this.scene.add(pts);
				this._debrisPool.push({ obj: pts, busy:false, ttl:0, velocities: new Array(max), count:0 });
			}
		};

		game._poolTick = function(dt){
			if (this._tracerPool) {
				for (const t of this._tracerPool) {
					if (t.busy) {
						t.ttl -= dt;
						if (t.ttl <= 0) { t.obj.visible = false; t.busy = false; }
					}
				}
			}
			if (this._pointsPool) {
				for (const p of this._pointsPool) {
					if (p.busy) {
						p.ttl -= dt;
						if (p.ttl <= 0) { p.obj.visible = false; p.busy = false; }
					}
				}
			}
			if (this._casingPool) {
				for (const c of this._casingPool) {
					if (c.busy) {
						c.ttl -= dt;
						c.obj.position.addScaledVector(c.vel, dt);
						c.obj.rotation.x += c.rotSpeed.x * dt; c.obj.rotation.y += c.rotSpeed.y * dt; c.obj.rotation.z += c.rotSpeed.z * dt;
						c.vel.y += -12 * dt;
						if (c.ttl <= 0) { c.obj.visible = false; c.busy = false; }
					}
				}
			}
			if (this._decalPool) {
				for (const d of this._decalPool) {
					if (d.busy) d.ttl -= dt; if (d.ttl <= 0) { d.obj.visible = false; d.busy = false; }
				}
			}
			if (this._debrisPool) {
				for (const p of this._debrisPool) {
					if (!p.busy) continue;
					p.ttl -= dt;
					const arr = p.obj.geometry.attributes.position.array;
					for (let i=0;i<p.count;i++){
						p.velocities[i].vy += -12 * dt;
						arr[i*3+0] += p.velocities[i].vx * dt;
						arr[i*3+1] += p.velocities[i].vy * dt;
						arr[i*3+2] += p.velocities[i].vz * dt;
					}
					p.obj.geometry.attributes.position.needsUpdate = true;
					if (p.ttl <= 0) { p.obj.visible = false; p.busy = false; }
				}
			}
		};
	} catch(_) {}
} 