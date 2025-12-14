import * as THREE from 'three';

export class MenuBot {
    constructor(scene, team, role, x, z) {
        this.scene = scene;
        this.team = team;
        this.role = role;
        this.color = team === 'blue' ? 0x00f0ff : 0xff3366;

        // Stats - AGGRESSIVE (Base Stats)
        if (role === 'ASSAULT') {
            this.baseSpeed = 16.0;
            this.baseMaxHp = 120;
            this.baseFireRate = 0.12;
            this.spread = 0.8;
        } else if (role === 'FLANKER') {
            this.baseSpeed = 18.0;
            this.baseMaxHp = 80;
            this.baseFireRate = 0.10;
            this.spread = 0.6;
        } else { // SNIPER
            this.baseSpeed = 12.0;
            this.baseMaxHp = 80;
            this.baseFireRate = 0.04;
            this.spread = 0.15;
        }

        // Current Stats (will be modified by buffs)
        this.speed = this.baseSpeed;
        this.maxHp = this.baseMaxHp;
        this.fireRate = this.baseFireRate;

        this.hp = this.maxHp;
        this.state = 'IDLE';
        this.stateTimer = Math.random();

        this.targetPos = new THREE.Vector3(x, 0, z);
        this.targetBot = null;

        // Advanced AI State
        this.lastTargetPos = null;
        this.targetVelocity = new THREE.Vector3();
        this.underFire = false;
        this.underFireTimer = 0;
        this.dodgeDir = new THREE.Vector3();
        this.flanking = false;
        this.suppressTimer = 0;
        this.awarenessLevel = 0; // 0-1, increases when seeing enemies

        // Physics
        this.velocity = new THREE.Vector3();
        this.vy = 0;
        this.onGround = false;
        this.jumpCooldown = 0;

        // Mesh
        this.group = new THREE.Group();
        this._buildMesh();
        this.group.position.set(x, 0, z);
        this.scene.add(this.group);
    }

    _buildMesh() {
        const bodyH = this.role === 'SNIPER' ? 1.0 : (this.role === 'ASSAULT' ? 1.3 : 1.2);
        const bodyW = this.role === 'ASSAULT' ? 0.7 : 0.6;

        // 1. Body (Capsule)
        const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(bodyW * 0.5, bodyH, 4, 8),
            new THREE.MeshStandardMaterial({
                color: this.color,
                roughness: 0.4,
                metalness: 0.6,
                emissive: this.color,
                emissiveIntensity: 0.2
            })
        );
        body.position.y = bodyH * 0.8;
        this.group.add(body);

