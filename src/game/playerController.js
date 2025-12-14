import * as THREE from 'three';

export function attachPlayerController(game) {
	try {
		// Reusable vectors for GC optimization
		const _pDir = new THREE.Vector3();

		// updatePlayer: gerakan & fisika pemain
		// updatePlayer: gerakan & fisika pemain
		game.updatePlayer = function (dt) {
			if (this.isPaused) return;
			if (this.controls.isLocked === true) {
				const player = this.player; // Fix: Access player state object
				const delta = dt;
				// movement speed
				const baseSpeed = (this.input.sprint && !this.input.backward && this.input.forward)
					? (this.config.player ? this.config.player.speedRun : 8.5)
					: (this.config.player ? this.config.player.speedWalk : 5.0);

				const speed = baseSpeed * (this.perks?.speedMult || 1.0);

				// Fix: Use player.velocity instead of this.velocity
				player.velocity.x -= player.velocity.x * 10.0 * delta;
				player.velocity.z -= player.velocity.z * 10.0 * delta;
				player.velocity.y -= 9.8 * 2.0 * delta; // gravity

				_pDir.set(0, 0, 0);
				if (this.input.forward) _pDir.z += 1;
				if (this.input.backward) _pDir.z -= 1;
				if (this.input.left) _pDir.x -= 1;
				if (this.input.right) _pDir.x += 1;
				if (_pDir.lengthSq() > 0) _pDir.normalize();

				// Rotate input direction by camera angle
				const camDir = new THREE.Vector3();
				this.camera.getWorldDirection(camDir);
				camDir.y = 0; camDir.normalize();
				const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();

				const moveX = (camDir.x * _pDir.z) + (camRight.x * _pDir.x);
				const moveZ = (camDir.z * _pDir.z) + (camRight.z * _pDir.x);

				if (this.input.forward || this.input.backward || this.input.left || this.input.right) {
					player.velocity.z -= moveZ * speed * 40.0 * delta;
					player.velocity.x -= moveX * speed * 40.0 * delta;
				}

				// --- AUDIO ENGINE 2.0: LOGIC FIX ---
				// Throttle footsteps to prevent "Machine Gun" noise
				const isGrounded = !player.jumping && (player.y <= 1.65);
				const isMoving = _pDir.lengthSq() > 0;
				const velocitySq = player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z;

				if (isGrounded && isMoving && velocitySq > 0.5) {
					const now = Date.now();
					// Default 450ms walk, 350ms run
					const interval = this.input.sprint ? 350 : 450;

					if (now - (this._lastStepTime || 0) > interval) {
						if (this.audio && typeof this.audio.footstep === 'function') {
							this.audio.footstep();
						}
						this._lastStepTime = now;
					}
				}

				this.controls.moveRight(-player.velocity.x * delta);
				this.controls.moveForward(-player.velocity.z * delta);

				this.tryMove(delta);

				if (this.controls.getObject().position.y < 1.6) {
					player.velocity.y = 0;
					this.controls.getObject().position.y = 1.6;
					this.canJump = true;
					player.jumping = false;
				}

				// Jump
				if (this.input.jump && !player.jumping) {
					player.vy = (this.config.player?.jumpForce || 8.5);
					player.jumping = true;
					// TRIGGER JUMP SFX
					if (this.audio && typeof this.audio.jump === 'function') {
						this.audio.jump();
					}
				}
				player.vy += (this.config.player?.gravity || -20) * dt;
				player.y += player.vy * dt;
				if (player.y <= 1.6) { player.y = 1.6; player.vy = 0; player.jumping = false; }
				// --- HEAD BOB (PROCEDURAL) ---
				if (isMoving && isGrounded) {
					const bobFreq = this.input.sprint ? 18.0 : 12.0;
					const bobAmp = this.input.sprint ? 0.08 : 0.04;
					const t = performance.now() * 0.001;
					const bobY = Math.sin(t * bobFreq) * bobAmp;
					const bobX = Math.cos(t * bobFreq * 0.5) * bobAmp * 0.5;

					// Apply to camera local
					this.camera.position.y = player.y + bobY;
					// Optional: slight roll
					this.camera.rotation.z = bobX * 0.5;
				} else {
					// Smooth reset
					this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, player.y, 0.1);
					this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, 0, 0.1);
				}

				this.controls.getObject().position.y = player.y; // Base physics Y

				// LANDING DETECTION
				const currentlyGrounded = !player.jumping && (player.y <= 1.65);
				if (!this._wasGrounded && currentlyGrounded) {
					// Just Landed
					if (this.audio && typeof this.audio.land === 'function' && player.velocity.y < -2.0) {
						this.audio.land();
					}
				}
				this._wasGrounded = currentlyGrounded;
			}
		};

		// tryMove: collision & bounds
		game.tryMove = function (delta) {
			const pos = this.controls.getObject().position;
			const next = this.tmpVec3.copy(pos).add(delta);

			const max = this.world.bounds - 1.0;
			next.x = Math.max(-max, Math.min(max, next.x));
			next.z = Math.max(-max, Math.min(max, next.z));

			const radius = this.player.radius + 0.05;

			// Spatial Hash Query
			const nearby = this.spatialHash ? this.spatialHash.query(next, radius + 2.0) : this.world.obstacles;

			for (let iter = 0; iter < 2; iter++) {
				for (const o of nearby) {
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

	} catch (e) { console.error('[PlayerController] attach error', e); }
} 