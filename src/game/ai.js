import * as THREE from 'three';
import { AdvancedAllyAI, AdvancedEnemyAI } from '../ai/AIController.js';
import { pathfinding } from '../ai/Pathfinding.js';
import { ValueValidator } from '../systems/OptimizationSecurity.js';

/**
 * Attach AI systems to game instance
 * Integrates advanced behavior trees and pathfinding
 */
export function attachAI(game) {
	try {
		// Initialize pathfinding when level loads
		game._initializePathfinding = function () {
			try {
				if (this.world && this.world.obstacles) {
					pathfinding.initialize(this.world.bounds || 100, this.world.obstacles);
					console.log('[AI] Pathfinding initialized');
				}
			} catch (e) {
				console.warn('[AI] Pathfinding init failed:', e);
			}
		};

		// Update allies with advanced AI
		game.updateAllies = function (dt) {
			if (!this.world || !this.world.allies) return;

			const playerPos = this.controls.getObject().position;
			const difficultyMultiplier = (this.config.difficulty === 'hard') ? 1.25 :
				(this.config.difficulty === 'insane' ? 1.6 : 1.0);
			const worldCenter = new THREE.Vector3(0, 1, 0);

			// Build context for AI
			const context = {
				playerPos,
				playerHealth: this.player ? this.player.health : 100,
				enemies: this.world.enemies || [],
				allies: this.world.allies || [],
				obstacles: this.world.obstacles || [],
				obstacleMeshes: this._obstacleMeshes,
				pickups: this.world.pickups || [],
				grenades: this.world.grenades || [],
				difficultyMultiplier,
				worldCenter,
				playerUnderAttack: this._playerUnderAttack || false
			};

			// Store player pos for sprites
			try {
				if (!this.scene.userData) this.scene.userData = {};
				this.scene.userData._gamePlayerPos = playerPos;
				this.scene.userData._alliesList = this.world.allies;
			} catch (_) { }

			for (const ally of this.world.allies) {
				try {
					// Initialize advanced AI if not present
					if (!ally._advancedAI) {
						ally._advancedAI = new AdvancedAllyAI(ally);
					}

					// Use advanced AI
					const action = ally._advancedAI.update(dt, context);

					// Legacy update for visuals
					if (typeof ally.update === 'function') {
						ally.update(dt, context);
					}

					// Process shooting action
					if (action.shoot && action.target) {
						const start = ally.mesh.position.clone();
						start.y = Math.max(start.y, 1.2);
						const end = action.target.mesh.position.clone();
						end.y = Math.max(end.y, 1.2);

						// Validate positions
						if (!ValueValidator.isValidVector3(start) || !ValueValidator.isValidVector3(end)) continue;

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
								ally.kills = (ally.kills || 0) + 1;
								try { this.onEnemyKilled(); } catch (_) { }
								try { this.recordEnemyDeath(action.target); } catch (_) { }
								this.removeEnemy(action.target);
								this.markHudDirty();
								try {
									if (this.waveState === 'idle') { this.spawnEnemy(); }
								} catch (_) { }
							}
						} else {
							// Miss - create miss tracer
							const missAng = (Math.random() - 0.5) * 0.35;
							const rot = new THREE.Matrix4().makeRotationY(missAng);
							const dir = end.clone().sub(start).setY(0).normalize().applyMatrix4(rot);
							const missPoint = start.clone().add(dir.multiplyScalar(shotDist));
							this.spawnTracer(start, missPoint, 0x38bdf8);
						}

						// Sound
						try {
							if (this.audio && this.audio.sfx) {
								this.audio.sfx('allyShot', { volume: 0.3 });
							}
						} catch (_) { }
					}
				} catch (e) {
					console.warn('[AI] Ally update error:', e);
				}
			}
		};

		// Update enemies with advanced AI
		game.updateEnemies = function (dt) {
			if (!this.world || !this.world.enemies) return;

			const playerPos = this.controls.getObject().position;
			const playerMoving = (this.input.forward || this.input.backward || this.input.left || this.input.right);
			const dynamicSkill = Math.min(1.8, 1.0 + this.world.score / 200);
			const difficultyMultiplier = (this.config.difficulty === 'hard') ? 1.25 :
				(this.config.difficulty === 'insane' ? 1.6 : 1.0);

			// Build context for AI (from enemy perspective)
			const context = {
				playerPos,
				playerHealth: this.player ? this.player.health : 100,
				enemies: this.world.enemies || [], // Self
				allies: this.world.allies || [],   // Targets
				obstacles: this.world.obstacles || [],
				obstacleMeshes: this._obstacleMeshes,
				grenades: this.world.grenades || [],
				skill: dynamicSkill,
				playerMoving,
				difficultyMultiplier
			};

			for (const enemy of this.world.enemies) {
				try {
					// Initialize advanced AI if not present
					if (!enemy._advancedAI && enemy.role) {
						enemy._advancedAI = new AdvancedEnemyAI(enemy);
					}

					let act;
					if (enemy._advancedAI) {
						act = enemy._advancedAI.update(dt, context);
					} else {
						// Fallback to legacy update
						act = enemy.update(dt, playerPos, this.world.obstacles, this._obstacleMeshes, {
							grenades: this.world.grenades,
							skill: dynamicSkill,
							playerMoving,
							difficultyMultiplier
						});
					}

					// Contact damage
					if (act.contact) {
						this.takePlayerDamage(this.damageByDifficulty(10, 5) * dt, enemy.mesh.position.clone());
					}

					// Shooting
					if (act.shoot) {
						let target = { pos: playerPos, isPlayer: true };
						let nd = enemy.mesh.position.distanceTo(playerPos);

						// Check if ally is closer
						for (const ally of this.world.allies) {
							const d = enemy.mesh.position.distanceTo(ally.mesh.position);
							if (d < nd) {
								nd = d;
								target = { pos: ally.mesh.position, isPlayer: false, ally };
							}
						}

						const nowMs = performance.now();
						if (nowMs - (this._lastEnemyTracerMs || 0) > 50) {
							const origin = enemy.mesh.position.clone();
							if (!origin.y || origin.y < 0.6) origin.y = 1.6;

							// Validate origin
							if (!ValueValidator.isValidVector3(origin)) continue;

							const dir = target.pos.clone().sub(origin).setY(0).normalize();
							const spread = (1 - (act.acc ?? 0.6)) * 0.15;
							const ang = (Math.random() - 0.5) * spread;
							const rot = new THREE.Matrix4().makeRotationY(ang);
							const d3 = dir.clone().applyMatrix4(rot);
							const intendedEnd = origin.clone().add(d3.multiplyScalar(nd));

							// Raycast for obstacles
							let _blockedShot = false;
							let _lastTracerEnd = intendedEnd;

							try {
								const ray = new THREE.Raycaster(origin, d3, 0, nd);
								const blockers = this._obstacleMeshes || (this.world.obstacles || []).map(o => o.mesh);
								const hits = ray.intersectObjects(blockers, true);
								if (hits && hits.length > 0) {
									_blockedShot = true;
									_lastTracerEnd = hits[0].point.clone();
								}
							} catch (_) { }

							this.spawnTracer(origin, _lastTracerEnd, 0xff6b6b);
							try {
								this.spawnHitSparks(_lastTracerEnd.clone(), 6, 0xff6b6b);
							} catch (_) { }
							this.showShotIndicator(enemy.mesh.position.clone());
							this.playEnemyShotAudio(enemy.mesh.position.clone());
							this.spawnEnemyMuzzleFlash(enemy.mesh.position.clone());
							this._lastEnemyTracerMs = nowMs;

							// Apply damage
							if (target.isPlayer) {
								const hitProb = Math.max(0.1, Math.min(0.9, (act.acc ?? 0.6)));
								if (!_blockedShot && Math.random() < hitProb) {
									this.takePlayerDamage(this.damageByDifficulty(8, 6), enemy.mesh.position.clone());
									try { this.audio.ricochet(); } catch (_) { }
									if (this.player.health <= 0) {
										this.gameOver();
										return;
									}
									this.markHudDirty();
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
				} catch (e) {
					console.warn('[AI] Enemy update error:', e);
				}
			}

			// Fallback spawning
			try {
				if (typeof this.ensureMinEnemies === 'function') {
					this.ensureMinEnemies(dt, playerPos);
				} else {
					const desired = 12 + Math.floor(this.world.score / 30);
					if ((this.waveState === 'idle' || typeof this.waveState === 'undefined') &&
						this.world.enemies.length < desired && this.animating) {
						this.spawnEnemy();
					}
					if (Math.random() < 0.004) {
						const a = Math.random() * Math.PI * 2;
						const r = 30 + Math.random() * 60;
						const p = new THREE.Vector3(playerPos.x + Math.cos(a) * r, 0.1, playerPos.z + Math.sin(a) * r);
						this.spawnExplosion(p);
						if (this.audio) {
							try {
								this.audio.explosion({ volume: 0.4 });
								this.audio.duckBgm(0.35, 300);
							} catch (_) { }
						}
					}
				}
			} catch (_) { }
		};

		console.log('[AI] Advanced AI system attached');

	} catch (e) {
		console.error('[AI] Failed to attach AI:', e);
	}
}