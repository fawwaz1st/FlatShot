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
		this._bgmTarget = 0.12;
		this._samples = {}; // name -> AudioBuffer
		this._bgmSource = null; // AudioBufferSourceNode for file-based BGM
		this._loopSamples = {}; // name -> { src, gain }
		this._inGameQuietMode = true; // Default: quieter in-game mode enabled by default
		// tambahan: flag untuk menonaktifkan semua layer noise/samples berbasis noise
		this._disableNoise = true; // true => total mute noise layers (sesuai permintaan pengguna)
		// restore persisted preference jika tersedia
		try { const v = (typeof localStorage !== 'undefined') ? localStorage.getItem('inGameQuietMode') : null; if (v !== null) { this._inGameQuietMode = (v === '1' || v === 'true'); } } catch(_) {}
		// per-sample playback control to avoid stacking identical sounds
		this._lastSampleTime = {}; // name -> last played ctx.currentTime
		this._sampleInstances = {}; // name -> concurrent playing instances
		this._sampleMinInterval = {
			'gunshot': 0.08,
			'explosion': 0.35,
			'footstep': 0.05,
			'pickup': 0.08,
			'reload': 0.12,
			'hit': 0.04,
			'spawn': 0.18,
			'death': 0.3
		};
		// per-sample priority map (higher => important)
		this._samplePriority = {
			'explosion': 10,
			'gunshot': 9,
			'headshot': 8,
			'hit': 7,
			'reload': 5,
			'pickup': 4,
			'footstep': 3,
			'spawn': 5,
			'death': 6,
			'pick': 6
		};

		// synth concurrency control: limit heavy oscillator/noise-based SFX
		this._concurrentSynth = 0;
		this._maxConcurrentSynth = 3;
	}

	ensureCtx() {
		if (!this.ctx) {
			this.ctx = new (window.AudioContext || window.webkitAudioContext)();
			this.masterGain = this.ctx.createGain();
			this.masterGain.gain.value = 1.0;
			this.masterGain.connect(this.ctx.destination);
			this.sfxGain = this.ctx.createGain();
			// Lower default SFX master to reduce overall noise
			this.sfxGain.gain.value = 0.72; // safety - reduce overall SFX input
			// global mild lowpass to reduce high-frequency hiss on combined SFX
			try {
				this.sfxLowpass = this.ctx.createBiquadFilter(); this.sfxLowpass.type = 'lowpass';
				// more aggressive default lowpass to tame hiss / crackle
				this.sfxLowpass.frequency.value = 7000;
				this.sfxLimiter = this.ctx.createDynamicsCompressor();
				// tighten compressor/limiter to act more aggressively on peaks
				this.sfxLimiter.threshold.setValueAtTime(-24, this.ctx.currentTime);
				this.sfxLimiter.knee.setValueAtTime(4, this.ctx.currentTime);
				this.sfxLimiter.ratio.setValueAtTime(8, this.ctx.currentTime);
				this.sfxLimiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
				this.sfxLimiter.release.setValueAtTime(0.12, this.ctx.currentTime);
				// create gate and route: sfxGain -> gate -> lowpass -> limiter -> masterGain
				this.sfxGate = this.ctx.createGain(); this.sfxGate.gain.value = 1.0; // used as gate multiplier
				this.sfxGain.connect(this.sfxGate);
				this.sfxGate.connect(this.sfxLowpass);
				this.sfxLowpass.connect(this.sfxLimiter);
				this.sfxLimiter.connect(this.masterGain);
				// implement gate using a script processor fallback (AudioWorklet not assumed)
				// create BGM highpass filter to allow cutting sub-bass rumble when needed
				try {
					this.bgmHighpass = this.ctx.createBiquadFilter(); this.bgmHighpass.type = 'highpass'; this.bgmHighpass.frequency.value = 20; // default low cut
					this.bgmHighpass.connect(this.masterGain);
				} catch(e) { /* ignore */ }
			} catch(e) {
				// fallback if compressor unavailable: sfxGain -> lowpass -> master
				this.sfxGain.connect(this.sfxLowpass);
				this.sfxLowpass.connect(this.masterGain);
			}
			// NOTE: do NOT connect sfxGain directly to masterGain here — connection set above
			// maintain a small pool counter to limit concurrent heavy SFX
			this._concurrentSfx = 0;
			this._maxConcurrentSfx = 5; // cap concurrent complex SFX to avoid clipping/noise
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

	// load audio sample from url and store by name
	async loadSample(name, url){
		this.ensureCtx();
		try {
			const resp = await fetch(url, { cache: 'no-cache' });
			if (!resp || !resp.ok) {
				// file not present or server error -> return null so caller can fallback to synth
				return null;
			}
			const ab = await resp.arrayBuffer();
			// decodeAudioData uses callbacks in some browsers; wrap in Promise for safety
			const buf = await new Promise((resolve, reject) => {
				try { this.ctx.decodeAudioData(ab, resolve, reject); } catch(e) { reject(e); }
			});
			this._samples[name] = buf;
			return buf;
		} catch (e) { return null; }
	}

	// play a loaded sample; options: volume, position {x,y,z}, loop
	playSample(name, { volume = 1.0, position = null, loop = false } = {}){
		this._runAfterUnlock(()=>{
			try {
				if (!this.ctx) return;
				const buf = this._samples[name];
				if (!buf) return; // not loaded => fallback to synth
				// if too many concurrent SFX, drop low-priority sounds or reduce volume
				if (this._concurrentSfx >= this._maxConcurrentSfx) {
					const pr = (this._samplePriority && this._samplePriority[name]) ? this._samplePriority[name] : 1;
					if (pr < 6) {
						// skip playing to avoid piling noise
						return;
					} else {
						// reduce volume for mid/high priority when overloaded
						volume = volume * 0.65;
					}
				}
				// per-sample cooldown: avoid rapid stacking of identical samples
				const now = this.ctx.currentTime || 0;
				const last = this._lastSampleTime[name] || 0;
				const minInt = (this._sampleMinInterval && this._sampleMinInterval[name]) ? this._sampleMinInterval[name] : 0.03;
				if (now - last < minInt) {
					// if too close, reduce loudness or drop when already many instances
					if ((this._sampleInstances[name] || 0) >= 2) return; // drop excessive duplicates quickly
					volume = volume * 0.45; // lower the volume of rapid repeats
				}
				this._lastSampleTime[name] = now;
				this._sampleInstances[name] = (this._sampleInstances[name] || 0) + 1;
				// limit concurrent heavy samples to avoid noise and clipping
				// re-check: if still over limit, be more aggressive
				if (this._concurrentSfx >= this._maxConcurrentSfx) {
					volume = volume * 0.5;
				}
				this._concurrentSfx++;
				const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = !!loop;
				const gain = this.ctx.createGain(); gain.gain.value = Math.max(0, Math.min(1, volume));
				// small random pitch variation to make repeated SFX feel less robotic
				try { src.playbackRate.value = 0.96 + Math.random() * 0.08; } catch(_) {}
				src.connect(gain);
				// spatial panner if position provided
				if (position && this.ctx.createPanner) {
					const p = this.ctx.createPanner();
					p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1; p.maxDistance = 500; p.rolloffFactor = 1;
					p.setPosition(position.x, position.y, position.z);
					gain.connect(p).connect(this.sfxGain);
				} else {
					gain.connect(this.sfxGain);
				}
				src.start();
				// schedule stop and decrement concurrent counter
				if (!loop) setTimeout(()=>{ try{ src.stop(); }catch(_){} try{ this._concurrentSfx = Math.max(0, this._concurrentSfx-1); }catch(_){} try{ this._sampleInstances[name] = Math.max(0, (this._sampleInstances[name]||1)-1); }catch(_){} }, (buf.duration+0.05)*1000);
			} catch(_){ try{ this._concurrentSfx = Math.max(0, this._concurrentSfx-1); }catch(_){} }
		});
	}

	// play a sample in loop and keep reference so it can be stopped later
	playLoopSample(name, { volume = 1.0, position = null, fadeInMs = 600 } = {}){
		this._runAfterUnlock(()=>{
			try {
				if (!this.ctx) return;
				const buf = this._samples[name];
				if (!buf) return;
				// stop existing with same name
				this.stopLoopSample(name, 0);
				const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
				const gain = this.ctx.createGain();
				// start at 0 if fading in
				const startVol = (fadeInMs && fadeInMs > 0) ? 0.0 : Math.max(0, Math.min(1, volume));
				gain.gain.setValueAtTime(startVol, this.ctx.currentTime);
				src.connect(gain);
				if (position && this.ctx.createPanner) {
					const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1; p.maxDistance = 500; p.rolloffFactor = 1;
					p.setPosition(position.x, position.y, position.z);
					gain.connect(p).connect(this.bgmGain || this.masterGain);
				} else {
					gain.connect(this.bgmGain || this.masterGain);
				}
				src.start();
				// store original requested volume so quiet mode can scale it later
				const stored = { src, gain, originalVolume: Math.max(0, Math.min(1, volume)) };
				this._loopSamples[name] = stored;
				// schedule fade in if requested
				if (fadeInMs && fadeInMs > 0) {
					try { gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime + (fadeInMs/1000)); } catch(_){ }
				}
			} catch(_) {}
		});
	}

	stopLoopSample(name, fadeOutMs = 600){
		this._runAfterUnlock(()=>{
			try {
				const entry = this._loopSamples && this._loopSamples[name];
				if (!entry) return;
				try {
					const now = this.ctx.currentTime;
					if (fadeOutMs && fadeOutMs > 0) {
						entry.gain.gain.cancelScheduledValues(now);
						entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
						entry.gain.gain.linearRampToValueAtTime(0.0001, now + (fadeOutMs/1000));
						setTimeout(()=>{ try{ entry.src.stop(); }catch(_){} try{ entry.gain.disconnect(); }catch(_){} delete this._loopSamples[name]; }, fadeOutMs + 60);
					} else {
						try{ entry.src.stop(); }catch(_){}
						try{ entry.gain.disconnect(); }catch(_){}
						delete this._loopSamples[name];
					}
				} catch(_) { try{ entry.src.stop(); }catch(_){} delete this._loopSamples[name]; }
			} catch(_) {}
		});
	}

	// play BGM from audio file (looping)
	async playBgmFile(url){
		this._runAfterUnlock(async ()=>{
			try {
				this.ensureCtx();
				// jika noise dinonaktifkan, jangan mulai file BGM sama sekali
				if (this._disableNoise) return;
				if (this._bgmSource) try{ this._bgmSource.stop(); this._bgmSource.disconnect(); }catch(_){ }
				const resp = await fetch(url, { cache: 'no-cache' });
				if (!resp || !resp.ok) return;
				const ab = await resp.arrayBuffer();
				const buf = await new Promise((resolve, reject) => { try { this.ctx.decodeAudioData(ab, resolve, reject); } catch(e){ reject(e); } });
				const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
				this.bgmGain = this.bgmGain || this.ctx.createGain(); this.bgmGain.connect(this.masterGain);
				this.bgmGain.gain.value = 0.0; src.connect(this.bgmGain);
				src.start(); this._bgmSource = src;
				// respect quiet mode when setting initial target
				this._bgmTarget = this._inGameQuietMode ? 0.06 : 0.12;
				this.bgmGain.gain.linearRampToValueAtTime(this._bgmTarget, this.ctx.currentTime + 1.0);
			} catch (e) { /* ignore playback failure */ }
		});
	}

	setMasterVolume(v) { this.ensureCtx(); this.masterGain.gain.value = Math.max(0, Math.min(1, v)); }
	setMusicVolume(v) { this.ensureCtx(); if (this.bgmGain) { this.bgmGain.gain.value = Math.max(0, Math.min(1, v)); } this._bgmTarget = Math.max(0, Math.min(1, v)); }
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

	// Gunshot berlapis: click + noise burst (bandpass) + low thump
	shoot() {
		this._runAfterUnlock(() => {
			const ctx = this.ctx; this.ensureCtx();
			const now = ctx.currentTime;
			// throttling synth-heavy SFX to avoid accumulated noise
			const synthScale = (this._concurrentSynth >= this._maxConcurrentSynth) ? 0.45 : 1.0;
			if (synthScale === 1.0) this._concurrentSynth++;
			const master = ctx.createGain(); master.gain.value = 1.0 * synthScale; master.connect(this.sfxGain);
			// CLICK awal
			const click = ctx.createOscillator(); click.type='triangle';
			const cGain = ctx.createGain(); cGain.gain.setValueAtTime(0.12 * synthScale, now); cGain.gain.exponentialRampToValueAtTime(0.0001, now+0.03);
			click.frequency.setValueAtTime(420 + (Math.random()*40-20), now);
			click.connect(cGain).connect(master);
			click.start(now); click.stop(now+0.035);
			// NOISE burst (crack) melalui bandpass — skip jika noise dinonaktifkan
			if (!this._disableNoise) {
				const noiseBuf = this._getNoiseBuffer();
				const noise = ctx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = false;
				const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.setValueAtTime(1800 + Math.random()*500, now); bp.Q.value = 0.9;
				const nGain = ctx.createGain();
				// use tiny attack to avoid clicks and slightly lower peak to prevent clipping
				nGain.gain.setValueAtTime(0.0001, now);
				nGain.gain.linearRampToValueAtTime(0.35 * synthScale, now + 0.008);
				nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
				noise.connect(bp).connect(nGain).connect(master);
				noise.start(now); noise.stop(now + 0.14);
			}
			// LOW THUMP singkat
			const thump = ctx.createOscillator(); thump.type='sine'; thump.frequency.setValueAtTime(120 + Math.random()*20, now);
			const tGain = ctx.createGain(); tGain.gain.setValueAtTime(0.0001, now); tGain.gain.exponentialRampToValueAtTime(0.28 * synthScale, now + 0.015); tGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
			thump.connect(tGain).connect(master);
			thump.start(now); thump.stop(now + 0.2);
			// try sample first
			if (this._samples['gunshot']) { try { this.playSample('gunshot', { volume: 0.9 }); } catch(_) {} }
			// auto cleanup and synth concurrency release
			setTimeout(()=>{ try{ master.disconnect(); }catch(e){} try { if (synthScale === 1.0) this._concurrentSynth = Math.max(0, this._concurrentSynth - 1); } catch(_){} }, 220);
		});
	}

	// SFX weapon switch: short whoosh + soft click
	weaponSwitch(){
		this._runAfterUnlock(()=>{
			const ctx = this.ctx; const now = ctx.currentTime;
			// whoosh via bandpass noise sweep — skip if noise disabled
			if (!this._disableNoise) {
				const noise = ctx.createBufferSource(); noise.buffer = this._getNoiseBuffer();
				const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.setValueAtTime(300, now); bp.frequency.exponentialRampToValueAtTime(1400, now+0.16);
				const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.4, now+0.03); g.gain.exponentialRampToValueAtTime(0.0001, now+0.22);
				noise.connect(bp).connect(g).connect(this.sfxGain); noise.start(now); noise.stop(now+0.24);
			}
			// soft click at end
			const osc = ctx.createOscillator(); osc.type='square'; osc.frequency.setValueAtTime(320, now+0.16);
			const cg = ctx.createGain(); cg.gain.setValueAtTime(0.18, now+0.16); cg.gain.exponentialRampToValueAtTime(0.0001, now+0.22);
			osc.connect(cg).connect(this.sfxGain); osc.start(now+0.16); osc.stop(now+0.23);
		});
	}

	headshot(){ this.beep({ duration: 0.05, frequency: 1400, type: 'square', volume: 0.28, decay: 0.04 }); }
	footstep({ run=false }={}){ this.beep({ duration: 0.02, frequency: run?160:120, type: 'triangle', volume: run?0.18:0.12, decay: 0.02 }); }
	powerup(){ this.beep({ duration: 0.08, frequency: 900, type: 'sine', volume: 0.22, decay: 0.06 }); }
	streak(){ this.beep({ duration: 0.06, frequency: 680, type: 'sawtooth', volume: 0.22, decay: 0.05 }); }

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
			// whoosh (bandpass noise naik) — skip if noise disabled
			if (!this._disableNoise) {
				const noise = ctx.createBufferSource(); noise.buffer = this._getNoiseBuffer();
				const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.setValueAtTime(200, now); bp.frequency.exponentialRampToValueAtTime(1200, now+0.25);
				const g = ctx.createGain(); g.gain.setValueAtTime(0.001, now); g.gain.exponentialRampToValueAtTime(0.5, now+0.04); g.gain.exponentialRampToValueAtTime(0.0001, now+0.35);
				noise.connect(bp).connect(g).connect(this.sfxGain); noise.start(now); noise.stop(now+0.36);
			}
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
			// throttle heavy explosion synths
			const synthScale = (this._concurrentSynth >= this._maxConcurrentSynth) ? 0.45 : 1.0;
			if (synthScale === 1.0) this._concurrentSynth++;
			// if in-game noisy mode, slightly reduce high band and lower overall
			const reduceHigh = (this._inGameQuietMode?0.7:1.0);
			const master = ctx.createGain(); master.gain.value = Math.max(0, Math.min(1, volume * 1.1 * reduceHigh * synthScale)); master.connect(this.sfxGain);
			const now = ctx.currentTime;
			// white noise burst + filter — skip if noise disabled
			if (!this._disableNoise) {
				const noiseBuf = this._getNoiseBuffer();
				const noise = ctx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = false;
				const nGain = ctx.createGain();
				// gentle attack to avoid harsh transient and lower peak
				nGain.gain.setValueAtTime(0.0001, now);
				nGain.gain.linearRampToValueAtTime(0.14 * reduceHigh * synthScale, now + 0.008);
				nGain.gain.exponentialRampToValueAtTime(0.00035, now + 0.28);
				const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(900 * reduceHigh, now);
				const lpNoise = ctx.createBiquadFilter(); lpNoise.type = 'lowpass'; lpNoise.frequency.setValueAtTime(4200 * reduceHigh, now);
				noise.connect(hp).connect(lpNoise).connect(nGain).connect(master);
				noise.start(now); noise.stop(now + 0.36);
			}
			// low boom (sub) — lebih kuat dengan pitch drop
			const boom = ctx.createOscillator(); boom.type = 'sine'; boom.frequency.setValueAtTime(120, now);
			const bGain = ctx.createGain(); bGain.gain.setValueAtTime(0.0001, now); bGain.gain.exponentialRampToValueAtTime(0.85 * reduceHigh * synthScale, now + 0.02); bGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
			const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(260, now);
			boom.connect(lp).connect(bGain).connect(master); boom.start(now); boom.frequency.exponentialRampToValueAtTime(60, now + 0.28); boom.stop(now + 1.6);
			// tail rumble (bandpass noise)
			if (!this._disableNoise) {
				const tail = ctx.createBufferSource(); tail.buffer = this._getNoiseBuffer();
				const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(260, now); bp.Q.value = 0.6;
				const tGain = ctx.createGain(); tGain.gain.setValueAtTime(0.09 * reduceHigh * synthScale, now + 0.02); tGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
				tail.connect(bp).connect(tGain).connect(master); tail.start(now); tail.stop(now + 1.8);
			}
			// more metallic shard clinks with panning and richness
			for (let i=0;i<6;i++){
				const clk = ctx.createOscillator(); clk.type='triangle'; clk.frequency.setValueAtTime(1200 + Math.random()*1400, now + 0.01*i);
				const ck = ctx.createGain(); ck.gain.setValueAtTime(0.0001, now + 0.01*i); ck.gain.linearRampToValueAtTime(0.04, now + 0.01*i + 0.006); ck.gain.exponentialRampToValueAtTime(0.0001, now + 0.18 + 0.02*i);
				try { clk.frequency.setValueAtTime( (1200 + Math.random()*1400) * (1 + (Math.random()-0.5)*0.06), now + 0.01*i); } catch(_) {}
				// small stereo detune via slightly altered playbackRate
				try { clk.detune && clk.detune.setValueAtTime((Math.random()-0.5)*40, now + 0.01*i); } catch(_){}
				clk.connect(ck).connect(master);
				clk.start(now + 0.01*i); clk.stop(now + 0.18 + 0.02*i);
			}
			// if sample exists play with controlled volume and stronger presence
			if (this._samples['explosion']) { try { this.playSample('explosion', { volume: Math.min(1.0, volume * 1.0) }); } catch(_) {} }
			setTimeout(()=>{ try{ master.disconnect(); }catch(e){} try { if (synthScale === 1.0) this._concurrentSynth = Math.max(0, this._concurrentSynth - 1); } catch(_){} }, 1800);
		});
	}

	_getNoiseBuffer(){
		this.ensureCtx();
		if (this._noiseBuffer) return this._noiseBuffer;
		const ctx = this.ctx; const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		// jika noise dinonaktifkan, kembalikan buffer sangat tenang (nyaris nol)
		if (this._disableNoise) {
			for (let i=0;i<data.length;i++){ data[i] = 0.0; }
			this._noiseBuffer = buffer; return buffer;
		}
		// even lower base noise amplitude and apply gentle envelope to reduce high-frequency artifacts
		for (let i=0;i<data.length;i++){ const t = i / data.length; const env = Math.pow(Math.sin(Math.PI * t), 0.5); data[i] = (Math.random()*2 - 1) * 0.02 * env; }
		this._noiseBuffer = buffer; return buffer;
	}

	// Generate simple synthetic samples (fallback if real files unavailable)
	synthesizeSample(name){
		this.ensureCtx();
		try {
			const sr = this.ctx.sampleRate;
			let length = Math.floor(sr * 1.2);
			let buf = this.ctx.createBuffer(1, length, sr);
			let data = buf.getChannelData(0);
			if (name === 'gunshot'){
				// short noise burst + exponential decay
				for (let i=0;i<length;i++){ const t=i/sr; const env = Math.exp(-t*40); data[i] = (Math.random()*2-1)*env; }
			} else if (name === 'explosion'){
				// longer noise with lowpass (approx)
				for (let i=0;i<length;i++){ const t=i/sr; const env = Math.exp(-t*3); data[i] = (Math.random()*2-1)*env; }
			} else if (name === 'hit'){
				for (let i=0;i<Math.floor(sr*0.12);i++){ data[i] = Math.sin(2*Math.PI*1200*(i/sr)) * Math.exp(-i/(sr*0.02)); }
			} else if (name === 'footstep'){
				for (let i=0;i<Math.floor(sr*0.14);i++){ data[i] = Math.sin(2*Math.PI*200*(i/sr)) * Math.exp(-i/(sr*0.06)) + (Math.random()*2-1)*0.02; }
			} else if (name === 'spawn') {
				for (let i=0;i<Math.floor(sr*0.26);i++){ const t=i/sr; const env = Math.exp(-t*8); data[i] = Math.sin(2*Math.PI*340*(i/sr)) * env + (Math.random()*2-1)*0.12 * env; }
			} else if (name === 'death' || name === 'enemy_die') {
				for (let i=0;i<Math.floor(sr*0.9);i++){ const t=i/sr; const env = Math.exp(-t*2.2); data[i] = (Math.random()*2-1) * env * 0.9; }
			} else if (name === 'pickup') {
				for (let i=0;i<Math.floor(sr*0.18);i++){ const t=i/sr; data[i] = Math.sin(2*Math.PI*(800+Math.random()*320)*(i/sr)) * Math.exp(-t*10); }
			} else if (name === 'reload') {
				for (let i=0;i<Math.floor(sr*0.26);i++){ const t=i/sr; data[i] = Math.sin(2*Math.PI*(220+Math.random()*120)*(i/sr)) * Math.exp(-t*6) + (Math.random()*2-1)*0.03; }
			} else if (name === 'bgm_loop'){
				length = Math.floor(sr * 6.0);
				buf = this.ctx.createBuffer(1, length, sr); data = buf.getChannelData(0);
				for (let i=0;i<length;i++){ const t=i/sr; const a = 0.12 * Math.sin(2*Math.PI*110*t) + 0.07*Math.sin(2*Math.PI*220*t); data[i] = a * 0.6; }
			} else if (name === 'pick') {
				length = Math.floor(sr * 0.18);
				buf = this.ctx.createBuffer(1, length, sr); data = buf.getChannelData(0);
				for (let i=0;i<length;i++){ const t=i/sr; data[i] = Math.sin(2*Math.PI*(800+Math.random()*320)*(i/sr)) * Math.exp(-t*10); }
			} else {
				for (let i=0;i<length;i++){ data[i] = Math.random()*2-1; }
			}
			this._samples[name] = buf;
			return buf;
		} catch(e){ return null; }
	}

	menuHover() {
		this._runAfterUnlock(() => {
			this.beep({ duration: 0.03, frequency: 760, type: 'sine', volume: 0.12, decay: 0.02 });
		});
	}
	menuClick() {
		this._runAfterUnlock(() => {
			this.beep({ duration: 0.05, frequency: 420, type: 'triangle', volume: 0.18, decay: 0.03 });
		});
	}

	startMenuBgm() {
		this._runAfterUnlock(() => {
			this.ensureCtx();
            // jika noise dinonaktifkan, jangan buat oscillator BGM sama sekali (menghilangkan hum/continuous tone)
            if (this._disableNoise) {
                try {
                    this._started = true;
                    // hentikan BGM yang sedang berjalan dan loopSamples untuk memastikan tidak ada suara
                    try { this.stopBgm(true); } catch(_) {}
                    try { for (const k of Object.keys(this._loopSamples || {})) { try { this.stopLoopSample(k,0); } catch(_){} } } catch(_){}
                    this.bgmGain = this.ctx.createGain();
                    this.bgmGain.gain.value = 0.0;
                    this.bgmGain.connect(this.masterGain);
                    this.bgmNodes = [];
                } catch(_) {}
                return;
            }
			if (this._started || this.mode === 'off') return;
			this._started = true;
			const ctx = this.ctx;
			this.bgmGain = ctx.createGain();
			this.bgmGain.gain.value = 0.0;
			this.bgmGain.connect(this.masterGain);
			// pad layer + secondary detuned oscillator + sub bass + slow noise pad
			const pad1 = ctx.createOscillator(); pad1.type = (this.mode==='retro'?'square':'sine'); pad1.frequency.value = 90;
			const pad2 = ctx.createOscillator(); pad2.type = 'sawtooth'; pad2.frequency.value = 180;
			const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 40;
			const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.08;
			const lfoGain = ctx.createGain(); lfoGain.gain.value = 6;
			// gentle lowpass for pad
			const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = (this.mode==='retro'?800:600);
			// slight detune via lfo to pad2 detune
			lfo.connect(lfoGain); lfoGain.connect(pad2.detune);
			pad1.connect(lp); pad2.connect(lp); lp.connect(this.bgmGain);
			sub.connect(this.bgmGain);
			// ambient noise layer using generated noise buffer — only create if noise enabled
			try {
				if (!this._disableNoise) {
					const noiseBuf = this._getNoiseBuffer();
					const noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = noiseBuf; noiseSrc.loop = true;
					const noiseFilter = ctx.createBiquadFilter(); noiseFilter.type='lowpass'; noiseFilter.frequency.value = 1200;
					// disable ambient noise by default to remove background hiss (can be re-enabled via settings)
					const ambientDefault = 0.0;
					const noiseGain = ctx.createGain(); noiseGain.gain.value = ambientDefault;
					noiseSrc.connect(noiseFilter).connect(noiseGain).connect(this.bgmGain);
					// (ambientDefault already set appropriately)
					noiseSrc.start();
					// create controllable gains for pads/sub so we can mute ambient parts
					const pad1Gain = ctx.createGain(); pad1Gain.gain.value = 0.12;
					const pad2Gain = ctx.createGain(); pad2Gain.gain.value = 0.07;
					const subGain = ctx.createGain(); subGain.gain.value = 0.18;
					pad1.connect(pad1Gain); pad2.connect(pad2Gain);
					pad1Gain.connect(lp); pad2Gain.connect(lp); lp.connect(this.bgmGain);
					sub.connect(subGain); subGain.connect(this.bgmGain);
					this.bgmNodes = [pad1, pad2, sub, lfo, lfoGain, lp, pad1Gain, pad2Gain, subGain, noiseSrc, noiseFilter, noiseGain];
				} else {
					const pad1Gain = ctx.createGain(); pad1Gain.gain.value = 0.0;
					const pad2Gain = ctx.createGain(); pad2Gain.gain.value = 0.0;
					const subGain = ctx.createGain(); subGain.gain.value = 0.0;
					pad1.connect(pad1Gain); pad2.connect(pad2Gain);
					pad1Gain.connect(lp); pad2Gain.connect(lp); lp.connect(this.bgmGain);
					sub.connect(subGain); subGain.connect(this.bgmGain);
					this.bgmNodes = [pad1, pad2, sub, lfo, lfoGain, lp, pad1Gain, pad2Gain, subGain];
				}
			} catch(e) {
				this.bgmNodes = [pad1, pad2, sub, lfo, lfoGain, lp];
			}
			pad1.start(); pad2.start(); sub.start(); lfo.start();
			// lower target when quiet mode enabled to reduce ambience
			this._bgmTarget = this._inGameQuietMode ? 0.12 : 0.20;
			this.bgmGain.gain.linearRampToValueAtTime(this._bgmTarget, ctx.currentTime + 1.2);
		});
	}

	startGameBgm() {
		this._runAfterUnlock(() => {
			this.ensureCtx();
			// jika noise dinonaktifkan, jangan buat oscillator BGM sama sekali
			if (this._disableNoise) {
				try {
					this._started = true;
					try { this.stopBgm(true); } catch(_) {}
					try { for (const k of Object.keys(this._loopSamples || {})) { try { this.stopLoopSample(k,0); } catch(_){} } } catch(_){}
					this.bgmGain = this.ctx.createGain();
					this.bgmGain.gain.value = 0.0;
					this.bgmGain.connect(this.masterGain);
					this.bgmNodes = [];
				} catch(_) {}
				return;
			}
			this.stopBgm(false);
			if (this.mode === 'off') return;
			const ctx = this.ctx;
			this.bgmGain = ctx.createGain();
			this.bgmGain.gain.value = 0.0; this.bgmGain.connect(this.masterGain);
			// richer game BGM: primary melodic osc + pad + sub + slow noise
			const lead = ctx.createOscillator(); lead.type = (this.mode==='retro'?'square':'triangle'); lead.frequency.value = (this.mode==='retro'?140:180);
			const pad = ctx.createOscillator(); pad.type = 'sine'; pad.frequency.value = (this.mode==='retro'?120:160);
			const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 48;
			const lfo = ctx.createOscillator(); lfo.type='sine'; lfo.frequency.value = 0.18;
			const lfoGain = ctx.createGain(); lfoGain.gain.value = 10;
			const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = (this.mode==='retro'?1000:900);
			lfo.connect(lfoGain); lfoGain.connect(lead.detune);
			lead.connect(lp); pad.connect(lp); lp.connect(this.bgmGain);
			sub.connect(this.bgmGain);
			// subtle noise ambience — only create if noise enabled
			try { if (!this._disableNoise) { const nbuf = this._getNoiseBuffer(); const nsrc = ctx.createBufferSource(); nsrc.buffer = nbuf; nsrc.loop = true; const nf = ctx.createBiquadFilter(); nf.type='lowpass'; nf.frequency.value = 1200; const ng = ctx.createGain(); ng.gain.value = 0.0; nsrc.connect(nf).connect(ng).connect(this.bgmGain); nsrc.start(); this.bgmNodes = [lead, pad, sub, lfo, lfoGain, lp, nsrc, nf, ng]; }
			else { this.bgmNodes = [lead, pad, sub, lfo, lfoGain, lp]; } }
			catch(e) { this.bgmNodes = [lead, pad, sub, lfo, lfoGain, lp]; }
			// create gains for lead/pad/sub in game BGM too
			const leadGain = ctx.createGain(); leadGain.gain.value = 0.14;
			const padGain = ctx.createGain(); padGain.gain.value = 0.12;
			const subGainG = ctx.createGain(); subGainG.gain.value = 0.22;
			lead.connect(leadGain); pad.connect(padGain);
			leadGain.connect(lp); padGain.connect(lp); lp.connect(this.bgmGain);
			sub.connect(subGainG); subGainG.connect(this.bgmGain);
			lead.start(); pad.start(); sub.start(); lfo.start();
			// lower target when quiet mode enabled to reduce ambience
			this._bgmTarget = this._inGameQuietMode ? 0.08 : 0.18;
			// ensure bgmGain routes through highpass
			try { this.bgmGain.disconnect(); this.bgmGain.connect(this.bgmHighpass || this.masterGain); } catch(_){ }
			this.bgmGain.gain.linearRampToValueAtTime(this._bgmTarget, ctx.currentTime + 1.0);
		});
	}

	// Sidechain ducking sederhana pada BGM
	duckBgm(amount = 0.5, durationMs = 140){
		try {
			if (!this.bgmGain) return;
			const ctx = this.ctx; const now = ctx.currentTime;
			const target = Math.max(0, Math.min(1, this._bgmTarget));
			const dip = Math.max(0, Math.min(1, target * amount));
			this.bgmGain.gain.cancelScheduledValues(now);
			this.bgmGain.gain.setValueAtTime(dip, now);
			this.bgmGain.gain.linearRampToValueAtTime(target, now + durationMs/1000);
		} catch(_) {}
	}

	// Restore BGM gently to configured target volume
	restoreBgm(durationMs = 300){
		try {
			if (!this.bgmGain) return;
			const ctx = this.ctx; const now = ctx.currentTime;
			const target = Math.max(0, Math.min(1, this._bgmTarget || 0.12));
			this.bgmGain.gain.cancelScheduledValues(now);
			this.bgmGain.gain.linearRampToValueAtTime(target, now + durationMs/1000);
		} catch(_) {}
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

	// New: toggle quieter in-game mode to reduce ambient noise when player desires
	setInGameQuietMode(v){
		this.ensureCtx();
		this._inGameQuietMode = !!v;
		try {
			// tighten global SFX lowpass and lower gate to remove background hiss
			if (this.sfxLowpass) this.sfxLowpass.frequency.value = this._inGameQuietMode ? 7000 : 9000;
			if (this.sfxGate) this.sfxGate.gain.setValueAtTime(this._inGameQuietMode ? 0.86 : 1.0, this.ctx.currentTime);
			// tighten more when quiet: lower lowpass and close gate stronger
			if (this.sfxLowpass) this.sfxLowpass.frequency.value = this._inGameQuietMode ? 6000 : 8000;
			if (this.sfxGate) this.sfxGate.gain.setValueAtTime(this._inGameQuietMode ? 0.7 : 1.0, this.ctx.currentTime);
			// also reduce subtle bgm noise layers if present
			try {
				if (this.bgmNodes && Array.isArray(this.bgmNodes)) {
					const now = this.ctx.currentTime;
					for (const n of this.bgmNodes) {
						try {
							if (n && n.gain && n.gain.gain && typeof n.gain.gain.value === 'number') {
								const cur = n.gain.gain.value;
								// ambient small gains -> mute completely
								if (cur <= 0.06) {
									n.gain.gain.setValueAtTime(this._inGameQuietMode ? 0.0001 : 0.02, now);
								} else {
									// pads/sub -> reduce strongly when quiet, restore otherwise
									n.gain.gain.setValueAtTime(this._inGameQuietMode ? Math.max(0.001, cur * 0.25) : cur, now);
								}
							}
						} catch(_){ }
					}
				}
			} catch(_){ }
			// raise highpass to cut low rumble aggressively when quiet
			try { if (this.bgmHighpass) this.bgmHighpass.frequency.setValueAtTime(this._inGameQuietMode ? 120 : 20, this.ctx.currentTime); } catch(_){ }
			// adjust any loopSamples (file-based bgm or SFX loops)
			try {
				for (const k of Object.keys(this._loopSamples || {})) {
					const entry = this._loopSamples[k];
					if (!entry || !entry.gain) continue;
					const orig = (typeof entry.originalVolume === 'number') ? entry.originalVolume : entry.gain.gain.value;
					const target = this._inGameQuietMode ? Math.max(0.001, orig * 0.55) : orig;
					try { entry.gain.gain.setValueAtTime(target, this.ctx.currentTime); } catch(_){ }
				}
			} catch(_){ }
		} catch(_){ }
		// persist preference
		try { if (typeof localStorage !== 'undefined') localStorage.setItem('inGameQuietMode', this._inGameQuietMode ? '1' : '0'); } catch(_) {}
	}

	// Aggressive ambient mute: immediately silence BGM/noise layers and optionally restore
	setAmbientMute(mute = true){
		this.ensureCtx();
		try {
			const now = this.ctx.currentTime;
			// mute BGM master gain quickly
			try { if (this.bgmGain) { this.bgmGain.gain.cancelScheduledValues(now); this.bgmGain.gain.setValueAtTime(mute ? 0.0001 : (this._bgmTarget || 0.12), now); } } catch(_){}
			// mute bgmNodes small/ambient gains
			try { if (this.bgmNodes && Array.isArray(this.bgmNodes)) { for (const n of this.bgmNodes) { try { if (n && n.gain && n.gain.gain) { n.gain.gain.setValueAtTime(mute ? 0.0001 : Math.max(0.001, n.gain.gain.value), now); } } catch(_){} } } } catch(_){}
			// mute looped samples
			try { for (const k of Object.keys(this._loopSamples || {})) { const e = this._loopSamples[k]; if (e && e.gain && e.gain.gain) try { e.gain.gain.setValueAtTime(mute ? 0.0001 : (e.originalVolume || 0.1), now); } catch(_){} } } catch(_){}
			// reduce sfx gate to mute low-level SFX noise if requested
			try { if (this.sfxGate) this.sfxGate.gain.setValueAtTime(mute ? 0.0001 : 1.0, now); } catch(_){}
		} catch(_){}
	}

	// countdown-specific clean sine beeps to avoid noisy transients
	countdownBeepStep(step){
		this._runAfterUnlock(()=>{
			try {
				const ctx = this.ctx; this.ensureCtx(); const now = ctx.currentTime;
				let freq = 600;
				switch(step){
					case 3: freq = 560; break;
					case 2: freq = 760; break;
					case 1: freq = 940; break;
					case 0: freq = 1320; break; // final
					default: freq = 760;
				}
				const o = ctx.createOscillator(); const g = ctx.createGain();
				o.type = 'sine';
				o.frequency.setValueAtTime(freq, now);
				// gentle envelope to avoid clicks
				g.gain.setValueAtTime(0.0001, now);
				g.gain.linearRampToValueAtTime(step === 0 ? 0.12 : 0.07, now + 0.008);
				g.gain.exponentialRampToValueAtTime(0.0001, now + (step === 0 ? 0.12 : 0.08));
				o.connect(g).connect(this.sfxGain);
				o.start(now);
				o.stop(now + (step === 0 ? 0.14 : 0.09));
			} catch(_){}
		});
	}

} 