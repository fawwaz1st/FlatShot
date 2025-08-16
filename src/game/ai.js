import * as THREE from 'three';

export function attachAI(game){
	try {
		game.updateAllies = function(dt){
			const playerPos = this.controls.getObject().position;
			const difficultyMultiplier = (this.config.difficulty === 'hard') ? 1.25 : (this.config.difficulty === 'insane' ? 1.6 : 1.0);
			const worldCenter = new THREE.Vector3(0,1,0);
			const context = { playerPos, enemies: this.world.enemies, obstacles: this.world.obstacles, pickups: this.world.pickups, difficultyMultiplier, worldCenter };
			for (const ally of this.world.allies) {
				const action = ally.update(dt, context);
				if (action.shoot && action.target) {
					const start = ally.mesh.position.clone();
					const end = action.target.mesh.position.clone();
					this.spawnTracer(start, end, 0x38bdf8);
					const baseDmg = this.damageByDifficulty(14, 8);
					const dmg = baseDmg * (ally.damageMult || 1.0);
					const shotDist = start.distanceTo(end);
					const distFactor = THREE.MathUtils.clamp(1 - (shotDist / 60), 0.45, 1.0);
					const hitProb = Math.max(0.08, Math.min(0.98, (ally.accuracy || 0.7) * distFactor));
					if (Math.random() < hitProb) {
						const dead = action.target.applyDamage(dmg);
						if (dead) {
							this.addScore(6);
							ally.kills = (ally.kills||0) + 1;
							// catat kematian wave sebelum menghapus enemy agar counter sinkron
							try { this.onEnemyKilled(); } catch(_) {}
							try { this.recordEnemyDeath(action.target); } catch(_) {}
							this.removeEnemy(action.target);
							this.markHudDirty();
							// Only spawn fallback replacement if wave manager is NOT actively spawning a wave
							try { if (this.waveState === 'idle') { this.spawnEnemy(); } } catch(_) { /* ignore fallback when spawn blocked */ }
						}
					} else {
						const missAng = (Math.random() - 0.5) * 0.35;
						const rot = new THREE.Matrix4().makeRotationY(missAng);
						const dir = end.clone().sub(start).setY(0).normalize().applyMatrix4(rot);
						const missPoint = start.clone().add(dir.multiplyScalar(shotDist));
						this.spawnTracer(start, missPoint, 0x38bdf8);
					}
				}
			}
		};

		game.updateEnemies = function(dt){
			const playerPos = this.controls.getObject().position;
			const playerMoving = (this.input.forward || this.input.backward || this.input.left || this.input.right);
			const dynamicSkill = Math.min(1.8, 1.0 + this.world.score / 200);
			const difficultyMultiplier = (this.config.difficulty === 'hard') ? 1.25 : (this.config.difficulty === 'insane' ? 1.6 : 1.0);
			for (const enemy of this.world.enemies) {
				const act = enemy.update(dt, playerPos, this.world.obstacles, this._obstacleMeshes, { grenades: this.world.grenades, skill: dynamicSkill, playerMoving, difficultyMultiplier });
				if (act.contact) {
					this.takePlayerDamage(this.damageByDifficulty(10, 5) * dt, enemy.mesh.position.clone());
				}
				if (act.shoot) {
					let target = { pos: playerPos, isPlayer: true };
					let nd = enemy.mesh.position.distanceTo(playerPos);
					for (const ally of this.world.allies) {
						const d = enemy.mesh.position.distanceTo(ally.mesh.position);
						if (d < nd) { nd = d; target = { pos: ally.mesh.position, isPlayer: false, ally }; }
					}
					const nowMs = performance.now();
					let _blockedShot = false; // apakah tembakan terhalang (obstacle)
					let _lastTracerOrigin = null; let _lastTracerEnd = null;
					if (nowMs - this._lastEnemyTracerMs > 50) {
						const origin = enemy.mesh.position.clone();
						if (!origin.y || origin.y < 0.6) origin.y = 1.6;
						const dir = target.pos.clone().sub(origin).setY(0).normalize();
						const spread = (1 - (act.acc ?? 0.6)) * 0.15;
						const ang = (Math.random()-0.5) * spread;
						const rot = new THREE.Matrix4().makeRotationY(ang);
						const d3 = dir.clone().applyMatrix4(rot);
						const intendedEnd = origin.clone().add(d3.multiplyScalar(nd));
						// lakukan raycast ke obstacle untuk menentukan apakah tertabrak sebelum mencapai target
						try {
							const ray = new THREE.Raycaster(origin, d3, 0, nd);
							const blockers = this._obstacleMeshes || (this.world.obstacles || []).map(o=>o.mesh);
							const hits = ray.intersectObjects(blockers, true);
							if (hits && hits.length > 0) {
								_blockedShot = true;
								_lastTracerEnd = hits[0].point.clone();
							} else {
								_lastTracerEnd = intendedEnd;
							}
						} catch(_) { _lastTracerEnd = intendedEnd; }
						_lastTracerOrigin = origin;
						this.spawnTracer(_lastTracerOrigin, _lastTracerEnd, 0xff6b6b);
						try { this.spawnHitSparks((_lastTracerEnd && _lastTracerEnd.clone()) ? _lastTracerEnd.clone() : new THREE.Vector3(origin.x, origin.y + 0.05, origin.z), 6, 0xff6b6b); } catch(_) {}
						this.showShotIndicator(enemy.mesh.position.clone());
						this.playEnemyShotAudio(enemy.mesh.position.clone());
						this.spawnEnemyMuzzleFlash(enemy.mesh.position.clone());
						this._lastEnemyTracerMs = nowMs;
					}
					// jika target adalah player, pastikan tidak tertutup obstacle sebelum apply damage
					if (target.isPlayer) {
						const hitProb = Math.max(0.1, Math.min(0.9, (act.acc ?? 0.6)));
						if (!_blockedShot && Math.random() < hitProb) {
							this.takePlayerDamage(this.damageByDifficulty(8, 6), enemy.mesh.position.clone());
							try { this.audio.ricochet(); } catch(_) {}
							if (this.player.health <= 0) { this.gameOver(); return; }
							try { this.markHudDirty(); } catch(_) { try { this.updateHUD(); } catch(_){} }
						}
					} else if (target.ally) {
						const hitProbA = Math.max(0.1, Math.min(0.9, (act.acc ?? 0.6)) * 0.95);
						if (!_blockedShot && Math.random() < hitProbA) {
							target.ally.health -= this.damageByDifficulty(10, 6);
							if (target.ally.health <= 0) this.removeAlly(target.ally);
						}
					}
				}
			}

			// delegate fallback spawning & incidental spawns to fallback module when available
			try {
				if (typeof this.ensureMinEnemies === 'function') this.ensureMinEnemies(dt, playerPos);
				else {
					// legacy fallback (safety): only spawn when wave system is idle
					const desired = 12 + Math.floor(this.world.score / 30);
					if ((this.waveState === 'idle' || typeof this.waveState === 'undefined') && this.world.enemies.length < desired && this.animating) this.spawnEnemy();
					if (Math.random() < 0.004) { const a = Math.random() * Math.PI * 2; const r = 30 + Math.random()*60; const p = new THREE.Vector3(playerPos.x + Math.cos(a)*r, 0.1, playerPos.z + Math.sin(a)*r); this.spawnExplosion(p); if (this.audio) try { this.audio.explosion({ volume: 0.4 }); this.audio.duckBgm(0.35, 300); } catch(_) {} }
				}
			} catch(_) {}
		};
	} catch(_){}
} 