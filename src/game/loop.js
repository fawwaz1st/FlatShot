export function attachGameLoop(game){
	try {
		game.loop = function(){
			if (!this.animating) return;
			requestAnimationFrame(() => this.loop());
			const dtRaw = this.clock.getDelta();
			this._accum += dtRaw;
			if (this._accum < this._minFrameTime) return; // limiter FPS
			const dt = Math.min(0.05, this._accum);
			this._accum = 0;

			// update play time accumulator & seconds (stopwatch HUD)
			try {
				this._playTimeAccum = this._playTimeAccum || 0;
				this._playTimeSeconds = this._playTimeSeconds || 0;
				if (typeof this._startTimeMs === 'number') {
					// hitung berbasis startTime jika tersedia (lebih tahan terhadap akumulator yang reset)
					const elapsed = Math.floor((performance.now() - this._startTimeMs) / 1000);
					if (elapsed !== this._playTimeSeconds) {
						this._playTimeSeconds = elapsed;
						try { this.markHudDirty(); } catch(_) {}
						// langsung update HUD stopwatch jika instance HUD ada untuk menghindari race dengan flush
						try { if (this.hud && typeof this.hud.setPlayTime === 'function') this.hud.setPlayTime(this._playTimeSeconds || 0); } catch(_) {}
					}
				} else {
					this._playTimeAccum += dt;
					if (this._playTimeAccum >= 1.0) {
						const inc = Math.floor(this._playTimeAccum);
						this._playTimeSeconds += inc;
						this._playTimeAccum -= inc;
						try { this.markHudDirty(); } catch(_) {}
						// direct HUD update as fallback
						try { if (this.hud && typeof this.hud.setPlayTime === 'function') this.hud.setPlayTime(this._playTimeSeconds || 0); } catch(_) {}
					}
				}

				// Auto-adjust difficulty based on elapsed play time (auto-change-difficult-in-game)
				try {
					const prev = this.config && this.config.difficulty ? this.config.difficulty : 'normal';
					const s = Math.max(0, Number(this._playTimeSeconds) || 0);
					let next = 'normal';
					if (s >= 600) next = 'insane';
					else if (s >= 240) next = 'hard';
					if (prev !== next) {
						try { this.config.difficulty = next; } catch(_) {}
						try { this.markHudDirty(); } catch(_) {}
					}
				} catch(_) {}
			} catch(_) {}

			// Siklus siang-malam: ubah posisi matahari dan warna langit/fog
			const cyc = (performance.now() * 0.00005) % (Math.PI * 2);
			const elev = Math.sin(cyc);
			// make sun move on larger orbit and dynamic height
			const sunOrbit = Math.max(60, this.world.bounds * 0.3);
			this.sun.position.set(Math.cos(cyc) * sunOrbit, 20 + elev * (sunOrbit * 0.12), Math.sin(cyc) * sunOrbit);
			// adjust sun intensity to simulate day/night
			this.sun.intensity = Math.max(0.2, 0.9 + elev * 0.6);
			if (this.sunSprite) this.sunSprite.position.copy(this.sun.position);
			this.scene.background.setHSL(0.62, 0.5, 0.05 + (elev*0.03+0.04));
			this.scene.fog.color.setHSL(0.62, 0.4, 0.05 + (elev*0.03+0.04));

			// Hapus offset shake sebelumnya agar movement & kolisi tidak terpengaruh
			if (this._shakeOffset && (this._shakeOffset.x || this._shakeOffset.y || this._shakeOffset.z)) {
				this.camera.position.sub(this._shakeOffset);
				this._shakeOffset.set(0,0,0);
			}

			this.updatePlayer(dt);
			this.updateEnemies(dt);
			// fallback spawner: pastikan jumlah minimal enemies jika diperlukan
			try { if (typeof this.ensureMinEnemies === 'function') this.ensureMinEnemies(dt, this.controls.getObject().position); } catch(_) {}
			this.updateAllies(dt);
			this.updatePickups(dt);
			this.updateGrenades(dt);
			this.updateWeapon(dt);
			this.updateCameraShake(dt);
			this.updateWeaponSwitch(dt);
			this.updateDeathAnim(dt);
			this.updateParticles(dt);
			this.updateGrenadeAim(dt);
			this.updatePowerups(dt);
			this.handleFireInputs();

			// adaptive culling update setiap beberapa frame untuk mengurangi overhead
			this._cullTick = (this._cullTick || 0) + 1;
			if ((this._cullTick % 10) === 0) try { this.updateAdaptiveCulling(); } catch(_) {}

			// reset edge flags per frame
			this.input.shootPressed = false;
			this.input.shootReleased = false;

			// pool housekeeping: decay TTL dan recycle
			this._poolTick(dt);

			// render: gunakan composer kecuali device low-end -> pakai renderer langsung
			if (this._lowEnd) this.renderer.render(this.scene, this.camera);
			else this.composer.render();

			// flush HUD (delegated to hudController)
			try { if (typeof this.flushHudIfDirty === 'function') this.flushHudIfDirty(); } catch(_) {}
			
		};
	} catch(_) {}
} 