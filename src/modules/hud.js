export class HUD {
	constructor() {
		this.hpEl = document.getElementById('hp');
		this.ammoEl = document.getElementById('ammo');
		this.reserveEl = document.getElementById('reserve');
		this.scoreEl = document.getElementById('score');
	}

	setHP(value) {
		this.hpEl.textContent = String(value);
	}
	setAmmo(inMag, reserve) {
		this.ammoEl.textContent = String(inMag);
		this.reserveEl.textContent = String(reserve);
	}
	setScore(score) {
		this.scoreEl.textContent = String(score);
	}
} 