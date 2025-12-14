import * as THREE from 'three';

/**
 * AI Perception System - Human-like Behavior
 * - Field of View limitation
 * - Proactive investigation (no memory decay)
 * - Directional shooting (must face target)
 * - Smooth navigation
 */

export class AIPerception {
    constructor(entity) {
        this.entity = entity;

        // Vision parameters
        this.fov = 120; // degrees
        this.visionRange = 45;
        this.peripheralRange = 15;

        // Memory (no decay - triggers investigation instead)
        this.memory = new Map();
        this.lastKnownPositions = new Map();
        this.investigationTarget = null;

        // Scanning
        this.isScanning = false;
        this.scanTimer = 0;
        this.scanInterval = 0.4 + Math.random() * 0.3;

        // Alertness
        this.alertness = 0;
        this.alertDecayRate = 0.05;

        // Hearing
        this.hearingRange = 25;
        this.recentSounds = [];

        // Reaction time
        this.reactionTime = 0.15 + Math.random() * 0.2;
        this.targetAcquiredTime = 0;
        this.currentTargetId = null;

        // Body rotation (for directional shooting)
        this.bodyAngle = 0; // current Y rotation
        this.targetAngle = 0; // desired Y rotation
        this.turnSpeed = 4.0; // radians per second (smooth turning)

        // Smooth navigation
        this.currentVelocity = new THREE.Vector3();
        this.maxSpeed = 5;
        this.acceleration = 15;
        this.deceleration = 10;

        // Temp vectors
        this._tmpVec = new THREE.Vector3();
        this._tmpVec2 = new THREE.Vector3();
    }

    /**
     * Update perception every frame
     */
    update(dt, context) {
        const { enemies, obstacles } = context;

        // Decay alertness slowly
        if (this.alertness > 0) {
            this.alertness = Math.max(0, this.alertness - this.alertDecayRate * dt);
        }

        // Scan for enemies
        this.scanTimer += dt;
        if (this.scanTimer >= this.scanInterval) {
            this.scanTimer = 0;
            this.performScan(enemies, obstacles);
        }

        // Update body rotation smoothly
        this.updateBodyRotation(dt);

        // Process sounds
        this.processRecentSounds();

        // Check for investigation needs (instead of memory decay)
        this.updateInvestigation();

        return this.getPerceivedState();
    }

    /**
     * Update body rotation to face target direction smoothly
     */
    updateBodyRotation(dt) {
        if (!this.entity.mesh) return;

        // Smoothly interpolate to target angle
        let angleDiff = this.targetAngle - this.bodyAngle;

        // Normalize to -PI to PI
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Smooth rotation
        const maxTurn = this.turnSpeed * dt;
        if (Math.abs(angleDiff) > 0.01) {
            if (Math.abs(angleDiff) <= maxTurn) {
                this.bodyAngle = this.targetAngle;
            } else {
                this.bodyAngle += Math.sign(angleDiff) * maxTurn;
            }
        }

        // Normalize body angle
        while (this.bodyAngle > Math.PI) this.bodyAngle -= Math.PI * 2;
        while (this.bodyAngle < -Math.PI) this.bodyAngle += Math.PI * 2;

        // Apply to mesh
        this.entity.mesh.rotation.y = this.bodyAngle;
    }

    /**
     * Set direction to face (for aiming)
     */
    faceDirection(direction) {
        if (direction.lengthSq() > 0.001) {
            this.targetAngle = Math.atan2(direction.x, direction.z);
        }
    }

    /**
     * Check if entity is facing a position (within tolerance)
     */
    isFacing(position, toleranceDeg = 25) {
        if (!this.entity.mesh) return false;

        const toTarget = this._tmpVec.subVectors(position, this.entity.mesh.position).setY(0);
        if (toTarget.lengthSq() < 0.01) return true;

        const targetAngle = Math.atan2(toTarget.x, toTarget.z);
        let angleDiff = Math.abs(targetAngle - this.bodyAngle);

        // Normalize
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

        const toleranceRad = THREE.MathUtils.degToRad(toleranceDeg);
        return angleDiff <= toleranceRad;
    }