        // 2. Armor/Vest (Box)
        const vest = new THREE.Mesh(
            new THREE.BoxGeometry(bodyW * 1.1, bodyH * 0.5, bodyW * 1.1),
            new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 })
        );
        vest.position.y = 0.2;
        body.add(vest);

        // 3. Eye/Visor (Glowing Strip)
        const eye = new THREE.Mesh(
            new THREE.BoxGeometry(bodyW * 0.8, 0.2, 0.3),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        eye.position.set(0, bodyH * 0.3, bodyW * 0.4);
        body.add(eye);

        // 4. Backpack (Battery Pack)
        const backpack = new THREE.Mesh(
            new THREE.BoxGeometry(bodyW * 0.8, bodyH * 0.6, 0.3),
            new THREE.MeshStandardMaterial({ color: 0x111111 })
        );
        backpack.position.set(0, 0, -bodyW * 0.5);
        body.add(backpack);

        // 5. Weapon
        const weapon = this._buildWeapon(this.role);
        weapon.position.set(0.4, 0, 0.5);
        body.add(weapon);
    }

    _buildWeapon(role) {
        const group = new THREE.Group();
        const matBody = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const matAccent = new THREE.MeshBasicMaterial({ color: this.color });

        if (role === 'SNIPER') {
            // Long Rifle
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.8), matBody);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2), matBody);
            barrel.rotation.x = -Math.PI / 2;
            barrel.position.z = 0.6;
            const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3), matBody);
            scope.rotation.x = -Math.PI / 2;
            scope.position.y = 0.12;

            group.add(body, barrel, scope);
        }
        else if (role === 'ASSAULT') {
            // Standard Rifle
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.6), matBody);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6), matBody);
            barrel.rotation.x = -Math.PI / 2;
            barrel.position.z = 0.4;
            const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.1), matAccent);
            mag.position.set(0, -0.15, 0.1);

            group.add(body, barrel, mag);
        }
        else { // FLANKER
            // Dual SMG (Visualized as one blocky SMG for now or 2 small ones)
            // Let's do one compact SMG
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.35), matBody);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3), matBody);
            barrel.rotation.x = -Math.PI / 2;
            barrel.position.z = 0.25;
            const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.05), matBody);
            grip.position.set(0, -0.15, -0.1);

            group.add(body, barrel, grip);
        }

        return group;
    }

    update(dt, arena, allBots) {
        if (this.hp <= 0) return;

        // Apply Team Buffs
        if (arena.getTeamBuff) {
            const buff = arena.getTeamBuff(this.team);
            this.speed = this.baseSpeed * buff;
            this.fireRate = this.baseFireRate * buff;
            // HP buff only increases cap, current HP stays proportional or heals?
            // For now just speed and aggression
        }

        this.stateTimer -= dt;
        if (this.jumpCooldown > 0) this.jumpCooldown -= dt;
        if (this.underFireTimer > 0) this.underFireTimer -= dt;
        else this.underFire = false;
        if (this.suppressTimer > 0) this.suppressTimer -= dt;

        // Gravity
        this.vy -= 40.0 * dt;
        if (this.vy < -20) this.vy = -20;

        // Perception with prediction
        this._scanForTarget(allBots);
        this._updateAwareness(dt);

        // Dodging when under fire
        if (this.underFire && this.onGround && Math.random() < 0.05) {
            this._dodge(arena);
        }

        // State Logic
        if (this.state === 'IDLE') {
            if (this.stateTimer <= 0) {
                // Check for objective from arena game mode (pass allBots for role assignment)
                const objective = arena.getObjective ? arena.getObjective(this, allBots) : null;
                const gameMode = arena.gameMode || 'dm';

                if (gameMode === 'dm') {
                    // DEATHMATCH: Brutal - rush directly to nearest enemy
                    if (this.targetBot && this.targetBot.hp > 0) {
                        this.targetPos.copy(this.targetBot.group.position);
                        this.state = 'MOVE';
                        this.stateTimer = 0.5 + Math.random() * 0.5; // Short bursts
                    } else {
                        // No target? Hunt aggressively
                        this.targetPos.set(
                            (Math.random() - 0.5) * 80,
                            0,
                            (Math.random() - 0.5) * 60
                        );
                        this.state = 'MOVE';
                        this.stateTimer = 1.0;
                    }
                } else if (gameMode === 'ctf') {
                    // CTF: Sneaky but aggressive - flank more often
                    if (objective && Math.random() < 0.8) {
                        this.targetPos.copy(objective.position);
                        // Add flanking offset for sneaky approach
                        if (objective.type === 'attack') {
                            this.targetPos.x += (Math.random() - 0.5) * 20;
                            this.targetPos.z += (Math.random() - 0.5) * 20;
                        }
                        this.state = Math.random() < 0.4 ? 'FLANK' : 'MOVE';
                        this.stateTimer = 1.5 + Math.random();
                    } else {
                        this._chooseTacticalCover(arena, allBots);
                    }
                } else if (gameMode === 'koth' && objective) {
                    // KOTH: Focus on hill zone
                    if (Math.random() < 0.85) {
                        this.targetPos.copy(objective.position);
                        // Spread out in zone
                        this.targetPos.x += (Math.random() - 0.5) * 10;
                        this.targetPos.z += (Math.random() - 0.5) * 10;
                        this.state = 'MOVE';
                        this.stateTimer = 1.0 + Math.random();
                    } else {
                        this._chooseTacticalCover(arena, allBots);
                    }
                } else {
                    this._chooseTacticalCover(arena, allBots);
                }
            }
            if (this.targetBot) {
                this._aimAndFire(dt, arena);
                // React faster when aware
                if (this.stateTimer < 0.5 - this.awarenessLevel * 0.3) {
                    this._chooseTacticalCover(arena, allBots);
                }
            }
        }
        else if (this.state === 'MOVE') {
            const dist = new THREE.Vector3(this.group.position.x, 0, this.group.position.z)
                .distanceTo(new THREE.Vector3(this.targetPos.x, 0, this.targetPos.z));

            if (dist < 0.5 || this.stateTimer <= 0) {
                this.state = 'IDLE';
                this.stateTimer = 0.2 + Math.random() * 0.5;
                this.flanking = false;
            } else {
                const moveDir = new THREE.Vector3(
                    this.targetPos.x - this.group.position.x, 0,
                    this.targetPos.z - this.group.position.z
                ).normalize();

                const step = moveDir.clone().multiplyScalar(this.speed * dt);
                this._moveHorizontal(step, arena);

                // Smart rotation
                if (this.targetBot && arena.checkVisibility(this.group.position, this.targetBot.group.position)) {
                    this._turnTowards(this.targetBot.group.position, dt * 12);
                    // Shoot while moving (suppression)
                    if (this.suppressTimer <= 0 && Math.random() < this.fireRate * 0.8) {
                        this._shoot(arena);
                    }
                } else {
                    this._turnTowards(this.targetPos, dt * 8);
                }
            }
        }
        else if (this.state === 'FLANK') {
            // Flanking movement - move perpendicular to enemy
            const dist = this.group.position.distanceTo(this.targetPos);
            if (dist < 1.0 || this.stateTimer <= 0) {
                this.state = 'IDLE';
                this.stateTimer = 0.3;
            } else {
                const moveDir = new THREE.Vector3(
                    this.targetPos.x - this.group.position.x, 0,
                    this.targetPos.z - this.group.position.z
                ).normalize();
                const step = moveDir.clone().multiplyScalar(this.speed * 1.2 * dt);
                this._moveHorizontal(step, arena);
                if (this.targetBot) {
                    this._turnTowards(this.targetBot.group.position, dt * 10);
                }
            }
        }
        else if (this.state === 'DODGE') {
            // Quick sideways dodge
            const step = this.dodgeDir.clone().multiplyScalar(this.speed * 1.5 * dt);
            this._moveHorizontal(step, arena);
            if (this.stateTimer <= 0) {
                this.state = 'IDLE';
                this.stateTimer = 0.1;
            }
        }

        // Apply Vertical Physics
        this._moveVertical(dt, arena);
    }

    _updateAwareness(dt) {
        if (this.targetBot && this.targetBot.hp > 0) {
            this.awarenessLevel = Math.min(1, this.awarenessLevel + dt * 0.5);
        } else {
            this.awarenessLevel = Math.max(0, this.awarenessLevel - dt * 0.2);
        }
    }

    _dodge(arena) {
        // Quick strafe left or right
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
        this.dodgeDir = right.multiplyScalar(Math.random() > 0.5 ? 1 : -1);
        this.state = 'DODGE';
        this.stateTimer = 0.25;
    }

    _moveHorizontal(vec, arena) {
        // Apply movement
        this.group.position.add(vec);

        // Resolve Collision via Arena Box3 System
        // Bot radius approx 0.4
        const col = arena.resolveCollision(this.group.position, 0.4);

        if (col) {
            // Push back
            this.group.position.add(col.push);

            // Smart Jump Check
            const isJumpable = (col.h <= this.group.position.y + 3.5);

            // Only try jump if on ground
            if (this.onGround) {
                if (isJumpable && this.jumpCooldown <= 0) {
                    this._jump(arena);
                    this.jumpCooldown = 1.5;
                } else if (!isJumpable) {
                    // High wall -> Stop and Fight/Think
                    this.state = 'IDLE';
                    this.stateTimer = 0.2;
                }
            }
        }
    }

    _moveVertical(dt, arena) {
        this.group.position.y += this.vy * dt;

        // Ground Check
        if (this.group.position.y <= 0) {
            this.group.position.y = 0;
            this.vy = 0;
            this.onGround = true;
            return;
        }

        // Obstacle Top Check
        const colObj = arena.getCollisionData(this.group.position.x, this.group.position.z);
        if (colObj) {
            // If we fall onto it
            if (this.vy < 0 && this.group.position.y <= colObj.h) {
                // If we were previously above it logic:
                // Just snap to top
                if (this.group.position.y > colObj.h - 1.0) { // Tolerance
                    this.group.position.y = colObj.h;
                    this.vy = 0;
                    this.onGround = true;
                    return;
                }
            }
        }

        this.onGround = false;
    }

    _jump(arena) {
        this.vy = 22.0; // Boosted Jump Force (was 12.0)
        this.onGround = false;
        try { arena.playSfx('jump'); } catch (_) { }
    }

    _scanForTarget(allBots) {
        let nearest = null;
        let minD = Infinity;
        for (const other of allBots) {
            if (other.team !== this.team && other.hp > 0) {
                const d = this.group.position.distanceTo(other.group.position);
                if (d < minD) {
                    minD = d;
                    nearest = other;
                }
            }
        }

        // Track target velocity for prediction
        if (nearest && this.targetBot === nearest && this.lastTargetPos) {
            this.targetVelocity.subVectors(nearest.group.position, this.lastTargetPos);
        } else {
            this.targetVelocity.set(0, 0, 0);
        }

        if (nearest) {
            this.lastTargetPos = nearest.group.position.clone();
        }

        this.targetBot = nearest;
    }

    _aimAndFire(dt, arena) {
        if (!this.targetBot) return;

        // Predict target position
        const predictionTime = 0.15 + Math.random() * 0.1;
        const predictedPos = this.targetBot.group.position.clone()
            .add(this.targetVelocity.clone().multiplyScalar(predictionTime * 60));

        this._turnTowards(predictedPos, dt * 12);

        if (arena.checkVisibility(this.group.position, this.targetBot.group.position)) {
            if (Math.random() < this.fireRate) {
                this._shoot(arena);
            }
        }
    }

    _shoot(arena) {
        if (!this.targetBot) return;
        arena.spawnProjectile(this, this.targetBot, this.spread);
        this.suppressTimer = 0.1;
    }

    // Called when hit by projectile
    registerHit() {
        this.underFire = true;
        this.underFireTimer = 1.5;
    }

    _turnTowards(pos, speed) {
        const dummy = new THREE.Object3D();
        dummy.position.copy(this.group.position);
        dummy.lookAt(pos.x, this.group.position.y, pos.z);
        this.group.quaternion.slerp(dummy.quaternion, speed);
    }

    _chooseTacticalCover(arena, allBots) {
        const enemy = this.targetBot;
        const enemyPos = enemy ? enemy.group.position : new THREE.Vector3();

        // Flanker role - go for flanking position
        if (this.role === 'FLANKER' && enemy && Math.random() < 0.6) {
            this._initiateFlank(enemy, arena);
            return;
        }

        const count = 15;
        let bestP = null;
        let bestS = -Infinity;

        for (let i = 0; i < count; i++) {
            const p = arena.getRandomCoverPoint();
            if (!p) continue;

            let score = 0;
            const dMe = p.distanceTo(this.group.position);
            const dEn = enemy ? p.distanceTo(enemyPos) : 0;

            if (this.role === 'ASSAULT') {
                score -= dEn * 1.5;
                score -= dMe * 0.3;
                // Prefer positions with line of sight
                if (enemy && arena.checkVisibility(p, enemyPos)) score += 30;
            } else if (this.role === 'SNIPER') {
                score += dEn * 0.5;
                if (dMe > 25) score -= 15;
                if (p.y > 1.0) score += 50; // High ground bonus
                // Prefer positions with line of sight
                if (enemy && arena.checkVisibility(p, enemyPos)) score += 40;
            } else {
                // Flanker uses _initiateFlank instead
                score += (Math.abs(p.x) + Math.abs(p.z)) * 1.0;
                score -= dEn * 0.1;
            }

            // Avoid positions too close to current
            if (dMe < 3) score -= 60;

            // Avoid crowding with allies
            for (const bot of allBots) {
                if (bot !== this && bot.team === this.team && bot.hp > 0) {
                    const d = p.distanceTo(bot.group.position);
                    if (d < 5) score -= 20;
                }
            }

            if (score > bestS) {
                bestS = score;
                bestP = p;
            }
        }

        if (bestP) {
            this.targetPos.copy(bestP);
            this.targetPos.x += (Math.random() - 0.5) * 3;
            this.targetPos.z += (Math.random() - 0.5) * 3;
            this.state = 'MOVE';
            this.stateTimer = 1.2 + Math.random() * 0.8;
        }
    }

    _initiateFlank(enemy, arena) {
        // Calculate flanking position - perpendicular to enemy direction
        const toEnemy = new THREE.Vector3().subVectors(enemy.group.position, this.group.position);
        const perpendicular = new THREE.Vector3(-toEnemy.z, 0, toEnemy.x).normalize();

        // Choose left or right flank based on which is clearer
        const flankDist = 15 + Math.random() * 10;
        const leftPos = this.group.position.clone().add(perpendicular.clone().multiplyScalar(flankDist));
        const rightPos = this.group.position.clone().add(perpendicular.clone().multiplyScalar(-flankDist));

        // Pick the one further from enemy's facing direction
        const enemyForward = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.group.quaternion);
        const leftAngle = Math.abs(enemyForward.dot(perpendicular));
        const rightAngle = Math.abs(enemyForward.dot(perpendicular.clone().negate()));

        this.targetPos = leftAngle > rightAngle ? leftPos : rightPos;
        this.targetPos.y = 0;
        this.state = 'FLANK';
        this.stateTimer = 2.0;
        this.flanking = true;
    }

    takeDamage(amt) {
        this.hp -= amt;
        this.registerHit(); // Trigger under fire state
        if (this.hp <= 0) {
            this.scene.remove(this.group);
        }
    }

    respawn(x, z) {
        this.hp = this.maxHp;
        this.scene.add(this.group);
        this.group.position.set(x, 0, z);
        this.vy = 0; // reset physics
        this.state = 'IDLE';
    }

    destroy() {
        this.scene.remove(this.group);
    }
}
