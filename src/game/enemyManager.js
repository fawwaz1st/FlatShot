import * as THREE from 'three';

export function attachEnemyManager(game) {
	try {
		game.updateEnemies = function (dt) {
			const playerPos = this.controls.getObject().position;
			const playerMoving = (this.input.forward || this.input.backward || this.input.left || this.input.right);
			const dynamicSkill = Math.min(1.8, 1.0 + this.world.score / 200);
			const difficultyMultiplier = (this.config.difficulty === 'hard') ? 1.25 : (this.config.difficulty === 'insane' ? 1.6 : 1.0);
			const enemySkip = this._lowEnd ? 2 : 1;
			this._enemyPhase = (this._enemyPhase || 0) % enemySkip;
			for (let ei = 0; ei < this.world.enemies.length; ei++) {
				if (this._lowEnd && (ei % enemySkip) !== this._enemyPhase) continue;
				const enemy = this.world.enemies[ei];
				// Pass spatialHash if available, else null (enemy.update handles fallback?)
				// Actually enemy.update signature is (dt, playerPos, obstacles, obstacleMeshesCached, opts)
				// We'll pass it in opts or replace obstacles arg.
				// Best to keep signature but pass spatialHash in opts or rely on logic inside enemy.js
				// Let's modify enemy.js to accept spatialHash in opts.
				const act = enemy.update(dt, playerPos, this.world.obstacles, this._obstacleMeshes, {
					grenades: this.world.grenades,
					skill: dynamicSkill,
					playerMoving,
					difficultyMultiplier,
					spatialHash: this.spatialHash,
					playerVelocity: this.player.velocity
				});
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
					if (nowMs - this._lastEnemyTracerMs > 50) {
						const origin = enemy.mesh.position.clone(); if (!origin.y || origin.y < 0.6) origin.y = 1.6;
						const dir = target.pos.clone().sub(origin).setY(0).normalize();
						const spread = (1 - (act.acc ?? 0.6)) * 0.15;
						const ang = (Math.random() - 0.5) * spread;
						const rot = new THREE.Matrix4().makeRotationY(ang);
						const d3 = dir.clone().applyMatrix4(rot);
						const end = origin.clone().add(d3.multiplyScalar(nd));
						this.spawnTracer(origin, end, 0xff6b6b);
						try { this.spawnHitSparks(new THREE.Vector3(origin.x, origin.y + 0.05, origin.z), 4, 0xff6b6b); } catch (_) { }
						this.showShotIndicator(enemy.mesh.position.clone());
						this.playEnemyShotAudio(enemy.mesh.position.clone());
						this.spawnEnemyMuzzleFlash(enemy.mesh.position.clone());
						this._lastEnemyTracerMs = nowMs;
					}
					if (target.isPlayer) {
						const hitProb = Math.max(0.1, Math.min(0.9, (act.acc ?? 0.6)));
						if (Math.random() < hitProb) {
							this.takePlayerDamage(this.damageByDifficulty(8, 6), enemy.mesh.position.clone());
							try { this.audio.ricochet(); } catch (_) { }
							if (this.player.health <= 0) { this.gameOver(); return; }
							this.markHudDirty();
						}
					} else if (target.ally) {
						const hitProbA = Math.max(0.1, Math.min(0.9, (act.acc ?? 0.6)) * 0.95);
						if (Math.random() < hitProbA) {
							target.ally.health -= this.damageByDifficulty(10, 6);
							if (target.ally.health <= 0) this.removeAlly(target.ally);
						}
					}
				}
			}
			if (this._lowEnd) this._enemyPhase = (this._enemyPhase + 1) % enemySkip;
		};
	} catch (_) { }
} 