    /**
     * Smooth movement towards target position
     */
    smoothMoveTo(targetPos, dt, speed = null) {
        if (!this.entity.mesh) return;

        const pos = this.entity.mesh.position;
        const direction = this._tmpVec.subVectors(targetPos, pos).setY(0);
        const distance = direction.length();

        if (distance < 0.5) {
            // Close enough, decelerate
            this.currentVelocity.multiplyScalar(1 - this.deceleration * dt);
            return;
        }

        direction.normalize();

        // Accelerate towards target
        const maxSpeed = speed || this.maxSpeed;
        const desiredVelocity = direction.clone().multiplyScalar(maxSpeed);

        // Smooth velocity change
        const accel = this.acceleration * dt;
        this.currentVelocity.lerp(desiredVelocity, Math.min(1, accel));

        // Apply movement
        pos.add(this.currentVelocity.clone().multiplyScalar(dt));

        // Face movement direction
        this.faceDirection(direction);
    }

    /**
     * Get smooth movement velocity
     */
    getVelocity() {
        return this.currentVelocity.clone();
    }

    /**
     * Perform vision scan
     */
    performScan(enemies, obstacles) {
        const pos = this.entity.mesh.position;
        const forward = this.getLookDirection();

        for (const enemy of enemies) {
            if (!enemy.mesh) continue;

            const enemyPos = enemy.mesh.position;
            const toEnemy = this._tmpVec.subVectors(enemyPos, pos);
            const distance = toEnemy.length();

            if (distance > this.visionRange) continue;

            toEnemy.normalize();
            const dot = forward.dot(toEnemy);
            const angleRad = Math.acos(Math.min(1, Math.max(-1, dot)));
            const angleDeg = THREE.MathUtils.radToDeg(angleRad);

            // Within FOV
            if (angleDeg <= this.fov / 2) {
                if (this.hasLineOfSight(pos, enemyPos, obstacles)) {
                    this.registerSighting(enemy, distance, angleDeg, false);
                }
            }
            // Peripheral - detect movement only
            else if (angleDeg <= 90 && distance < this.peripheralRange) {
                if (this.hasLineOfSight(pos, enemyPos, obstacles)) {
                    const lastPos = this.lastKnownPositions.get(enemy.id || enemy);
                    if (lastPos && enemyPos.distanceTo(lastPos) > 0.3) {
                        this.registerSighting(enemy, distance, angleDeg, true);
                    }
                }
            }
        }
    }

    /**
     * Register enemy sighting
     */
    registerSighting(enemy, distance, angle, isPeripheral) {
        const id = enemy.id || enemy;
        const now = performance.now();

        let confidence = 1.0;
        confidence *= Math.max(0.4, 1 - distance / this.visionRange);
        confidence *= Math.max(0.6, 1 - angle / (this.fov / 2));
        if (isPeripheral) confidence *= 0.5;

        this.memory.set(id, {
            entity: enemy,
            position: enemy.mesh.position.clone(),
            velocity: this.estimateVelocity(enemy),
            lastSeen: now,
            confidence: confidence,
            isPeripheral: isPeripheral
        });

        this.lastKnownPositions.set(id, enemy.mesh.position.clone());

        // Clear investigation if we found the target
        if (this.investigationTarget &&
            this.entity.mesh.position.distanceTo(this.investigationTarget) < 5) {
            this.investigationTarget = null;
        }

        this.alertness = Math.min(1, this.alertness + 0.3);
    }

    /**
     * Estimate velocity from position history
     */
    estimateVelocity(enemy) {
        const id = enemy.id || enemy;
        const lastPos = this.lastKnownPositions.get(id);
        if (!lastPos) return new THREE.Vector3();
        return enemy.mesh.position.clone().sub(lastPos);
    }

