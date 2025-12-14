import * as THREE from 'three';

const ALLY_COLOR = 0x38bdf8;

export class Ally {
	constructor(scene, position) {
		this.health = 100;
		this.speed = 3.8 + Math.random() * 0.8;
		this.radius = 0.5;
		this.baseShootCooldown = 0.32 + Math.random() * 0.12;
		this.shootCooldown = this.baseShootCooldown;
		this.lastShoot = 0;
		this.state = 'patrol';
		this.targetEnemy = null;
		this.waypoint = position.clone();
		this.nextThink = 0;
		this.name = Ally.generateName();

		// status tambahan untuk display & logic
		this.pistolAmmo = 64; // max ally ammo (ditingkatkan)
		this.grenades = 6;
		this.kills = 0;
		this.effects = {}; // e.g. {shield: 0, damage:0}

		this.mesh = this.createMesh();
		this.mesh.position.copy(new THREE.Vector3(position.x, 1, position.z));
		scene.add(this.mesh);
		try { this.mesh.userData.ally = this; } catch (_) { }
		// small intro VFX: emit a brief glow sprite
		try { this.emitSummonVfx(scene, this.mesh.position.clone()); } catch (_) { }
		this.coverTimer = 0;
		this.strafeTimer = 0;
		// reuse temporaries
		this._tmpVec = new THREE.Vector3();
		this._lastThinkInterval = 1.0;
		// create updatable name canvas/texture sprite
		this._nameCanvas = null; this._nameCtx = null; this._nameTex = null; this.nameSprite = null;
		this._scene = scene; // simpan referensi scene untuk sprite/dispose
		// gunakan updateNameSprite untuk inisialisasi agar _nameTex dan canvas konsisten
		this.updateNameSprite(this.name);
		if (this.nameSprite) { this.nameSprite.position.set(this.mesh.position.x, this.mesh.position.y + 1.8, this.mesh.position.z); this._scene.add(this.nameSprite); }

		// selection state (untuk per-ally chat/command selection)
		this._selected = false;
		this._selectedPulse = 0;

		// chat bubble untuk status singkat / pesan
		this._chatCanvas = null; this._chatCtx = null; this._chatTex = null; this._chatSprite = null; this._chatTimer = 0; this._chatText = '';
		this._chatVisibleDist = 60; // only show bubble when player near
		this._createChatBubble();
		this._ray = new THREE.Raycaster();
		// LOS cache untuk mengurangi raycast mahal
		this._lastLOSCheckTime = 0;
		this._lastLOSCheckResult = true;
		this._losCacheTTL = 220; // ms
		// clamp internal counts untuk keamanan (hindari nilai ekstrem)
		this.pistolAmmo = Math.min(64, Math.max(0, this.pistolAmmo));
		this.grenades = Math.min(6, Math.max(0, this.grenades));
		// visual VFX untuk label (glow sprite)
		this._glowSprite = this.createGlowSprite && this.createGlowSprite();
		if (this._glowSprite) { this._glowSprite.position.set(this.mesh.position.x, this.mesh.position.y + 1.85, this.mesh.position.z); this._scene.add(this._glowSprite); }
		this._glowPulse = 0;
		// ensure selection visual consistent
		if (this._glowSprite) this._glowSprite.scale.set(0.9, 0.35, 1);

		// maxed stats & tuning (tidak bisa dinaikkan lagi)
		this.damageMult = 1.8; // multiplier saat menyebabkan damage
		this.accuracy = 0.86; // dasar akurasi (0..1)
		this._maxed = true;
		this._thinkWhileFarRadius = 80; // radius musuh yang membuat ally tetap aktif walau jauh (diperbesar)
	}

