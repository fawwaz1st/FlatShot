export function attachFallbackSpawner(game){
	try {
		importShim();
	} catch(_){}
	try {
		// use global THREE import via module loader environment
		const THREE = (typeof window !== 'undefined' && window.THREE) ? window.THREE : null;
		// fallback: if THREE not available globally, try dynamic import
		const getThree = async ()=>{
			if (THREE) return THREE;
			try { const mod = await import('three'); return mod; } catch(e){ return null; }
		};

		game.ensureMinEnemies = function(dt, playerPos){
			try {
				// synchronous attempt to get THREE; if not present, skip incidental explosion logic
				let ThreeLib = (typeof window !== 'undefined' && window.THREE) ? window.THREE : null;
				if (!ThreeLib) {
					// try to avoid async inside hot loop; set ThreeLib later if available
					getThree().then(m=>{ if (m) window.THREE = m; }).catch(()=>{});
				}
				const desired = 12 + Math.floor(this.world.score / 30);
				// hanya jalankan fallback jika sistem wave tidak sedang aktif
				if ((this.waveState === 'idle' || typeof this.waveState === 'undefined') && this.world.enemies.length < desired && this.animating) {
					this.spawnEnemy();
				}
				// incidental random explosion spawn (keep but independent of wave) — only if THREE available
				if (ThreeLib && Math.random() < 0.004) {
					const a = Math.random() * Math.PI * 2; const r = 30 + Math.random()*60;
					const p = new ThreeLib.Vector3(playerPos.x + Math.cos(a)*r, 0.1, playerPos.z + Math.sin(a)*r);
					this.spawnExplosion(p);
					if (this.audio) try { this.audio.explosion({ volume: 0.4 }); this.audio.duckBgm(0.35, 300); } catch(_) {}
				}
			} catch(_){}
		};
	} catch(e){ console.error('[FallbackSpawner] attach error', e); }
} 