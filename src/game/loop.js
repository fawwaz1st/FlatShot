export function attachGameLoop(game) {
	let _lastErrorTime = 0;
	game.loop = function () {
		if (!this.animating) return;
		requestAnimationFrame(() => this.loop());

		try {
			const dtRaw = this.clock.getDelta();
			this._accum += dtRaw;
			if (this._accum < this._minFrameTime) return;
			const dt = Math.min(0.05, this._accum);
			this._accum = 0;

			// UPDATE TIMER
			this._playTimeAccum = this._playTimeAccum || 0;
			this._playTimeSeconds = this._playTimeSeconds || 0;
			if (typeof this._startTimeMs === 'number') {
				const elapsed = Math.floor((performance.now() - this._startTimeMs) / 1000);
				if (elapsed !== this._playTimeSeconds) {
					this._playTimeSeconds = elapsed;
					if (this.markHudDirty) this.markHudDirty();
					if (this.hud && this.hud.setPlayTime) this.hud.setPlayTime(this._playTimeSeconds);
				}
			} else {
				this._playTimeAccum += dt;
				if (this._playTimeAccum >= 1.0) {
					const inc = Math.floor(this._playTimeAccum);
					this._playTimeSeconds += inc;
					this._playTimeAccum -= inc;
					if (this.markHudDirty) this.markHudDirty();
					if (this.hud && this.hud.setPlayTime) this.hud.setPlayTime(this._playTimeSeconds);
				}
			}

			// DIFFICULTY AUTO-SCALING
			try {
				const prev = this.config?.difficulty || 'normal';
				const s = this._playTimeSeconds || 0;
				let next = 'normal';
				if (s >= 600) next = 'insane';
				else if (s >= 240) next = 'hard';
				if (prev !== next) {
					this.config.difficulty = next;
					if (this.markHudDirty) this.markHudDirty();
				}
			} catch (_) { }

			// DAY/NIGHT CYCLE
			if (this.sun) {
				const cyc = (performance.now() * 0.00005) % (Math.PI * 2);
				const elev = Math.sin(cyc);
				const sunOrbit = Math.max(60, this.world.bounds * 0.3);
				this.sun.position.set(Math.cos(cyc) * sunOrbit, 20 + elev * (sunOrbit * 0.12), Math.sin(cyc) * sunOrbit);
				this.sun.intensity = Math.max(0.2, 0.9 + elev * 0.6);
				if (this.sunSprite) this.sunSprite.position.copy(this.sun.position);
				if (this.scene.background.setHSL) this.scene.background.setHSL(0.62, 0.5, 0.05 + (elev * 0.03 + 0.04));
				if (this.scene.fog && this.scene.fog.color.setHSL) this.scene.fog.color.setHSL(0.62, 0.4, 0.05 + (elev * 0.03 + 0.04));
			}

			// CAMERA SHAKE RESET
			if (this._shakeOffset && (this._shakeOffset.x !== 0 || this._shakeOffset.y !== 0 || this._shakeOffset.z !== 0)) {
				this.camera.position.sub(this._shakeOffset);
				this._shakeOffset.set(0, 0, 0);
			}

			// GAME LOGIC UPDATE
			if (this.currentSceneMode === 'game') {
				if (this.updatePlayer) this.updatePlayer(dt);
				if (this.updateEnemies) this.updateEnemies(dt);
				if (this.ensureMinEnemies) this.ensureMinEnemies(dt, this.controls.getObject().position);
				if (this.updateAllies) this.updateAllies(dt);
				if (this.updatePickups) this.updatePickups(dt);
				if (this.updateGrenades) this.updateGrenades(dt);
				if (this.updateWeapon) this.updateWeapon(dt);
				if (this.updateCameraShake) this.updateCameraShake(dt);
				if (this.updateWeaponSwitch) this.updateWeaponSwitch(dt);
				if (this.updateDeathAnim) this.updateDeathAnim(dt);
				if (this.updateParticles) this.updateParticles(dt);
				if (this.updateGrenadeAim) this.updateGrenadeAim(dt);
				if (this.updatePowerups) this.updatePowerups(dt);
				if (this.handleFireInputs) this.handleFireInputs();

				this._cullTick = (this._cullTick || 0) + 1;
				if ((this._cullTick % 10) === 0 && this.updateAdaptiveCulling) this.updateAdaptiveCulling();

				this.input.shootPressed = false;
				this.input.shootReleased = false;

				if (this._poolTick) this._poolTick(dt);

			} else if (this.currentSceneMode === 'menu') {
				if (this.menuScene && this.menuScene.update) this.menuScene.update(dt);
			}

			// RENDER
			// Safety: Fallback to basic renderer if composer fails or low-end mode
			try {
				if (this._lowEnd) {
					this.renderer.render(this.scene, this.camera);
				} else {
					this.composer.render();
				}
			} catch (renderErr) {
				console.error("Render Error (Switching to Low-End):", renderErr);
				this._lowEnd = true; // Permanent switch to safe mode
				this.renderer.render(this.scene, this.camera);
			}

			if (this.flushHudIfDirty) this.flushHudIfDirty();

		} catch (err) {
			// Throttle logging: once every 2 seconds max
			const now = performance.now();
			if (now - _lastErrorTime > 2000) {
				console.error("[GameLoop Error]", err);
				_lastErrorTime = now;
			}
		}
	};
} 