	// small summon VFX: transient glow sprite
	emitSummonVfx(scene, pos) {
		try {
			const geom = new THREE.PlaneGeometry(0.8, 0.8);
			const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthTest: false });
			const spr = new THREE.Mesh(geom, mat);
			spr.position.copy(pos); spr.position.y += 1.1;
			spr.lookAt(new THREE.Vector3(0, 1, 0));
			scene.add(spr);
			// add light pulse for extra pop (if renderer supports lights)
			try {
				if (typeof THREE.PointLight !== 'undefined') {
					const light = new THREE.PointLight(0x88e6ff, 1.0, 6);
					light.position.copy(spr.position);
					scene.add(light);
					// animate pulse
					let lt = 0; const lTick = () => {
						lt += 0.06;
						if (lt > 1.0) { try { scene.remove(light); if (light.dispose) light.dispose(); } catch (_) { } return; }
						light.intensity = THREE.MathUtils.lerp(1.6, 0.0, lt);
						requestAnimationFrame(lTick);
					}; lTick();
				}
			} catch (_) { }
			// small spark particles using DOM overlay (cheap) to avoid heavy GPU particles at runtime
			const sparkCount = 10;
			const sparks = [];
			for (let i = 0; i < sparkCount; i++) {
				const el = document.createElement('div'); el.className = 'summon-spark'; el.style.position = 'fixed'; el.style.pointerEvents = 'none'; el.style.width = '6px'; el.style.height = '6px'; el.style.borderRadius = '4px'; el.style.background = 'radial-gradient(circle,#9be6ff,#38bdf8)'; el.style.boxShadow = '0 6px 18px rgba(56,189,248,0.6)'; el.style.zIndex = 9999;
				document.body.appendChild(el);
				const angle = Math.random() * Math.PI * 2; const speed = 40 + Math.random() * 80;
				const vx = Math.cos(angle) * speed; const vy = - (80 + Math.random() * 40);
				const startX = window.innerWidth / 2; const startY = window.innerHeight / 2; // approximate center; visual mapping left as-is
				let start = performance.now(); const life = 520 + Math.random() * 280;
				const tick = (now) => {
					const k = (now - start) / life; if (k >= 1) { try { el.remove(); } catch (_) { } return; }
					const x = startX + vx * k; const y = startY + (vy * k + 220 * k * k);
					el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.opacity = String(1 - k);
					requestAnimationFrame(tick);
				}; requestAnimationFrame(tick);
				sparks.push(el);
			}
			let t = 0; const tick = () => {
				if (t > 1.0) {
					try { scene.remove(spr); mat.dispose(); geom.dispose(); } catch (_) { }
					// ensure DOM sparks removed
					for (const s of sparks) try { s.remove(); } catch (_) { }
					return;
				}
				mat.opacity = THREE.MathUtils.lerp(0.9, 0.0, t);
				spr.scale.setScalar(THREE.MathUtils.lerp(0.6, 1.8, t));
				t += 0.044; requestAnimationFrame(tick);
			}; tick();
		} catch (_) { }
	}

	createMesh() {
		const group = new THREE.Group();
		const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 6, 12), new THREE.MeshStandardMaterial({
			color: 0x001133,
			roughness: 0.2,
			metalness: 0.8,
			emissive: 0x0088ff,
			emissiveIntensity: 0.5
		}));
		group.add(body);
		// visor with variable emissive color (eye/dot)
		const visorColorOptions = [0x001133, 0xffcc00, 0xff6b6b, 0x38bdf8, 0x9ae66e, 0xff77dd];
		const visCol = visorColorOptions[Math.floor(Math.random() * visorColorOptions.length)];
		const visorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: visCol, emissiveIntensity: 0.9 });
		const visor = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), visorMat);
		visor.position.set(0, 0.5, 0.35);
		group.add(visor);
		// small eye dot to emphasize color
		const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: visCol }));
		eye.position.set(0, 0.54, 0.45);
		group.add(eye);
		return group;
	}

	_hasLineOfSight(targetPos, obstacles, obstacleMeshesCached) {
		// Cached LOS: jika dicek dalam TTL, gunakan hasil cache untuk menghemat raycasts
		try {
			const nowMs = performance.now();
			if (nowMs - (this._lastLOSCheckTime || 0) < this._losCacheTTL) return this._lastLOSCheckResult;
			const from = this.mesh.position.clone(); from.y += 0.6;
			const dir = targetPos.clone().sub(from);
			const dist = dir.length(); if (dist <= 0.001) { this._lastLOSCheckTime = nowMs; this._lastLOSCheckResult = true; return true; }
			dir.normalize();
			this._ray.set(from, dir);
			this._ray.far = dist;
			const blockers = obstacleMeshesCached || (obstacles || []).map(o => o.mesh);
			const hits = this._ray.intersectObjects(blockers, true);
			const result = hits.length === 0;
			this._lastLOSCheckTime = nowMs;
			this._lastLOSCheckResult = result;
			return result;
		} catch (_) { return true; }
	}

	chooseWaypoint(center, radiusMin = 6, radiusMax = 18) {
		const r = radiusMin + Math.random() * (radiusMax - radiusMin);
		const a = Math.random() * Math.PI * 2;
		return new THREE.Vector3(center.x + Math.cos(a) * r, 1, center.z + Math.sin(a) * r);
	}

	think(context) {
		const { playerPos, enemies, pickups, grenades = [], difficultyMultiplier = 1.0, worldCenter } = context;
		// Regroup jika terlalu jauh dari player
		const distToPlayer = this.mesh.position.distanceTo(playerPos);
		const nowMs = performance.now();
		if (distToPlayer > 35 && (this._lastRegroupAt || 0) + 5000 < nowMs) {
			this.state = 'regroup';
			this.waypoint = this.chooseWaypoint(playerPos, 3, 6);
			this.targetEnemy = null;
			this.nextThink = Math.max(0.4, 0.8 / difficultyMultiplier) + Math.random() * 0.4;
			this._lastRegroupAt = nowMs;
			return;
		}

		// Retreat jika sekarat dan ada musuh dekat
		let nearestEnemy = null, nd = Infinity;
		for (const e of enemies) {
			const d = e.mesh.position.distanceTo(this.mesh.position);
			if (d < nd) { nd = d; nearestEnemy = e; }
		}
		if (this.health < 35 && nearestEnemy && nd < 8) {
			this.state = 'retreat';
			const away = this.mesh.position.clone().sub(nearestEnemy.mesh.position).setY(0).normalize().multiplyScalar(10);
			this.waypoint = this.mesh.position.clone().add(away);
			this.targetEnemy = nearestEnemy;
			this.nextThink = Math.max(0.3, 0.6 / difficultyMultiplier) + Math.random() * 0.3;
			return;
		}

		// Evade granat bila dekat
		for (const g of grenades) {
			if (!g.alive || !g.mesh) continue;
			const d = g.mesh.position.distanceTo(this.mesh.position);
			if (d < 6) { this.state = 'evade'; const away = this.mesh.position.clone().sub(g.mesh.position).setY(0).normalize().multiplyScalar(8); this.waypoint = this.mesh.position.clone().add(away); this.nextThink = 0.4 + Math.random() * 0.3; return; }
		}

		// group-aware: hitung jumlah musuh & ally di sekitar
		let nearbyEnemies = 0, nearbyAllies = 0;
		for (const e of enemies) { if (e.mesh.position.distanceTo(this.mesh.position) < 14) nearbyEnemies++; }
		try { for (const a of (this._scene && this._scene.userData && this._scene.userData._alliesList) ? this._scene.userData._alliesList : []) { if (a.mesh && a !== this && a.mesh.position.distanceTo(this.mesh.position) < 14) nearbyAllies++; } } catch (_) { }

		// Jika ada musuh di dunia tetapi tidak ada musuh dekat, beri probabilitas ally untuk mencari/mengelilingi musuh
		try {
			// lebih agresif mencari inisiatif: jika ada musuh global dan tak ada musuh dekat
			if ((enemies && enemies.length > 0) && nearbyEnemies === 0 && Math.random() < 0.82) {
				// pilih musuh acak dan bergerak menuju posisinya (dengan sedikit offset) untuk investigasi/seek
				// Prefer target yang lemah atau yang tidak terlindungi ally (prioritas)
				let cand = null; let bestScore = -Infinity;
				for (const c of enemies) {
					try {
						let score = 0;
						// prefer lebih dekat ke player (membuat ally membantu area aktif)
						const d = c.mesh.position.distanceTo(this.mesh.position) || 1;
						score -= d * 0.08;
						// prefer target dengan health rendah
						if (typeof c.health === 'number') score += (100 - c.health) * 0.12;
						// jika target tidak banyak ally di dekatnya, tambah skor
						let nearbyToTarget = 0; try { for (const a of (this._scene && this._scene.userData && this._scene.userData._alliesList) ? this._scene.userData._alliesList : []) { if (a.mesh && a.mesh.position.distanceTo(c.mesh.position) < 12) nearbyToTarget++; } } catch (_) { }
						// penalize targets already swarmed by allies (stronger when total enemies small)
						const enemyCount = (enemies && enemies.length) ? enemies.length : 0;
						const swarmPenalty = Math.min(3, nearbyToTarget) * (enemyCount <= 3 ? 12 : 6);
						score += (2 - Math.min(2, nearbyToTarget)) * 8;
						score -= swarmPenalty;
						if (score > bestScore) { bestScore = score; cand = c; }
					} catch (_) { }
				}
				if (!cand) cand = enemies[Math.floor(Math.random() * enemies.length)];
				if (cand && cand.mesh) {
					// if many allies already targeting this candidate and few enemies exist, try to pick alternative
					try {
						const alliesList = (this._scene && this._scene.userData && this._scene.userData._alliesList) ? this._scene.userData._alliesList : [];
						let alliesOnCand = 0;
						for (const a of alliesList) { try { if (a.targetEnemy && a.targetEnemy === cand) alliesOnCand++; } catch (_) { } }
						if (alliesOnCand >= 2 && enemies.length <= 3) {
							// find alternative enemy with fewer allies nearby
							let alt = null; let altScore = -Infinity;
							for (const c2 of enemies) {
								let cnt = 0; for (const a of alliesList) { try { if (a.targetEnemy && a.targetEnemy === c2) cnt++; } catch (_) { } }
								const dist2 = c2.mesh.position.distanceTo(this.mesh.position) || 1;
								let s = (100 - (c2.health || 100)) * 0.1 - dist2 * 0.05 - cnt * 8;
								if (s > altScore) { altScore = s; alt = c2; }
							}
							if (alt) { cand = alt; }
						}
					} catch (_) { }
					const offset = (Math.random() - 0.5) * 2.6;
					this.state = 'investigate';
					this.waypoint = cand.mesh.position.clone().add(new THREE.Vector3(offset, 0, offset));
					this.targetEnemy = null;
					// think sooner to allow rapid follow-up
					this.nextThink = 0.24 + Math.random() * 0.4;
					return;
				}
			}
		} catch (_) { }

		// jika jumlah musuh lebih banyak (mis. 2 vs 1) -> cari cover / regroup
		if (nearbyEnemies >= 2 && nearbyAllies < nearbyEnemies) {
			// cari obstacle terdekat sebagai cover
			let nearestObs = null, ond = Infinity;
			for (const o of context.obstacles || []) {
				const d = o.mesh.position.distanceTo(this.mesh.position);
				if (d < ond) { ond = d; nearestObs = o; }
			}
			if (nearestObs) {
				this.state = 'takeCover';
				// waypoint: ke sisi obstacle yang berlawanan dengan musuh terdekat
				const midEnemy = nearestEnemy ? nearestEnemy.mesh.position.clone() : this.mesh.position.clone();
				const away = this.mesh.position.clone().sub(midEnemy).setY(0).normalize().multiplyScalar(1.6);
				this.waypoint = nearestObs.mesh.position.clone().add(away);
				this.targetEnemy = nearestEnemy;
				this.nextThink = 0.28 + Math.random() * 0.32;
				return;
			}
			// jika tidak ketemu cover, regroup ke player
			this.state = 'regroup'; this.waypoint = this.chooseWaypoint(playerPos, 3, 6); this.nextThink = 0.5; return;
		}

		// Engage jika ada musuh dalam jarak yang lebih luas (ditingkatkan)
		if (nearestEnemy && nd < 45 * difficultyMultiplier) {
			// jika health rendah atau ammo sedikit, prioritaskan mundur dan cari pickup
			if (this.health < 60 || this.pistolAmmo < 6) {
				// beri kesempatan untuk mencari pickup di sekitar sebelum engage
				let nearbyPickup = null; let pd = Infinity;
				for (const p of pickups || []) {
					const d = p.mesh.position.distanceTo(this.mesh.position);
					if (d < pd) { pd = d; nearbyPickup = p; }
				}
				if (nearbyPickup && pd < 14) {
					this.state = 'seekAmmo';
					this.waypoint = nearbyPickup.mesh.position.clone();
					this.targetEnemy = null;
					this.nextThink = 0.28 + Math.random() * 0.3;
					return;
				}
			}
			// hanya engage jika punya line of sight ke musuh
			if (this._hasLineOfSight(nearestEnemy.mesh.position, context.obstacles, context.obstacleMeshes)) {
				this.state = 'engage';
				this.targetEnemy = nearestEnemy;
				try { this.showChatMessage('Enemy spotted!', 1600); } catch (_) { }
				this.nextThink = Math.max(0.2, 0.5 / difficultyMultiplier) + Math.random() * 0.3;
				return;
			} else {
				// investigate last seen position if no LOS
				this.state = 'investigate';
				try { this.showChatMessage('Investigating...', 1400); } catch (_) { }
				this.waypoint = nearestEnemy.mesh.position.clone();
				this.targetEnemy = null;
				this.nextThink = 0.6 + Math.random() * 0.4;
				return;
			}
		}

		// Jika tidak ada musuh dekat, 30% kesempatan cari ammo
		if (pickups.length > 0 && Math.random() < 0.3) {
			let nearestPickup = null, pd = Infinity;
			for (const p of pickups) {
				const d = p.mesh.position.distanceTo(this.mesh.position);
				if (d < pd) { pd = d; nearestPickup = p; }
			}
			if (nearestPickup) {
				this.state = 'seekAmmo';
				this.waypoint = nearestPickup.mesh.position.clone();
				this.targetEnemy = null;
				this.nextThink = 1.0 + Math.random() * 0.6;
				return;
			}
		}

		// Patrol default — kadang jelajah lebih jauh dari player, prefer titik dekat obstacle (cover-aware)
		this.state = 'patrol';
		if (Math.random() < 0.62 && worldCenter) {
			// prefer obstacle dekat ally (bukan dekat player) agar tidak ter-pull ke player
			let bestObs = null; let bd = Infinity;
			for (const o of (context.obstacles || [])) { try { const d = o.mesh.position.distanceTo(this.mesh.position); if (d < bd && d > 2.4) { bd = d; bestObs = o; } } catch (_) { } }
			if (bestObs) { const off = (Math.random() - 0.5) * 3.0; this.waypoint = new THREE.Vector3(bestObs.mesh.position.x + off, 1, bestObs.mesh.position.z + off); }
			else this.waypoint = this.chooseWaypoint(worldCenter, 12, 60);
		} else {
			// patrol around player but biased to nearby obstacles if any
			let nearObs = null; let nd = Infinity;
			for (const o of (context.obstacles || [])) { try { const d = o.mesh.position.distanceTo(this.mesh.position); if (d < nd) { nd = d; nearObs = o; } } catch (_) { } }
			if (nearObs && Math.random() < 0.45) { const off = (Math.random() - 0.5) * 2.2; this.waypoint = new THREE.Vector3(nearObs.mesh.position.x + off, 1, nearObs.mesh.position.z + off); }
			else this.waypoint = this.chooseWaypoint(playerPos, 8, 28);
		}
		this.targetEnemy = null;
		this.nextThink = Math.max(0.6, 1.2 / difficultyMultiplier) + Math.random() * 0.6;
	}

	moveTowards(target, dt) {
		const pos = this.mesh.position;
		const dir = target.clone().setY(pos.y).sub(pos);
		if (dir.lengthSq() > 0.0001) dir.normalize();
		pos.x += dir.x * this.speed * dt;
		pos.z += dir.z * this.speed * dt;
	}

	// safer movement: only move when sufficiently far to avoid micro jitter
	_moveIfFarEnough(target, dt, minDist = 0.45) {
		const pos = this.mesh.position;
		const dst = target.clone().setY(pos.y).distanceTo(pos);
		if (dst > minDist) this.moveTowards(target, dt);
	}

	update(dt, context) {
		const { playerPos, enemies, obstacles, pickups, grenades = [], difficultyMultiplier = 1.0 } = context;

		this.nextThink -= dt;
		if (this.nextThink <= 0) {
			// adaptasi interval lebih besar jika ally jauh dari player untuk hemat CPU
			const distToPlayer = this.mesh.position.distanceTo(context.playerPos || new THREE.Vector3());
			if (distToPlayer > 55) this.nextThink = 0.9 + Math.random() * 1.2;
			else this.nextThink = Math.max(0.2, 0.6 / (difficultyMultiplier || 1.0)) + Math.random() * 0.4;
			this.think({ playerPos, enemies, pickups, grenades, difficultyMultiplier, worldCenter: context.worldCenter });
		}

		let shoot = false;
		let target = null;

		// remember previous pos to compute movement dir
		const prevPos = this.mesh.position.clone();

		// simple obstacle avoidance borrowed from Enemy
		let avoid = new THREE.Vector3(0, 0, 0);
		// small optimization: skip obstacle checks when ally is very far from player
		const _distToPlayer = this.mesh.position.distanceTo(context.playerPos || new THREE.Vector3());
		this._isFar = _distToPlayer > 80;
		if (!this._isFar) {
			for (const o of obstacles || []) {
				const b = o.mesh.position;
				const half = o.half;
				const dx = Math.max(Math.abs(this.mesh.position.x - b.x) - half.x, 0);
				const dz = Math.max(Math.abs(this.mesh.position.z - b.z) - half.z, 0);
				const d = Math.hypot(dx, dz);
				if (d < this.radius + 0.6) {
					const nx = this.mesh.position.x - b.x;
					const nz = this.mesh.position.z - b.z;
					const len = Math.hypot(nx, nz) || 1;
					avoid.x += nx / len;
					avoid.z += nz / len;
				}
			}
		}

		// ally repulsion: avoid clustering with nearby allies
		try {
			const alliesList = (this._scene && this._scene.userData && this._scene.userData._alliesList) ? this._scene.userData._alliesList : [];
			for (const a of alliesList) {
				try {
					if (a === this || !a.mesh) continue;
					const d = a.mesh.position.distanceTo(this.mesh.position);
					if (d < 2.2 && d > 0.0001) {
						const awayX = this.mesh.position.x - a.mesh.position.x;
						const awayZ = this.mesh.position.z - a.mesh.position.z;
						const f = (1 - (d / 2.2));
						avoid.x += (awayX / Math.max(0.001, d)) * (0.8 * f);
						avoid.z += (awayZ / Math.max(0.001, d)) * (0.8 * f);
					}
				} catch (_) { }
			}
		} catch (_) { }

		// hitung jarak terdekat ke musuh untuk respons cepat
		let minEnemyDist = Infinity;
		for (const e of enemies) { try { const d = e.mesh.position.distanceTo(this.mesh.position); if (d < minEnemyDist) minEnemyDist = d; } catch (_) { } }
		// jika ada musuh dekat walau ally jauh, paksa think segera
		if (minEnemyDist < this._thinkWhileFarRadius) {
			this.nextThink = Math.min(this.nextThink, 0.05);
		}

		// heavy-skip: jika sangat jauh dan tidak ada musuh dekat serta tidak dalam keadaan kritis, lakukan path ringan saja
		if (this._isFar && (minEnemyDist === Infinity || minEnemyDist > 40) && !['engage', 'retreat', 'evade', 'takeCover', 'investigate'].includes(this.state)) {
			// update minimal visual-only and skip expensive movement/LOS
			if (this.nameSprite) this.nameSprite.position.set(this.mesh.position.x, this.mesh.position.y + 1.8, this.mesh.position.z);
			if (this._glowSprite) this._glowSprite.position.set(this.mesh.position.x, this.mesh.position.y + 1.85, this.mesh.position.z);
			// reduce CPU use by not processing movement/shooting
			return { shoot: false, target: null };
		}

		if (this.state === 'engage' && this.targetEnemy) {
			const epos = this.targetEnemy.mesh.position.clone();
			const dist = epos.distanceTo(this.mesh.position);
			// Bergerak mendekat jika terlalu jauh, strafe jika dekat
			if (dist > 10) {
				const dir = epos.clone().sub(this.mesh.position).setY(0).normalize().add(avoid.multiplyScalar(0.8)).normalize();
				this.mesh.position.x += dir.x * this.speed * dt;
				this.mesh.position.z += dir.z * this.speed * dt;
			} else if (dist > 4) {
				// strafe
				const toEnemy = epos.clone().sub(this.mesh.position).setY(0).normalize();
				const right = new THREE.Vector3(-toEnemy.z, 0, toEnemy.x);
				const side = (Math.random() < 0.5 ? 1 : -1);
				const strafe = right.multiplyScalar(side * this.speed * 0.6 * dt);
				this.mesh.position.add(strafe);
			}
			// cover sederhana: sesekali offset ke sisi obstacle terdekat
			this.coverTimer -= dt;
			if (this.coverTimer <= 0) {
				let nearest = null, ndc = Infinity;
				for (const o of obstacles) { const d = o.mesh.position.distanceTo(this.mesh.position); if (d < ndc) { ndc = d; nearest = o; } }
				if (nearest && ndc < 4) {
					const toObs = nearest.mesh.position.clone().sub(this.mesh.position).setY(0).normalize();
					const side = new THREE.Vector3(-toObs.z, 0, toObs.x).multiplyScalar(1.2);
					this.mesh.position.add(side.multiplyScalar(0.5));
				}
				this.coverTimer = 0.9 + Math.random() * 0.7;
			}
			this.mesh.lookAt(new THREE.Vector3(epos.x, this.mesh.position.y, epos.z));
			// Tembak dengan cooldown adaptif
			const now = performance.now() / 1000;
			// adaptasi cooldown & probabilitas berdasarkan jarak, health dan difficulty
			const nearFactor = THREE.MathUtils.clamp((25 - dist) / 25, 0, 1);
			this.shootCooldown = Math.max(0.22, this.baseShootCooldown - 0.22 * nearFactor - 0.08 * (difficultyMultiplier - 1));
			if (now - this.lastShoot > this.shootCooldown) {
				this.lastShoot = now;
				// tingkatkan kesempatan tembakan di difficulty tinggi
				if (Math.random() < Math.min(0.95, 0.5 + 0.25 * (difficultyMultiplier - 1))) {
					// decrement ammo jika tersedia
					if (this.pistolAmmo > 0) { this.pistolAmmo -= 1; shoot = true; target = this.targetEnemy; }
				}
			}
		} else if (this.state === 'seekAmmo') {
			this.moveTowards(this.waypoint, dt);
		} else if (this.state === 'retreat' || this.state === 'regroup' || this.state === 'patrol' || this.state === 'evade' || this.state === 'investigate') {
			this.moveTowards(this.waypoint, dt);
		}
		// new: if taking cover, move to waypoint and peek/shoot when possible
		if (this.state === 'takeCover') {
			// reach cover
			const wp = this.waypoint;
			if (wp) {
				const d = wp.distanceTo(this.mesh.position);
				if (d > 0.6) this.moveTowards(wp, dt);
				else {
					// at cover: face nearest target if exists and peek
					if (this.targetEnemy) {
						let canSee = false;
						if (!this._isFar) canSee = this._hasLineOfSight(this.targetEnemy.mesh.position, obstacles, context.obstacleMeshes);
						this.mesh.lookAt(new THREE.Vector3(this.targetEnemy.mesh.position.x, this.mesh.position.y, this.targetEnemy.mesh.position.z));
						if (canSee) {
							// probabilistic peek & shoot to simulate peeking
							if (Math.random() < 0.45) {
								const now = performance.now() / 1000;
								if (now - this.lastShoot > (this.shootCooldown || 0.6)) { this.lastShoot = now; if (this.pistolAmmo > 0) { this.pistolAmmo--; shoot = true; target = this.targetEnemy; } }
							}
						} else {
							// try to peek by small strafe
							const rnd = (Math.random() < 0.5 ? 1 : -1); this.mesh.position.add(new THREE.Vector3(rnd * 0.06, 0, 0));
						}
					}
				}
			}
		}
		// hold state: stay put, peek & shoot if enemy in sight
		if (this.state === 'hold') {
			let nearest = null, ndh = Infinity;
			for (const e of (context.enemies || [])) { const d = e.mesh.position.distanceTo(this.mesh.position); if (d < ndh) { ndh = d; nearest = e; } }
			if (nearest && ndh < 30 && !this._isFar) {
				const canSee = this._hasLineOfSight(nearest.mesh.position, context.obstacles, context.obstacleMeshes);
				if (canSee) {
					this.mesh.lookAt(new THREE.Vector3(nearest.mesh.position.x, this.mesh.position.y, nearest.mesh.position.z));
					const now = performance.now() / 1000;
					if (now - this.lastShoot > (this.shootCooldown || 0.6)) { this.lastShoot = now; if (this.pistolAmmo > 0) { this.pistolAmmo--; return { shoot: true, target: nearest }; } }
				}
			}
		}

		// rotate body to movement direction when moved
		const moved = this.mesh.position.clone().sub(prevPos);
		if (moved.lengthSq() > 0.00001) {
			const dir = moved.clone().setY(0).normalize();
			const angle = Math.atan2(dir.x, dir.z); // note: lookAt uses z-forward
			// smooth rotate
			this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, angle, Math.min(1, dt * 6));
		}

		// update name sprite content if needed
		this._lastNameDraw = this._lastNameDraw || '';
		const statusText = `${this.name} | HP:${Math.round(this.health)} | ${this.pistolAmmo} ${this.grenades} | K:${this.kills}`;
		// reduce update frequency when far
		if (statusText !== this._lastNameDraw) {
			const nowMs = performance.now();
			if (this._isFar) {
				this._lastNameUpdateTime = this._lastNameUpdateTime || 0;
				if (nowMs - this._lastNameUpdateTime > 700) { this._lastNameDraw = statusText; this._lastNameUpdateTime = nowMs; this.updateNameSprite(statusText); }
			} else { this._lastNameDraw = statusText; this.updateNameSprite(statusText); }
		}

		// show/hide name & chat bubble based on distance to player
		if (context.playerPos) {
			const d2p = this.mesh.position.distanceTo(context.playerPos);
			if (this.nameSprite) this.nameSprite.visible = d2p < 80;
			if (this._chatSprite) this._chatSprite.visible = d2p < this._chatVisibleDist && !!this._chatText;
		}

		// perbarui posisi nama jika ada
		if (this.nameSprite) {
			this.nameSprite.position.set(this.mesh.position.x, this.mesh.position.y + 1.8, this.mesh.position.z);
		}
		// update chat bubble timer
		if (this._chatTimer > 0) {
			this._chatTimer -= dt * 1000;
			if (this._chatTimer <= 0) { this._chatText = ''; if (this._chatSprite) { try { this._scene.remove(this._chatSprite); } catch (_) { } this._chatSprite = null; } }
		}
		// update glow pulsing
		if (this._glowSprite) {
			this._glowPulse += dt * 3.5;
			const a = 0.35 + 0.25 * Math.abs(Math.sin(this._glowPulse));
			this._glowSprite.material.opacity = a;
			this._glowSprite.position.set(this.mesh.position.x, this.mesh.position.y + 1.85, this.mesh.position.z);
		}
		return { shoot, target };
	}

	// helper: generate simple random ally names and create text sprite (inside class)
	static generateName() {
		const pool = ['Astra', 'Nova', 'Echo', 'Kilo', 'Vera', 'Orion', 'Zeta', 'Mira', 'Kai', 'Luna'];
		return pool[Math.floor(Math.random() * pool.length)] + '-' + (Math.floor(Math.random() * 90) + 10);
	}

	// helper: rounded rect for name canvas (static so callable inside class)
	static roundRect(ctx, x, y, w, h, r) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	}

	createNameSprite(text) {
		try {
			// fallback simple creation (dipanggil jarang) -- tetapi gunakan _nameTex jika telah dibuat
			if (!this._nameTex) {
				const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 64;
				const ctx = canvas.getContext('2d');
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.beginPath(); ctx.arc(28, 32, 16, 0, Math.PI * 2); ctx.fillStyle = '#1e293b'; ctx.fill();
				ctx.beginPath(); ctx.arc(28, 32, 12, 0, Math.PI * 2); ctx.fillStyle = '#38bdf8'; ctx.fill();
				ctx.fillStyle = '#111827'; ctx.fillRect(56, 26, 240, 12);
				const hp = Math.max(0, Math.min(1, this.health / 100)); ctx.fillStyle = '#10b981'; ctx.fillRect(56, 26, Math.floor(240 * hp), 12);
				ctx.font = '18px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.fillText(text, 56, 20);
				this._nameTex = new THREE.CanvasTexture(canvas);
			}
			const mat = new THREE.SpriteMaterial({ map: this._nameTex, depthTest: false, sizeAttenuation: true });
			const spr = new THREE.Sprite(mat);
			spr.scale.set(1.8, 0.45, 1);
			return spr;
		} catch (_) { return null; }
	}

	createGlowSprite() {
		try {
			const geom = new THREE.PlaneGeometry(0.9, 0.35);
			const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthTest: false });
			const mesh = new THREE.Mesh(geom, mat);
			mesh.scale.set(0.9, 0.35, 1);
			return mesh;
		} catch (_) { return null; }
	}

	// set selection visual (dipanggil oleh Game saat player memilih ally)
	setSelected(v) {
		this._selected = !!v;
		try {
			if (!this._glowSprite) return;
			if (this._selected) {
				this._glowSprite.material.color.setHex(0xffd166);
				this._glowSprite.scale.set(1.2, 0.45, 1);
			} else {
				this._glowSprite.material.color.setHex(0x38bdf8);
				this._glowSprite.scale.set(0.9, 0.35, 1);
			}
		} catch (_) { }
	}

	// update name canvas/texture
	updateNameSprite(text) {
		try {
			if (!this._nameCanvas) { this._nameCanvas = document.createElement('canvas'); this._nameCanvas.width = 512; this._nameCanvas.height = 96; this._nameCtx = this._nameCanvas.getContext('2d'); }
			const ctx = this._nameCtx; const canvas = this._nameCanvas; ctx.clearRect(0, 0, canvas.width, canvas.height);
			// rounded background
			const radius = 10; ctx.fillStyle = 'rgba(6,8,12,0.6)'; Ally.roundRect(ctx, 6, 8, canvas.width - 12, canvas.height - 20, radius); ctx.fill();
			// left icon circle
			ctx.beginPath(); ctx.arc(46, canvas.height / 2, 26, 0, Math.PI * 2); ctx.fillStyle = '#0f172a'; ctx.fill(); ctx.beginPath(); ctx.arc(46, canvas.height / 2, 22, 0, Math.PI * 2); ctx.fillStyle = '#38bdf8'; ctx.fill();
			// name text
			ctx.font = '18px system-ui, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.fillText(text, 92, 34);
			// small HP bar below name
			ctx.fillStyle = '#0b1220'; ctx.fillRect(92, 44, 300, 12);
			const hp = Math.max(0, Math.min(1, this.health / 100)); ctx.fillStyle = '#10b981'; ctx.fillRect(92, 44, Math.floor(300 * hp), 12);
			// stats line (show only when near player)
			if (this._scene && this._scene.userData && this._scene.userData._gamePlayerPos) {
				const playerPos = this._scene.userData._gamePlayerPos;
				const dist = playerPos.distanceTo(this.mesh.position);
				if (dist < 20) {
					ctx.font = '12px sans-serif'; ctx.fillStyle = '#cfd7e6'; ctx.fillText(`Ammo: ${this.pistolAmmo}  |  G: ${this.grenades}  |  K: ${this.kills}`, 92, 70);
				}
			}
			if (!this._nameTex) this._nameTex = new THREE.CanvasTexture(canvas); else this._nameTex.needsUpdate = true;
			if (!this.nameSprite) { const mat = new THREE.SpriteMaterial({ map: this._nameTex, depthTest: false, sizeAttenuation: true, transparent: true }); this.nameSprite = new THREE.Sprite(mat); this.nameSprite.scale.set(2.0, 0.45, 1); try { if (this._scene) this._scene.add(this.nameSprite); } catch (_) { } }
			else { this.nameSprite.material.map = this._nameTex; this.nameSprite.material.needsUpdate = true; }
		} catch (_) { }
	}

	_createChatBubble() {
		try {
			this._chatCanvas = document.createElement('canvas'); this._chatCanvas.width = 256; this._chatCanvas.height = 64;
			this._chatCtx = this._chatCanvas.getContext('2d');
			this._chatTex = new THREE.CanvasTexture(this._chatCanvas);
			const mat = new THREE.SpriteMaterial({ map: this._chatTex, depthTest: false, sizeAttenuation: true, transparent: true });
			this._chatSprite = new THREE.Sprite(mat);
			this._chatSprite.scale.set(1.6, 0.5, 1);
			this._chatSprite.position.set(this.mesh.position.x, this.mesh.position.y + 2.25, this.mesh.position.z);
			this._chatSprite.visible = false;
			try { if (this._scene) this._scene.add(this._chatSprite); } catch (_) { }
		} catch (_) { this._chatSprite = null; }
	}

	showChatMessage(text, durationMs = 1600) {
		try {
			this._chatText = text;
			this._chatTimer = durationMs;
			if (!this._chatSprite) this._createChatBubble();
			if (!this._chatSprite) return;
			const ctx = this._chatCtx; const c = this._chatCanvas;
			ctx.clearRect(0, 0, c.width, c.height);
			// rounded rect background
			ctx.fillStyle = 'rgba(10,12,16,0.78)';
			ctx.beginPath();
			ctx.moveTo(10, 8); ctx.lineTo(c.width - 26, 8); ctx.quadraticCurveTo(c.width - 8, 8, c.width - 8, 24); ctx.lineTo(c.width - 8, 40); ctx.quadraticCurveTo(c.width - 8, 56, c.width - 26, 56); ctx.lineTo(10, 56); ctx.quadraticCurveTo(0, 56, 0, 40); ctx.lineTo(0, 24); ctx.quadraticCurveTo(0, 8, 10, 8); ctx.fill();
			ctx.fillStyle = '#ffffff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(text, 12, 34);
			this._chatTex.needsUpdate = true;
			this._chatSprite.position.set(this.mesh.position.x, this.mesh.position.y + 2.25, this.mesh.position.z);
			this._chatSprite.visible = true;
			// juga post ke chat overlay jika callback game tersedia (real-time log)
			try {
				if (this._scene && this._scene.userData && typeof this._scene.userData._gameAddChat === 'function') {
					this._scene.userData._gameAddChat(this.name, text, 'ally');
				}
			} catch (_) { }
		} catch (_) { }
	}

	dispose(scene) {
		scene.remove(this.mesh);
		if (this.nameSprite) scene.remove(this.nameSprite);
		if (this._chatSprite) try { scene.remove(this._chatSprite); } catch (_) { }
		this.mesh.traverse((obj) => {
			if (obj.geometry) obj.geometry.dispose();
			if (obj.material) {
				if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
				else obj.material.dispose();
			}
		});
		// dispose nameSprite material/map if present
		try { if (this.nameSprite && this.nameSprite.material) { if (this.nameSprite.material.map) { this.nameSprite.material.map.dispose(); } this.nameSprite.material.dispose(); } } catch (_) { }
		try { if (this._nameTex) { this._nameTex.dispose(); this._nameTex = null; } } catch (_) { }
		try { if (this._chatTex) { this._chatTex.dispose(); this._chatTex = null; } } catch (_) { }
	}
} 