    /**
     * Check line of sight
     */
    hasLineOfSight(from, to, obstacles) {
        if (!obstacles || obstacles.length === 0) return true;

        const dir = this._tmpVec.subVectors(to, from);
        const distance = dir.length();
        dir.normalize();

        for (const obs of obstacles) {
            if (!obs.mesh || !obs.half) continue;

            const obsPos = obs.mesh.position;
            const half = obs.half;
            const toObs = this._tmpVec2.subVectors(obsPos, from);
            const proj = toObs.dot(dir);

            if (proj > 0 && proj < distance) {
                const closest = from.clone().add(dir.clone().multiplyScalar(proj));
                if (Math.abs(closest.x - obsPos.x) < half.x &&
                    Math.abs(closest.z - obsPos.z) < half.z) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Update investigation target (instead of memory decay)
     */
    updateInvestigation() {
        const now = performance.now();

        for (const [id, entry] of this.memory) {
            const age = now - entry.lastSeen;

            // If enemy lost for 2+ seconds, set investigation target
            if (age > 2000 && age < 10000 && !this.investigationTarget) {
                // Predict where enemy might be
                const predicted = entry.position.clone();
                if (entry.velocity && entry.velocity.lengthSq() > 0.01) {
                    predicted.add(entry.velocity.clone().multiplyScalar(age / 1000));
                }
                this.investigationTarget = predicted;
                this.alertness = Math.min(1, this.alertness + 0.2);
            }

            // Remove very old memories (10+ seconds) but keep investigation
            if (age > 10000) {
                this.memory.delete(id);
            }
        }
    }

    /**
     * Get investigation target if any
     */
    getInvestigationTarget() {
        return this.investigationTarget;
    }

    /**
     * Clear investigation
     */
    clearInvestigation() {
        this.investigationTarget = null;
    }

    /**
     * Hear a sound
     */
    hearSound(position, type, volume = 1) {
        const distance = this.entity.mesh.position.distanceTo(position);
        if (distance < this.hearingRange * volume) {
            this.recentSounds.push({
                position: position.clone(),
                type: type,
                time: performance.now(),
                distance: distance
            });
            this.alertness = Math.min(1, this.alertness + 0.15 * volume);

            // Sound can trigger investigation
            if (!this.investigationTarget) {
                this.investigationTarget = position.clone();
            }
        }
    }

    /**
     * Process recent sounds
     */
    processRecentSounds() {
        const now = performance.now();
        this.recentSounds = this.recentSounds.filter(s => now - s.time < 3000);
    }

    /**
     * Get look direction based on body rotation
     */
    getLookDirection() {
        const forward = new THREE.Vector3(0, 0, 1);
        const quat = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            this.bodyAngle
        );
        forward.applyQuaternion(quat);
        return forward.setY(0).normalize();
    }

    /**
     * Get perceived state for behavior tree
     */
    getPerceivedState() {
        const visibleEnemies = [];
        const rememberedEnemies = [];
        let nearestVisible = null;
        let nearestVisibleDist = Infinity;

        const now = performance.now();

        for (const [id, entry] of this.memory) {
            const age = now - entry.lastSeen;

            // Recently seen = visible
            if (age < 500 && entry.confidence > 0.5) {
                const dist = this.entity.mesh.position.distanceTo(entry.position);
                visibleEnemies.push({
                    entity: entry.entity,
                    position: entry.position,
                    confidence: entry.confidence,
                    distance: dist
                });

                if (dist < nearestVisibleDist) {
                    nearestVisibleDist = dist;
                    nearestVisible = entry.entity;
                }
            }
            // Remembered but not visible
            else if (age < 10000) {
                rememberedEnemies.push({
                    entity: entry.entity,
                    lastKnownPosition: entry.position,
                    confidence: Math.max(0.1, entry.confidence - age / 10000),
                    timeSinceSeen: age / 1000
                });
            }
        }

        return {
            visibleEnemies,
            rememberedEnemies,
            nearestVisibleEnemy: nearestVisible,
            nearestVisibleDistance: nearestVisibleDist,
            alertness: this.alertness,
            isAlert: this.alertness > 0.2,
            hasRecentSounds: this.recentSounds.length > 0,
            investigationTarget: this.investigationTarget
        };
    }

    /**
     * Can engage target (must be facing + reaction time)
     */
    canEngage(target) {
        if (!target || !target.mesh) return false;

        const id = target.id || target;
        const entry = this.memory.get(id);
        const now = performance.now();

        // Must have seen recently
        if (!entry || now - entry.lastSeen > 500) return false;

        // Must have decent confidence
        if (entry.confidence < 0.5) return false;

        // MUST BE FACING THE TARGET
        if (!this.isFacing(target.mesh.position, 30)) {
            // Turn towards target
            const dir = this._tmpVec.subVectors(target.mesh.position, this.entity.mesh.position).setY(0);
            this.faceDirection(dir);
            return false;
        }

        // Reaction time check
        if (this.currentTargetId !== id) {
            this.currentTargetId = id;
            this.targetAcquiredTime = now;
            return false;
        }

        if (now - this.targetAcquiredTime < this.reactionTime * 1000) {
            return false;
        }

        return true;
    }

    /**
     * Clear target acquisition
     */
    clearTargetAcquisition() {
        this.targetAcquiredTime = 0;
        this.currentTargetId = null;
    }
}
