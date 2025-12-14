export class AudioFX {
	constructor() {
		this.ctx = null;
		this.masterGain = null;
		this.limiter = null;
		this.ambienceNode = null;
		this._isMuted = false;
	}

	ensureCtx() {
		if (this.ctx) return;

		const AudioContext = window.AudioContext || window.webkitAudioContext;
		this.ctx = new AudioContext();

		// MASTER BUS SYSTEM
		// 1. Master Volume (Safe Level)
		this.masterGain = this.ctx.createGain();
		this.masterGain.gain.value = 0.3; // Safety Cap

		// 2. Limiter (Safety Net)
		this.limiter = this.ctx.createDynamicsCompressor();
		this.limiter.threshold.value = -10; // Start compressing early
		this.limiter.knee.value = 40;
		this.limiter.ratio.value = 12; // High ratio limit
		this.limiter.attack.value = 0;
		this.limiter.release.value = 0.25;

		// Route: Channel -> Master -> Limiter -> Speaker
		this.masterGain.connect(this.limiter);
		this.limiter.connect(this.ctx.destination);

		this._bindUnlock();
	}

	_bindUnlock() {
		const unlock = () => {
			if (this.ctx && this.ctx.state === 'suspended') {
				this.ctx.resume();
			}
			document.removeEventListener('click', unlock);
			document.removeEventListener('keydown', unlock);
		};
		document.addEventListener('click', unlock);
		document.addEventListener('keydown', unlock);
	}

	// ----------------------------------------
	// 1. FOOTSTEP - Heavy Boot Thud (No Noise)
	// ----------------------------------------
	footstep() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;

		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc.connect(gain);
		gain.connect(this.masterGain);

		// Tone: Kick Drum style thud
		osc.type = 'triangle'; // Cleaner than square, heavier than sine
		osc.frequency.setValueAtTime(150, t);
		osc.frequency.exponentialRampToValueAtTime(50, t + 0.1);

		// Envelope: Short & Punchy
		gain.gain.setValueAtTime(0, t);
		gain.gain.linearRampToValueAtTime(0.8, t + 0.01); // Attack
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15); // Decay

		osc.start(t);
		osc.stop(t + 0.2);
	}

	// ----------------------------------------
	// 2. GUNSHOT - Retro Blaster
	// ----------------------------------------
	shoot() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;

		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		// Optional: Distortion for "Grit"
		const shaper = this.ctx.createWaveShaper();
		shaper.curve = this._makeDistortionCurve(400);

		osc.connect(shaper);
		shaper.connect(gain);
		gain.connect(this.masterGain);

		// Tone: Laser Sweep
		osc.type = 'sawtooth';
		osc.frequency.setValueAtTime(800, t);
		osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);

		// Envelope
		gain.gain.setValueAtTime(0, t);
		gain.gain.linearRampToValueAtTime(0.5, t + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

		osc.start(t);
		osc.stop(t + 0.3);
	}

	// ----------------------------------------
	// 3. AMBIENCE - Horror Drone
	// ----------------------------------------
	startAmbience() {
		if (!this.ctx) this.ensureCtx();
		if (this.ambienceNode) return; // Already playing

		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		const lfo = this.ctx.createOscillator();
		const lfoGain = this.ctx.createGain();

		// LFO Modulates Volume slightly
		lfo.frequency.value = 0.2; // Slow pulse (5 sec)
		lfo.type = 'sine';
		lfoGain.gain.value = 0.02; // Modulation depth

		lfo.connect(lfoGain);
		lfoGain.connect(gain.gain);

		osc.connect(gain);
		gain.connect(this.masterGain);

		// Tone: Sub-bass uneasy drone
		osc.type = 'sine';
		osc.frequency.value = 50;
		gain.gain.setValueAtTime(0.05, t); // Very Quiet

		osc.start(t);
		lfo.start(t);

		this.ambienceNode = { osc, lfo, gain };
	}

	// ----------------------------------------
	// UTILS & HELPER
	// ----------------------------------------
	_makeDistortionCurve(amount) {
		const k = typeof amount === 'number' ? amount : 50;
		const n_samples = 44100;
		const curve = new Float32Array(n_samples);
		const deg = Math.PI / 180;
		for (let i = 0; i < n_samples; ++i) {
			const x = (i * 2) / n_samples - 1;
			curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
		}
		return curve;
	}

	// Interfaces required by Game logic
	setMasterVolume(val) {
		if (this.masterGain && Number.isFinite(val)) {
			// Clamp safe range 0.0 - 0.5 (never too loud)
			this.masterGain.gain.setTargetAtTime(Math.min(val, 0.5), this.ctx.currentTime, 0.1);
		}
	}

	// ----------------------------------------
	// NEW: PAUSE / RESUME SOUNDS
	// ----------------------------------------
	pause() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);

		// Descending "freeze" sound
		osc.type = 'sine';
		osc.frequency.setValueAtTime(600, t);
		osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);

		gain.gain.setValueAtTime(0.12, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

		osc.start(t); osc.stop(t + 0.2);
	}

	resume() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);

		// Ascending "unfreeze" sound
		osc.type = 'sine';
		osc.frequency.setValueAtTime(200, t);
		osc.frequency.exponentialRampToValueAtTime(800, t + 0.15);

		gain.gain.setValueAtTime(0.12, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

		osc.start(t); osc.stop(t + 0.2);
	}

	// ----------------------------------------
	// NEW: WEAPON SWITCH
	// ----------------------------------------
	weaponSwitch() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;

		// Mechanical click + slide
		const osc1 = this.ctx.createOscillator();
		const gain1 = this.ctx.createGain();
		osc1.connect(gain1); gain1.connect(this.masterGain);
		osc1.type = 'square';
		osc1.frequency.setValueAtTime(400, t);
		gain1.gain.setValueAtTime(0.08, t);
		gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
		osc1.start(t); osc1.stop(t + 0.05);

		// Slide
		const osc2 = this.ctx.createOscillator();
		const gain2 = this.ctx.createGain();
		osc2.connect(gain2); gain2.connect(this.masterGain);
		osc2.type = 'sawtooth';
		osc2.frequency.setValueAtTime(200, t + 0.05);
		osc2.frequency.linearRampToValueAtTime(350, t + 0.12);
		gain2.gain.setValueAtTime(0, t);
		gain2.gain.setValueAtTime(0.06, t + 0.05);
		gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
		osc2.start(t); osc2.stop(t + 0.15);
	}

	// ----------------------------------------
	// NEW: PICKUP SOUND
	// ----------------------------------------
	pickup() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);

		// Cheerful ascending arpeggio
		osc.type = 'sine';
		osc.frequency.setValueAtTime(400, t);
		osc.frequency.setValueAtTime(600, t + 0.05);
		osc.frequency.setValueAtTime(800, t + 0.1);

		gain.gain.setValueAtTime(0.1, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

		osc.start(t); osc.stop(t + 0.2);
	}

	// ----------------------------------------
	// NEW: STREAK / MULTIKILL
	// ----------------------------------------
	streak() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;

		// Triumphant chord
		[523.25, 659.25, 783.99].forEach((freq, i) => {
			const osc = this.ctx.createOscillator();
			const gain = this.ctx.createGain();
			osc.connect(gain); gain.connect(this.masterGain);
			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, t);
			gain.gain.setValueAtTime(0.08, t);
			gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
			osc.start(t + i * 0.05); osc.stop(t + 0.5);
		});
	}

	// ----------------------------------------
	// NEW: ERROR / DENIED
	// ----------------------------------------
	error() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);

		// Buzzer
		osc.type = 'square';
		osc.frequency.setValueAtTime(150, t);

		gain.gain.setValueAtTime(0.1, t);
		gain.gain.setValueAtTime(0.1, t + 0.1);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

		osc.start(t); osc.stop(t + 0.15);
	}

	// ----------------------------------------
	// NEW: COUNTDOWN BEEP
	// ----------------------------------------
	countdown(final = false) {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);

		osc.type = 'sine';
		osc.frequency.setValueAtTime(final ? 880 : 440, t);

		gain.gain.setValueAtTime(0.15, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + (final ? 0.4 : 0.15));

		osc.start(t); osc.stop(t + (final ? 0.5 : 0.2));
	}

	// ----------------------------------------
	// NEW: GAME START
	// ----------------------------------------
	gameStart() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;

		// Rising sweep + chord
		const sweep = this.ctx.createOscillator();
		const sweepGain = this.ctx.createGain();
		sweep.connect(sweepGain); sweepGain.connect(this.masterGain);
		sweep.type = 'sawtooth';
		sweep.frequency.setValueAtTime(100, t);
		sweep.frequency.exponentialRampToValueAtTime(800, t + 0.3);
		sweepGain.gain.setValueAtTime(0.1, t);
		sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
		sweep.start(t); sweep.stop(t + 0.4);

		// Power chord at end
		setTimeout(() => this.streak(), 300);
	}

	// ----------------------------------------
	// NEW: LOW AMMO WARNING
	// ----------------------------------------
	lowAmmo() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);

		osc.type = 'triangle';
		osc.frequency.setValueAtTime(300, t);
		osc.frequency.setValueAtTime(250, t + 0.08);

		gain.gain.setValueAtTime(0.08, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

		osc.start(t); osc.stop(t + 0.2);
	}

	// ----------------------------------------
	// NEW: GRENADE THROW
	// ----------------------------------------
	grenadeThrow() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);

		// Whoosh
		osc.type = 'sawtooth';
		osc.frequency.setValueAtTime(300, t);
		osc.frequency.exponentialRampToValueAtTime(100, t + 0.25);

		gain.gain.setValueAtTime(0.08, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

		osc.start(t); osc.stop(t + 0.3);
	}

	// ----------------------------------------
	// NEW: EXPLOSION
	// ----------------------------------------
	explosion() {
		if (!this.ctx) this.ensureCtx();
		const t = this.ctx.currentTime;

		// Low rumble + noise-like burst
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		const shaper = this.ctx.createWaveShaper();
		shaper.curve = this._makeDistortionCurve(800);

		osc.connect(shaper);
		shaper.connect(gain);
		gain.connect(this.masterGain);

		osc.type = 'sawtooth';
		osc.frequency.setValueAtTime(80, t);
		osc.frequency.exponentialRampToValueAtTime(20, t + 0.5);

		gain.gain.setValueAtTime(0.25, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

		osc.start(t); osc.stop(t + 0.6);
	}

	// ----------------------------------------
	// 4. UI SOUNDS
	// ----------------------------------------
	hover() {
		if (!this.ctx) return;
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc.connect(gain); gain.connect(this.masterGain);

		// Techy Blip
		osc.type = 'sine';
		osc.frequency.setValueAtTime(400, t);
		osc.frequency.linearRampToValueAtTime(600, t + 0.05);

		gain.gain.setValueAtTime(0.05, t);
		gain.gain.linearRampToValueAtTime(0, t + 0.05);

		osc.start(t); osc.stop(t + 0.06);
	}

	click() {
		if (!this.ctx) return;
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc.connect(gain); gain.connect(this.masterGain);

		// Sharp Confirm Tick
		osc.type = 'square';
		osc.frequency.setValueAtTime(800, t);

		gain.gain.setValueAtTime(0.08, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

		osc.start(t); osc.stop(t + 0.05);
	}

	// ----------------------------------------
	// 5. COMPLEX GAMEPLAY SFX
	// ----------------------------------------
	reload() {
		if (!this.ctx) return;
		const t = this.ctx.currentTime;

		// Part 1: Slide (Noise-like via rapid frequency modulation)
		const osc1 = this.ctx.createOscillator();
		const gain1 = this.ctx.createGain();
		osc1.connect(gain1); gain1.connect(this.masterGain);
		osc1.type = 'sawtooth';
		osc1.frequency.setValueAtTime(150, t);
		osc1.frequency.linearRampToValueAtTime(300, t + 0.2); // Slide up
		gain1.gain.setValueAtTime(0.05, t);
		gain1.gain.linearRampToValueAtTime(0, t + 0.25);

		// Part 2: Click (Lock)
		const osc2 = this.ctx.createOscillator();
		const gain2 = this.ctx.createGain();
		osc2.connect(gain2); gain2.connect(this.masterGain);
		osc2.type = 'square';
		osc2.frequency.setValueAtTime(600, t + 0.25);
		gain2.gain.setValueAtTime(0, t);
		gain2.gain.setValueAtTime(0.08, t + 0.25);
		gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

		osc1.start(t); osc1.stop(t + 0.25);
		osc2.start(t); osc2.stop(t + 0.35);
	}

	death() {
		if (!this.ctx) return;
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);

		// Power Down
		osc.type = 'sawtooth';
		osc.frequency.setValueAtTime(300, t);
		osc.frequency.exponentialRampToValueAtTime(10, t + 1.0);

		gain.gain.setValueAtTime(0.2, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

		osc.start(t); osc.stop(t + 1.0);
	}

	jump() {
		if (!this.ctx) return;
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);

		// Rising "Hup!"
		osc.type = 'sine';
		osc.frequency.setValueAtTime(150, t);
		osc.frequency.linearRampToValueAtTime(300, t + 0.2);

		gain.gain.setValueAtTime(0.1, t);
		gain.gain.linearRampToValueAtTime(0, t + 0.2);

		osc.start(t); osc.stop(t + 0.2);
	}

	land() {
		if (!this.ctx) return;
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);

		// Heavy Thud
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(100, t);
		osc.frequency.exponentialRampToValueAtTime(20, t + 0.15);

		gain.gain.setValueAtTime(0.15, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

		osc.start(t); osc.stop(t + 0.2);
	}

	playSample() { /* No-op (Clean) */ }
	playLoopSample() { /* No-op (Clean) */ }
	stopLoopSample() { /* No-op */ }

	// Essential Gameplay Feedback
	hit() {
		if (!this.ctx) return;
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);
		osc.type = 'sine'; osc.frequency.setValueAtTime(800, t);
		gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
		osc.start(t); osc.stop(t + 0.1);
	}
	headshot() {
		if (!this.ctx) return;
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);
		osc.type = 'triangle'; osc.frequency.setValueAtTime(1200, t);
		gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
		osc.start(t); osc.stop(t + 0.15);
	}
	reload() {
		if (!this.ctx) return;
		// Trigger procedural reload
		this.reload();
	}
	spawn() {
		// Spawn "Warp In"
		if (!this.ctx) return;
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain); gain.connect(this.masterGain);

		osc.type = 'sine';
		osc.frequency.setValueAtTime(100, t);
		osc.frequency.exponentialRampToValueAtTime(600, t + 0.5);

		gain.gain.setValueAtTime(0, t);
		gain.gain.linearRampToValueAtTime(0.2, t + 0.4);
		gain.gain.linearRampToValueAtTime(0, t + 0.5);

		osc.start(t); osc.stop(t + 0.5);
	}
	duckBgm() { /* No BGM to duck */ }
	stopBgm() { /* No BGM */ }
}