import * as THREE from 'three';
import { AmmoPickup } from '../modules/pickup.js';

export function attachEffectsController(game){
	try{
		// _getSmokeTexture
		game._getSmokeTexture = function(){
			if (this._smokeTex) return this._smokeTex;
			const size = 128; const data = new Uint8Array(size*size*4);
			for (let y=0;y<size;y++){
				for (let x=0;x<size;x++){
					const i = (y*size + x)*4;
					const dx = x-size/2; const dy = y-size/2; const d = Math.sqrt(dx*dx+dy*dy)/(size/2);
					const alpha = Math.max(0, 1 - Math.pow(d, 1.6));
					data[i]=200; data[i+1]=200; data[i+2]=200; data[i+3]=Math.floor(alpha*255);
				}
			}
			this._smokeTex = new THREE.DataTexture(data, size, size); this._smokeTex.needsUpdate = true; this._smokeTex.minFilter = THREE.LinearFilter; this._smokeTex.magFilter = THREE.LinearFilter;
			return this._smokeTex;
		};

		// _spawnDebris
		game._spawnDebris = function(center, count){
			if (this._debrisPool && this._debrisPool.length>0) {
				let entry = this._debrisPool.find(x=>!x.busy);
				if (!entry) entry = this._debrisPool[0];
				const pts = entry.obj;
				const max = pts.userData._maxCount || 64;
				const used = Math.min(count, max);
				const arr = pts.geometry.attributes.position.array;
				entry.count = used; entry.busy = true; entry.ttl = 0.6; entry.velocities = [];
				for (let i=0;i<used;i++){
					arr[i*3+0] = center.x; arr[i*3+1] = center.y; arr[i*3+2] = center.z;
					const a = Math.random()*Math.PI*2; const v = 6 + Math.random()*10;
					entry.velocities[i] = { vx: Math.cos(a)*v, vy: 3+Math.random()*6, vz: Math.sin(a)*v };
				}
				for (let i=used;i<max;i++){ arr[i*3+0]=arr[(used-1)*3+0]; arr[i*3+1]=arr[(used-1)*3+1]; arr[i*3+2]=arr[(used-1)*3+2]; }
				pts.geometry.attributes.position.needsUpdate = true; pts.visible = true;
				return { obj: pts, dispose: ()=>{ try{ pts.visible=false; }catch(_){} } };
			}
			// fallback original alokasi jika pool tidak ada
			const geom = new THREE.BufferGeometry();
			const positions = new Float32Array(count*3);
			const velocities = [];
			for (let i=0;i<count;i++){
				positions[i*3+0] = center.x; positions[i*3+1] = center.y; positions[i*3+2] = center.z;
				const a = Math.random()*Math.PI*2; const v = 8 + Math.random()*10;
				velocities.push({ vx: Math.cos(a)*v, vy: 3+Math.random()*6, vz: Math.sin(a)*v });
			}
			geom.setAttribute('position', new THREE.BufferAttribute(positions,3));
			const mat = new THREE.PointsMaterial({ color: 0xffae5a, size: 0.06, transparent: true, opacity: 0.95 });
			const pts = new THREE.Points(geom, mat);
			this.scene.add(pts);
			let t = 0; const tick = ()=>{
				if (t>0.5) { return; }
				const pos = geom.attributes.position.array;
				for (let i=0;i<count;i++){
					velocities[i].vy += -12 * 0.016;
					pos[i*3+0] += velocities[i].vx * 0.016;
					pos[i*3+1] += velocities[i].vy * 0.016;
					pos[i*3+2] += velocities[i].vz * 0.016;
				}
				geom.attributes.position.needsUpdate = true;
				t += 0.016; requestAnimationFrame(tick);
			}; tick();
			return { obj: pts, dispose: ()=>{ try{ geom.dispose(); mat.dispose(); }catch(_){} } };
		};

		// _screenFlash
		game._screenFlash = function(intensity = 0.8, duration = 0.12){
			try {
				const el = document.getElementById('transition'); if (!el) return;
				el.style.background = `rgba(255,241,168,${intensity})`;
				el.classList.remove('hidden'); el.classList.add('show');
				setTimeout(()=>{ try { el.classList.remove('show'); setTimeout(()=>{ el.classList.add('hidden'); el.style.background = '#000'; }, 200); } catch(_){} }, duration*1000);
			} catch(_){}
		};

		// spawnExplosion
		game.spawnExplosion = function(center){
			const group = new THREE.Group();
			group.position.copy(center);
			const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
			const ringGeo = new THREE.RingGeometry(0.2, 0.24, 48);
			const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
			const ring1 = new THREE.Mesh(ringGeo, ringMat.clone()); ring1.rotation.x = -Math.PI/2;
			const ring2 = new THREE.Mesh(ringGeo, ringMat.clone()); ring2.rotation.x = -Math.PI/2; ring2.material.color.setHex(0xffc07a);
			const smokeTex = this._getSmokeTexture();
			const smokeMat = new THREE.SpriteMaterial({ map: smokeTex, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
			const smoke = new THREE.Sprite(smokeMat); smoke.scale.set(6, 6, 1);
			const debris = this._spawnDebris(center, 50);
			const flash = new THREE.PointLight(0xfff1a8, 3.0, 28);
			group.add(glow); group.add(ring1); group.add(ring2); group.add(smoke); group.add(flash);
			this.scene.add(group);
			this._screenFlash(0.45, 0.16);
			let t = 0;
			const tick = () => {
				if (t > 1.1) { this.scene.remove(group); glow.geometry.dispose(); glow.material.dispose(); ring1.geometry.dispose(); ring1.material.dispose(); ring2.geometry.dispose(); ring2.material.dispose(); smoke.material.dispose(); return; }
				const s = THREE.MathUtils.lerp(0.3, 9.0, t);
				glow.scale.setScalar(s);
				ring1.scale.setScalar(THREE.MathUtils.lerp(1, 26, t)); ring1.material.opacity = 0.95 * (1 - t);
				ring2.scale.setScalar(THREE.MathUtils.lerp(1, 18, Math.min(1, t*1.4))); ring2.material.opacity = 0.85 * (1 - Math.min(1, t*1.4));
				smoke.material.opacity = 0.9 * (1 - Math.min(1, (t-0.1)*0.9)); smoke.scale.setScalar(THREE.MathUtils.lerp(4, 16, t));
				flash.intensity = 3.0 * (1 - t);
				t += 0.05;
				requestAnimationFrame(tick);
			};
			tick();
			setTimeout(()=>{ this.scene.remove(debris.obj); debris.dispose(); }, 600);
		};

		// spawnBeam (reuse tracer pool)
		game.spawnBeam = function(start, end, color = 0xffffff, duration = 0.12){
			if (!this._tracerPool) return;
			let entry = this._tracerPool.find(x=>!x.busy);
			if (!entry) entry = this._tracerPool[0];
			const line = entry.obj;
			const posAttr = line.geometry.attributes.position.array;
			posAttr[0] = start.x; posAttr[1] = start.y; posAttr[2] = start.z;
			const toVec = end ? end : start.clone().add(new THREE.Vector3(0,0,-1));
			posAttr[3] = toVec.x; posAttr[4] = toVec.y; posAttr[5] = toVec.z;
			line.geometry.attributes.position.needsUpdate = true;
			line.material.color.setHex(color);
			line.material.opacity = 0.95;
			line.visible = true; entry.busy = true; entry.ttl = duration;
			try { this.flashBloom(0.35, duration*0.9); } catch(_) {}
		};

	} catch(e){ console.error('[EffectsController] attach error', e); }
} 