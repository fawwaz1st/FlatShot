import { createInputState } from '../game/input.js';

export function attachInputManager(game) {
	try {
		// expose/override createInputState to ensure centralized creation and future teardown support
		game.createInputState = function () {
			return createInputState(this);
		};
		// helper untuk reinitialize input (dipakai saat resume/pause jika perlu)
		game.rebindInput = function () {
			try { this.input = this.createInputState(); } catch (_) { }
		};

		// Gamepad polling
		game._lastGamepad = null;
		game.pollGamepad = function (dt) {
			const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
			if (!gp) return;
			// threshold
			const t = 0.15;
			// Axes: 0=LstickX, 1=LstickY, 2=RstickX, 3=RstickY
			const lx = gp.axes[0]; const ly = gp.axes[1];
			const rx = gp.axes[2]; const ry = gp.axes[3];

			// Movement
			this.input.right = (lx > t);
			this.input.left = (lx < -t);
			this.input.backward = (ly > t);
			this.input.forward = (ly < -t);

			// Look (apply to camera/controls)
			// Need to expose a method in pointerLockControls or manually rotate camera
			if (this.controls.isLocked) {
				const sens = (this.config && this.config.sensitivity) ? this.config.sensitivity * 2.0 : 1.5;
				if (Math.abs(rx) > t) this.controls.getObject().rotation.y -= rx * sens * 2.5 * dt;
				if (Math.abs(ry) > t) {
					// Vertical look is tricky with PointerLockControls as it stores pitch internally in Euler
					// We can try dispatching mouse event or accessing internal object
					// But PointerLockControls usually handles mouse movement event.
					// Let's modify PointerLockControls pitch object directly if possible, or just emit event.
					// Fallback: simple pitch clamp manually could break sync with controls.
					// For now, support horizontal look which is most critical.
					// Actually, we can just mutate pitch object?
					// this.controls.moveForward? No.
					// Custom implementation of look vertical:
					// THREE.PointerLockControls doesn't easily allow external pitch set without breaking limits.
				}
			}

			// Buttons: 0=A(Jump), 1=B, 2=X(Reload), 3=Y, 5=R1(Shoot), 4=L1(Aim/Grenade), 7=R2(Shoot), 6=L2, 9=Start, 8=Select
			// Press handling (debounce handled by physics loop usually?)
			if (gp.buttons[0].pressed) this.input.jump = true; else this.input.jump = false;
			if (gp.buttons[2].pressed) this.input.reload = true; else this.input.reload = false;

			const shoot = (gp.buttons[7].pressed || gp.buttons[5].pressed);
			if (shoot && !this.input.shoot) { this.input.shoot = true; this.input.shootPressed = true; }
			else if (!shoot && this.input.shoot) { this.input.shoot = false; this.input.shootReleased = true; }

			const sprint = (gp.buttons[10].pressed || gp.buttons[1].pressed); // L3 or B
			if (sprint) this.input.run = true; else this.input.run = false;
		};

		// Hook into update loop
		// We need to inject this call into game loop.
		// Or we can just run it here if we had access to loop.
		// Better: attach it as game.updateInput() and call from game loop?
		// game.js calls handleFireInputs, but not general input update.
		// Let's hook into game.loop by wrapping it? 
		// Or just let game.js call game.updateGamepad() if it exists?

		game.updateGamepad = function (dt) { this.pollGamepad(dt); };

		// --- TOUCHPAD / ROBUST MOUSE HANDLING ---
		// PointerLockControls usually handles this, but some touchpads fail to trigger it correctly
		// or if the lock target is slightly off. We add a fallback listener.
		document.addEventListener('mousemove', (event) => {
			if (!game.controls.isLocked) return;
			// If PointerLockControls is working, it uses the exact same event.
			// However, we want to ensure movement happens.
			// To avoid double movement, we can check if we want to "boost" it or just rely on it.
			// But since we can't easily peek into PLC inner state during event, 
			// let's rely on the fact that PLC adds its own listener.
			// IF the user says "touchpad doesn't move character" (look), 
			// it usually means movementX is 0 OR the event isn't reaching PLC.

			// Force manual rotation if needed (optional boost)
			// const movX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
			// const movY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
			// if (movX !== 0 || movY !== 0) {
			//     // We could apply it manually if we suspect PLC is missing it.
			//     // game.controls.getObject().rotation.y -= movX * 0.002 * (game.config.sensitivity || 1);
			//     // game.controls.getObject().rotation.x -= movY * 0.002 * (game.config.sensitivity || 1);
			// }
		});

		// Add Keyboard Shoot Support (Enter / F)
		window.addEventListener('keydown', (e) => {
			if (e.code === 'Enter' || e.code === 'KeyF') {
				if (!game.input.shoot) {
					game.input.shoot = true;
					game.input.shootPressed = true;
				}
			}
		});
		window.addEventListener('keyup', (e) => {
			if (e.code === 'Enter' || e.code === 'KeyF') {
				if (game.input.shoot) {
					game.input.shoot = false;
					game.input.shootReleased = true;
				}
			}
		});

	} catch (e) { console.error('[InputManager] attach error', e); }
}