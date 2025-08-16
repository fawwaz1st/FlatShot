import { createInputState } from './input.js';

export function attachInputManager(game) {
	try {
		// expose/override createInputState to ensure centralized creation and future teardown support
		game.createInputState = function() {
			return createInputState(this);
		};
		// helper untuk reinitialize input (dipakai saat resume/pause jika perlu)
		game.rebindInput = function(){
			try { this.input = this.createInputState(); } catch(_) {}
		};
	} catch(_) {}
} 