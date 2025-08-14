export class AudioFX {
	constructor() {
		this.ctx = null;
		this.masterGain = null;
		this.sfxGain = null;
		this.bgmGain = null;
		this.bgmNodes = [];
		this._started = false;
		this._afterUnlock = [];
		this._bindUnlock();
		this.mode = 'synth';
	}

	ensureCtx() {
		if (!this.ctx) {
			this.ctx = new (window.AudioContext || window.webkitAudioContext)();
			this.masterGain = this.ctx.createGain();
			this.masterGain.gain.value = 1.0;
			this.masterGain.connect(this.ctx.destination);
			this.sfxGain = this.ctx.createGain();
			this.sfxGain.gain.value = 1.0;
			this.sfxGain.connect(this.masterGain);
		}
	}

	_bindUnlock(){
		const events = ['touchstart','touchend','mousedown','keydown'];
		const unlock = () => {
			this.ensureCtx();
			const resume = () => {
				const cbs = this._afterUnlock.splice(0);
				for (const cb of cbs) { try { cb(); } catch(e){} }
			};
			if (this.ctx.state === 'running') { cleanup(); resume(); return; }
			this.ctx.resume().then(() => { cleanup(); resume(); }).catch(() => {});
		};
		const cleanup = () => { events.forEach(e => document.body.removeEventListener(e, unlock)); };
		events.forEach(e => document.body.addEventListener(e, unlock, false));
	}

	_runAfterUnlock(fn){
		this.ensureCtx();
		if (this.ctx.state === 'running') { fn(); } else { this._afterUnlock.push(fn); }
	}

	setMasterVolume(v) { this.ensureCtx(); this.masterGain.gain.value = Math.max(0, Math.min(1, v)); }
	setMusicVolume(v) { this.ensureCtx(); if (this.bgmGain) this.bgmGain.gain.value = Math.max(0, Math.min(1, v)); }
	setSfxVolume(v) { this.ensureCtx(); this.sfxGain.gain.value = Math.max(0, Math.min(1, v)); }

	setSoundtrackMode(mode){ this.mode = (mode === 'retro' || mode === 'off') ? mode : 'synth'; }

	beep({ duration = 0.06, frequency = 600, type = 'square', volume = 0.2, decay = 0.015 } = {}) {
		this._runAfterUnlock(() => {
			const ctx = this.ctx;
			const now = ctx.currentTime;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = type;
			osc.frequency.setValueAtTime(frequency, now);
			gain.gain.setValueAtTime(volume, now);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + decay);
			osc.connect(gain).connect(this.sfxGain);
			osc.start(now);
			osc.stop(now + duration + decay);
		});
	}

	shoot() { this.beep({ duration: 0.04, frequency: 280, type: 'square', volume: 0.25, decay: 0.03 }); }
	hit() { this.beep({ duration: 0.03, frequency: 900, type: 'sine', volume: 0.18, decay: 0.02 }); }
	reload() { this.beep({ duration: 0.05, frequency: 220, type: 'triangle', volume: 0.2, decay: 0.03 }); setTimeout(() => this.beep({ duration: 0.05, frequency: 320, type: 'triangle', volume: 0.2, decay: 0.03 }), 160); }
	click() { this.beep({ duration: 0.02, frequency: 120, type: 'square', volume: 0.14, decay: 0.02 }); }
	playerHurt() { this.beep({ duration: 0.06, frequency: 140, type: 'sawtooth', volume: 0.22, decay: 0.04 }); }

	// Peluru melintas (whizz) dan ricochet sederhana
	whizz() { this.beep({ duration: 0.06, frequency: 900, type: 'sine', volume: 0.15, decay: 0.05 }); }
	ricochet() { this.beep({ duration: 0.04, frequency: 1200, type: 'triangle', volume: 0.18, decay: 0.05 }); }

	// SFX summon/emerge ally: whoosh + chime
	summon(){
		this._runAfterUnlock(()=>{
			const ctx = this.ctx; this.ensureCtx(); const now = ctx.currentTime;
			// whoosh (bandpass noise naik)
			const noise = ctx.createBufferSource(); noise.buffer = this._getNoiseBuffer();
			const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.setValueAtTime(200, now); bp.frequency.exponentialRampToValueAtTime(1200, now+0.25);
			const g = ctx.createGain(); g.gain.setValueAtTime(0.001, now); g.gain.exponentialRampToValueAtTime(0.5, now+0.04); g.gain.exponentialRampToValueAtTime(0.0001, now+0.35);
			noise.connect(bp).connect(g).connect(this.sfxGain); noise.start(now); noise.stop(now+0.36);
			// chime
			const osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.setValueAtTime(800, now+0.05); osc.frequency.exponentialRampToValueAtTime(1600, now+0.18);
			const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.001, now+0.05); g2.gain.exponentialRampToValueAtTime(0.3, now+0.08); g2.gain.exponentialRampToValueAtTime(0.0001, now+0.4);
			osc.connect(g2).connect(this.sfxGain); osc.start(now+0.05); osc.stop(now+0.42);
		});
	}

	// SFX Ledakan: layer noise burst (crack), low boom, tail
	explosion({ volume = 1.0 } = {}){
		this._runAfterUnlock(() => {
			const ctx = this.ctx; this.ensureCtx();
			const master = ctx.createGain(); master.gain.value = Math.max(0, Math.min(1, volume)); master.connect(this.sfxGain);
			const now = ctx.currentTime;
			// white noise burst + filter
			const noiseBuf = this._getNoiseBuffer();
			const noise = ctx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = false;
			const nGain = ctx.createGain(); nGain.gain.setValueAtTime(0.8, now); nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
			const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(1200, now);
			noise.connect(hp).connect(nGain).connect(master);
			noise.start(now); noise.stop(now + 0.3);
			// low boom (sub)
			const boom = ctx.createOscillator(); boom.type = 'sine'; boom.frequency.setValueAtTime(70, now);
			const bGain = ctx.createGain(); bGain.gain.setValueAtTime(0.001, now); bGain.gain.exponentialRampToValueAtTime(0.9, now + 0.02); bGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
			const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(240, now);
			boom.connect(lp).connect(bGain).connect(master); boom.start(now); boom.stop(now + 1.05);
			// tail rumble (bandpass noise)
			const tail = ctx.createBufferSource(); tail.buffer = noiseBuf;
			const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(260, now); bp.Q.value = 0.6;
			const tGain = ctx.createGain(); tGain.gain.setValueAtTime(0.4, now + 0.04); tGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
			tail.connect(bp).connect(tGain).connect(master); tail.start(now); tail.stop(now + 1.25);
			// auto cleanup
			setTimeout(()=>{ try{ master.disconnect(); }catch(e){} }, 1400);
		});
	}

	_getNoiseBuffer(){
		this.ensureCtx();
		if (this._noiseBuffer) return this._noiseBuffer;
		const ctx = this.ctx; const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i=0;i<data.length;i++){ data[i] = Math.random()*2 - 1; }
		this._noiseBuffer = buffer; return buffer;
	}

	menuHover() { this.beep({ duration: 0.03, frequency: 760, type: 'sine', volume: 0.12, decay: 0.02 }); }
	menuClick() { this.beep({ duration: 0.05, frequency: 420, type: 'triangle', volume: 0.18, decay: 0.03 }); }

	startMenuBgm() {
		this._runAfterUnlock(() => {
			this.ensureCtx();
			if (this._started || this.mode === 'off') return;
			this._started = true;
			const ctx = this.ctx;
			this.bgmGain = ctx.createGain();
			this.bgmGain.gain.value = 0.0;
			this.bgmGain.connect(this.masterGain);
			let osc1, osc2, lfo, lfoGain, lp;
			if (this.mode === 'retro') {
				osc1 = ctx.createOscillator(); osc1.type = 'square'; osc1.frequency.value = 100;
				osc2 = ctx.createOscillator(); osc2.type = 'square'; osc2.frequency.value = 200;
				lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 0.08;
				lfoGain = ctx.createGain(); lfoGain.gain.value = 4;
				lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
			} else {
				osc1 = ctx.createOscillator(); osc1.type = 'sine'; osc1.frequency.value = 110; // synth
				osc2 = ctx.createOscillator(); osc2.type = 'sawtooth'; osc2.frequency.value = 220;
				lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.1;
				lfoGain = ctx.createGain(); lfoGain.gain.value = 6; // detune range
				lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
			}
			lfo.connect(lfoGain); lfoGain.connect(osc2.detune);
			osc1.connect(lp); osc2.connect(lp); lp.connect(this.bgmGain);
			osc1.start(); osc2.start(); lfo.start();
			this.bgmNodes = [osc1, osc2, lfo, lfoGain, lp];
			// fade in
			this.bgmGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 1.2);
		});
	}

	startGameBgm() {
		this._runAfterUnlock(() => {
			this.ensureCtx();
			this.stopBgm(false);
			if (this.mode === 'off') return;
			const ctx = this.ctx;
			this.bgmGain = ctx.createGain();
			this.bgmGain.gain.value = 0.0; this.bgmGain.connect(this.masterGain);
			let osc, lfo, lfoGain, lp;
			if (this.mode === 'retro') {
				osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 140;
				lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.3;
				lfoGain = ctx.createGain(); lfoGain.gain.value = 8;
				lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1000;
			} else {
				osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 180;
				lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.2;
				lfoGain = ctx.createGain(); lfoGain.gain.value = 12;
				lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
			}
			lfo.connect(lfoGain); lfoGain.connect(osc.detune);
			osc.connect(lp); lp.connect(this.bgmGain);
			osc.start(); lfo.start();
			this.bgmNodes = [osc, lfo, lfoGain, lp];
			this.bgmGain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 1.0);
		});
	}

	stopBgm(fade = true) {
		if (!this.ctx || !this.bgmGain) return;
		const ctx = this.ctx;
		if (fade) this.bgmGain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.6); else this.bgmGain.gain.value = 0.0;
		setTimeout(() => {
			this.bgmNodes.forEach(n => { try { n.stop && n.stop(); n.disconnect && n.disconnect(); } catch(e){} });
			this.bgmNodes = [];
			try { this.bgmGain && this.bgmGain.disconnect && this.bgmGain.disconnect(); } catch(e) {}
			this.bgmGain = null;
			this._started = false;
		}, fade ? 650 : 0);
	}
} 