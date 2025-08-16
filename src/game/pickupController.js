import * as THREE from 'three';
import { AmmoPickup } from '../modules/pickup.js';

export function attachPickupController(game){
	try{
		game.updatePickups = function(dt){
			const now = performance.now() / 1000;
			const maxPickups = 12;
			const interval = 2.6;
			if (now - this.world.lastPickupSpawn > interval && this.world.pickups.length < maxPickups) {
				this.world.lastPickupSpawn = now;
				const bounds = this.world.bounds - 5;
				const pos = new THREE.Vector3((Math.random()-0.5)*bounds*2, 0, (Math.random()-0.5)*bounds*2);
				const baseAmmoChance = 0.55;
				const baseHealthChance = 0.30;
				const baseGrenadeChance = 0.15;
				let ammoChance = baseAmmoChance; let healthChance = baseHealthChance; let grenadeChance = baseGrenadeChance;
				if (this.player.health < 45) { healthChance = Math.min(0.6, healthChance + 0.25); ammoChance = Math.max(0.25, ammoChance - 0.15); }
				if (this.player.ammoReserve < 30) { ammoChance = Math.min(0.85, ammoChance + 0.2); healthChance = Math.max(0.08, healthChance - 0.08); }
				const tot = ammoChance + healthChance + grenadeChance;
				ammoChance /= tot; healthChance /= tot; grenadeChance /= tot;
				const r = Math.random();
				let type = 'pistol';
				if (r < ammoChance) type = 'pistol';
				else if (r < ammoChance + healthChance) type = 'health';
				else type = 'grenade';
				const p = new AmmoPickup(this.scene, pos, type);
				this.world.pickups.push(p);
			}

			for (const p of [...this.world.pickups]) {
				p.update(dt);
				// simple pickup check
				try {
					const d = p.mesh.position.distanceTo(this.controls.getObject().position);
					if (d < 1.2) {
						// apply to player
						if (p instanceof AmmoPickup) {
							let amt = p.amount || 0;
							// scavenger perk increases pickup amount
							try { if (this.perks && this.perks.scavenger) { amt = Math.floor(amt * (1 + 0.35 * this.perks.scavenger)); } } catch(_){ }
							if (p.type === 'grenade') this.player.grenades = Math.min(9, (this.player.grenades||0) + amt);
							else if (p.type === 'health') this.player.health = Math.min((this.player._maxHealth||100), (this.player.health||100) + amt);
							else { this.player.ammoReserve = (this.player.ammoReserve || 0) + amt; }
						}
						// skill pickup
						if (p.isSkill) { try { if (typeof this.applySkill === 'function') this.applySkill(p.key); } catch(_){} }
						// cleanup
						try { p.dispose(this.scene); } catch(_) {}
						this.world.pickups = this.world.pickups.filter(x=>x!==p);
						try { this.markHudDirty(); } catch(_) {}
						try { this.audio.playSample && this.audio.playSample('pickup', { volume: 0.9 }); } catch(_) {}
					}
				} catch(e){ console.error('[PickupController] update pickup error', e); }
			}
			const playerPosXZ = this.controls.getObject().position;
			for (const p of [...this.world.pickups]) {
				if (!p.alive) continue;
				if (p.mesh.position.distanceTo(playerPosXZ) < 1.4) {
					if (p.type === 'grenade') this.player.grenades += p.amount;
					else if (p.type === 'health') this.player.health = Math.min(100, this.player.health + p.amount);
					else this.player.ammoReserve += p.amount;
					p.dispose(this.scene);
					this.world.pickups = this.world.pickups.filter(x => x !== p);
					try { this.markHudDirty(); } catch(_) { try { this.updateHUD(); } catch(_){} }
					continue;
				}
				for (const ally of this.world.allies) {
					if (!p.alive) break;
					if (p.mesh.position.distanceTo(ally.mesh.position) < 1.0) {
						if (p.type === 'grenade') this.player.grenades += Math.max(1, Math.floor(p.amount * 0.5));
						else if (p.type === 'health') this.player.health = Math.min(100, this.player.health + Math.floor(p.amount * 0.5));
						else this.player.ammoReserve += Math.floor(p.amount * 0.5);
						p.dispose(this.scene);
						this.world.pickups = this.world.pickups.filter(x => x !== p);
						try { this.markHudDirty(); } catch(_) { try { this.updateHUD(); } catch(_){} }
						break;
					}
				}
			}
		};

	} catch(e){ console.error('[PickupController] attach error', e); }
} 