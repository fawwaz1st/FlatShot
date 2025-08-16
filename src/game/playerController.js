import * as THREE from 'three';

export function attachPlayerController(game){
	try{
		// updatePlayer: gerakan & fisika pemain
		game.updatePlayer = function(dt){
			const speed = (this.input.run ? this.player.speedRun : this.player.speedWalk);
			const speedBoost = (this.powerups.speed>0)?1.3:1.0;
			const direction = new THREE.Vector3();
			direction.set(0, 0, 0);
			if (this.input.forward) direction.z += 1;
			if (this.input.backward) direction.z -= 1;
			if (this.input.left) direction.x -= 1;
			if (this.input.right) direction.x += 1;
			if (direction.lengthSq() > 0) direction.normalize();

			const camDir = new THREE.Vector3();
			this.camera.getWorldDirection(camDir);
			camDir.y = 0; camDir.normalize();
			const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
			const move = new THREE.Vector3();
			move.copy(camDir).multiplyScalar(direction.z).add(camRight.multiplyScalar(direction.x));
			if (move.lengthSq() > 0) move.normalize();

			const step = speed * speedBoost * dt;
			this.tryMove(move.multiplyScalar(step));
			// footstep SFX sederhana
			if ((this.input.forward||this.input.backward||this.input.left||this.input.right)){
				this._footTimer = (this._footTimer||0) - dt;
				if (this._footTimer<=0){ this._footTimer = this.input.run?0.26:0.42; try{ this.audio.footstep({ run:this.input.run }); }catch(_){} }
			}

			// Jump & gravity
			const gravity = -20;
			if (this.input.jump && !this.player.jumping) {
				this.player.vy = 8.5;
				this.player.jumping = true;
			}
			this.player.vy += gravity * dt;
			this.player.y += this.player.vy * dt;
			if (this.player.y <= 1.6) { this.player.y = 1.6; this.player.vy = 0; this.player.jumping = false; }
			this.controls.getObject().position.y = this.player.y;
		};

		// tryMove: collision & bounds
		game.tryMove = function(delta){
			const pos = this.controls.getObject().position;
			const next = this.tmpVec3.copy(pos).add(delta);

			const max = this.world.bounds - 1.0;
			next.x = Math.max(-max, Math.min(max, next.x));
			next.z = Math.max(-max, Math.min(max, next.z));

			const radius = this.player.radius + 0.05;
			for (let iter=0; iter<2; iter++) {
				for (const o of this.world.obstacles) {
					if (o.type === 'road') continue;
					const p = next;
					const bp = o.mesh.position;
					const half = o.half;
					const dx = Math.max(Math.abs(p.x - bp.x) - (half.x + radius), 0);
					const dz = Math.max(Math.abs(p.z - bp.z) - (half.z + radius), 0);
					const dist = Math.hypot(dx, dz);
					if (dist < 0.001) {
						const nx = p.x - bp.x;
						const nz = p.z - bp.z;
						const len = Math.hypot(nx, nz) || 1;
						p.x = bp.x + (nx / len) * (half.x + radius + 0.001);
						p.z = bp.z + (nz / len) * (half.z + radius + 0.001);
					}
				}
			}
			pos.set(next.x, this.player.y, next.z);
		};

	} catch(e){ console.error('[PlayerController] attach error', e); }
} 