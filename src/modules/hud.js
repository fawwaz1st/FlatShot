export class HUD {
	constructor() {
		// cache DOM references dengan fallback aman
		this.hpEl = document.getElementById('hp') || null;
		this.hpBar = document.getElementById('hpBar') || null;
		this.ammoEl = document.getElementById('ammo') || null;
		this.reserveEl = document.getElementById('reserve') || null;
		this.ammoBar = document.getElementById('ammoBar') || null;
		this.ammoWrap = document.getElementById('ammoWrap') || null;
		this.gWrap = document.getElementById('gWrap') || null;
		this.scoreEl = document.getElementById('score') || null;
		this.alliesEl = document.getElementById('allies') || null;
		this.playTimeEl = document.getElementById('playTime') || null;
		this.waveEl = document.getElementById('wave') || null;
		this.waveTimerEl = document.getElementById('waveTimer') || null;
		this._gameRef = this._gameRef || null;
		// internal cache to avoid DOM churn
		this._lastGrenades = -1;
	}

	// helper lokalization: menerima code bahasa pada game._lang
	localize(game, key) {
		const dict = {
			'id': {
				'wave_fmt': (w, e) => `Gelombang: ${w} — Musuh: ${e}`,
				'timer_fmt': (s) => (s > 0 ? `Mulai dalam: ${s}s` : '')
			},
			'en': {
				'wave_fmt': (w, e) => `Wave ${w} — Enemies: ${e}`,
				'timer_fmt': (s) => (s > 0 ? `Next in: ${s}s` : '')
			}
		};
		const lang = (game && game._lang) ? game._lang : 'id';
		return (dict[lang] && dict[lang][key]) ? dict[lang][key] : ((k) => '');
	}

	setHP(value) {
		const v = Number.isFinite(Number(value)) ? Number(value) : 0;
		if (this.hpEl) this.hpEl.textContent = String(Math.ceil(v));
		if (this.hpBar) {
			const pct = Math.max(0, Math.min(1, v / 100));
			this.hpBar.style.width = (pct * 100) + '%';
			// Dynamic Color
			if (pct < 0.3) this.hpBar.style.background = '#ff0000';
			else if (pct < 0.6) this.hpBar.style.background = '#ffaa00';
			else this.hpBar.style.background = 'linear-gradient(90deg, #ff0000, #ffaa00)';
		}
	}

	setAmmo(inMag, reserve, magSize) {
		const im = Number.isFinite(Number(inMag)) ? Number(inMag) : 0;
		const r = Number.isFinite(Number(reserve)) ? Number(reserve) : 0;
		const mSize = Number.isFinite(Number(magSize)) && magSize > 0 ? Number(magSize) : 1;

		if (this.ammoEl) this.ammoEl.textContent = String(im);
		if (this.reserveEl) this.reserveEl.textContent = String(r);

		// Ammo Bar removed in new design, but kept if needed
		if (this.ammoBar) {
			const pct = Math.max(0, Math.min(1, im / mSize));
			this.ammoBar.style.width = (pct * 100) + '%';
		}
	}

	setScore(score) {
		if (this.scoreEl) this.scoreEl.textContent = String(Number(score) || 0);
	}

	// Compatibility stubs
	setGrenades(c) { }
	setAllies(c) { }
	setPlayTime(s) { }
	setWaveInfo(w, e) { }
	setWaveTimer(s) { }
	setSkillCooldown(s) { }
	setWeapon(n, i) { }
}