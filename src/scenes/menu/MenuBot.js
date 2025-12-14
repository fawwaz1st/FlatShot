import * as THREE from 'three';

export class MenuBot {
    constructor(scene, team, role, x, z) {
        this.scene = scene;
        this.team = team;
        this.role = role;
        this.color = team === 'blue' ? 0x00f0ff : 0xff3366;

        // Stats
        if (role === 'ASSAULT') {
            this.speed = 12.0;
            this.maxHp = 150;
            this.fireRate = 0.05;
            this.spread = 1.0;
        } else if (role === 'FLANKER') {
            this.speed = 13.5;
            this.maxHp = 100;
            this.fireRate = 0.03;
            this.spread = 0.8;
        } else { // SNIPER
            this.speed = 9.0;
            this.maxHp = 100;
            this.fireRate = 0.012;
            this.spread = 0.1;
        }

        this.hp = this.maxHp;
        this.state = 'IDLE';
        this.stateTimer = Math.random();

        this.targetPos = new THREE.Vector3(x, 0, z);
        this.targetBot = null;

        // Physics
        this.velocity = new THREE.Vector3();
        this.vy = 0; // Vertical vel
        this.onGround = false;
        this.jumpCooldown = 0; // Cooldown for jumping

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
        this.stateTimer -= dt;
        if (this.jumpCooldown > 0) this.jumpCooldown -= dt;

        // Gravity
        this.vy -= 40.0 * dt; // Strong gravity
        if (this.vy < -20) this.vy = -20;

        // Perception
        this._scanForTarget(allBots);

        // State Logic
        if (this.state === 'IDLE') {
            if (this.stateTimer <= 0) this._chooseTacticalCover(arena, allBots);
            if (this.targetBot) {
                this._aimAndFire(dt, arena);
                if (this.stateTimer < 0.5) this._chooseTacticalCover(arena, allBots);
            }
        }
        else if (this.state === 'MOVE') {
            const dist = new THREE.Vector3(this.group.position.x, 0, this.group.position.z)
                .distanceTo(new THREE.Vector3(this.targetPos.x, 0, this.targetPos.z));

            if (dist < 0.5 || this.stateTimer <= 0) {
                this.state = 'IDLE';
                this.stateTimer = 0.3 + Math.random() * 0.7;
            } else {
                // Move Dir (XZ only)
                const moveDir = new THREE.Vector3(this.targetPos.x - this.group.position.x, 0, this.targetPos.z - this.group.position.z).normalize();

                // Horizontal Move
                const step = moveDir.clone().multiplyScalar(this.speed * dt);
                this._moveHorizontal(step, arena);

                // Rotation
                if (this.targetBot && this.role !== 'SNIPER') {
                    this._turnTowards(this.targetBot.group.position, dt * 10);
                } else {
                    this._turnTowards(this.targetPos, dt * 10);
                }

                if (this.targetBot && Math.random() < (this.fireRate * 0.5)) {
                    this._shoot(arena);
                }
            }
        }

        // Apply Vertical Physics
        this._moveVertical(dt, arena);
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
        this.targetBot = nearest;
    }

    _aimAndFire(dt, arena) {
        if (!this.targetBot) return;
        this._turnTowards(this.targetBot.group.position, dt * 12);

        if (arena.checkVisibility(this.group.position, this.targetBot.group.position)) {
            if (Math.random() < this.fireRate) {
                this._shoot(arena);
            }
        }
    }

    _shoot(arena) {
        if (!this.targetBot) return;
        arena.spawnProjectile(this, this.targetBot, this.spread);
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

        const count = 10;
        let bestP = null;
        let bestS = -Infinity;

        for (let i = 0; i < count; i++) {
            const p = arena.getRandomCoverPoint();
            if (!p) continue;

            let score = 0;
            const dMe = p.distanceTo(this.group.position);
            const dEn = p.distanceTo(enemyPos);

            if (this.role === 'ASSAULT') {
                score -= dEn * 1.5;
                score -= dMe * 0.2;
            } else if (this.role === 'SNIPER') {
                score += dEn * 0.5;
                if (dMe > 20) score -= 10;
                // High ground bonus
                if (p.y > 1.0) score += 40;
            } else {
                score += (Math.abs(p.x) + Math.abs(p.z)) * 1.0;
                score -= dEn * 0.2;
            }

            if (dMe < 2) score -= 50;

            if (score > bestS) {
                bestS = score;
                bestP = p;
            }
        }

        if (bestP) {
            this.targetPos.copy(bestP);
            this.targetPos.x += (Math.random() - 0.5) * 2;
            this.targetPos.z += (Math.random() - 0.5) * 2;
            this.state = 'MOVE';
            this.stateTimer = 1.0 + Math.random();
        }
    }

    takeDamage(amt) {
        this.hp -= amt;
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
