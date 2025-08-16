export function createInputState(game) {
	const state = {
		forward: false,
		backward: false,
		left: false,
		right: false,
		run: false,
		shoot: false,
		shootPressed: false,
		shootReleased: false,
		jump: false
	};
	const onKey = (e, down) => {
		// jika sedang mengetik di input/chat, jangan ganggu event keyboard game
		try { if (document && document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return; } catch(_) {}
		switch (e.code) {
			case 'Digit1': if (down) { try{ game.queueWeaponSwitch('pistol', 'Pistol', '[1]'); } catch(_){} } break;
			case 'Digit2': if (down) { try{ game.queueWeaponSwitch('grenade', 'Granat', '[2]'); } catch(_){} } break;
			case 'KeyW': case 'ArrowUp': state.forward = down; break;
			case 'KeyS': case 'ArrowDown': state.backward = down; break;
			case 'KeyA': case 'ArrowLeft': state.left = down; break;
			case 'KeyD': case 'ArrowRight': state.right = down; break;
			case 'ShiftLeft': case 'ShiftRight': state.run = down; break;
			case 'Space': state.jump = down; break;
			case 'KeyR': if (down) try{ game.reload(); } catch(_){} break;
			case 'Escape': if (down) try{ game.pauseToMenu(); } catch(_){} break;
		}
	};
	window.addEventListener('keydown', (e) => onKey(e, true));
	window.addEventListener('keyup', (e) => onKey(e, false));
	try {
		if (game.renderer && game.renderer.domElement) {
			game.renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 0) { state.shoot = true; state.shootPressed = true; } });
			game.renderer.domElement.addEventListener('mouseup', (e) => { if (e.button === 0) { state.shoot = false; state.shootReleased = true; } });
		}
	} catch(_) {}
	return state;
} 