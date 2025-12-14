import * as THREE from 'three';
import { Selector, Sequence, Conditions, Actions, NodeState, Condition, Action } from './BehaviorTree.js';
import { Blackboard } from './Blackboard.js';
import { AIPerception } from './Perception.js';

/**
 * Advanced AI Controller for Allies
 * Uses Perception + Behavior Trees for human-like decision making
 */
export class AdvancedAllyAI {
    constructor(ally) {
        this.ally = ally;
        this.blackboard = new Blackboard();
        this.perception = new AIPerception(ally);
        this.behaviorTree = this.buildBehaviorTree();
        this.path = [];
        this.pathIndex = 0;
        this.lastPathUpdate = 0;
        this.pathUpdateInterval = 500;

        // Scanning behavior
        this.scanTimer = 0;
        this.isScanning = false;
    }

    buildBehaviorTree() {
        return new Selector('AllyRoot', [
            // Priority 1: SURVIVAL
            new Sequence('Survival', [
                new Selector('SurvivalCheck', [
                    Conditions.GrenadeNearby(8),
                    Conditions.HealthCritical(25)
                ]),
                new Selector('SurvivalAction', [
                    Actions.EvadeGrenade(),
                    Actions.Retreat()
                ])
            ]),

            // Priority 2: ENGAGE VISIBLE
            new Sequence('EngageVisible', [
                // Only engage if we SEE the enemy (not just know about them)
                new Condition('HasVisibleTarget', (e, bb) => bb.visibleEnemies && bb.visibleEnemies.length > 0),
                new Condition('CanEngage', (e, bb) => {
                    // Reaction time check built into perception
                    return e._perception && e._perception.canEngage(bb.currentTarget);
                }),
                new Selector('EngageStyle', [
                    new Sequence('CloseEngage', [
                        Conditions.TargetInRange(12),
                        Actions.Strafe(),
                        Actions.Shoot()
                    ]),
                    new Sequence('MediumEngage', [
                        Conditions.TargetInRange(30),
                        Actions.EngageEnemy(),
                        Actions.Shoot()
                    ]),
                    Actions.MoveToTarget()
                ])
            ]),

            // Priority 3: INVESTIGATE - proactive search
            new Sequence('Investigate', [
                new Condition('HasInvestigationTarget', (e, bb) => {
                    return e._perception && e._perception.getInvestigationTarget() !== null;
                }),
                new Action('MoveToInvestigate', (e, bb, dt) => {
                    if (!e._perception) return NodeState.FAILURE;
                    const target = e._perception.getInvestigationTarget();
                    if (!target) return NodeState.FAILURE;

                    // Use smooth movement
                    e._perception.smoothMoveTo(target, dt, e.speed || 4);
                    e.state = 'investigate';

                    // Clear if reached
                    if (e.mesh.position.distanceTo(target) < 2) {
                        e._perception.clearInvestigation();
                        return NodeState.SUCCESS;
                    }
                    return NodeState.RUNNING;
                })
            ]),

            // Priority 4: SCAN - Look around when alert
            new Sequence('Scan', [
                new Condition('ShouldScan', (e, bb) => {
                    return e._perception && e._perception.alertness > 0.2 &&
                        (!bb.visibleEnemies || bb.visibleEnemies.length === 0);
                }),
                new Action('PerformScan', (e, bb, dt) => {
                    // Rotate body to scan (handled by perception turnSpeed)
                    if (e._perception) {
                        // Random scan direction when no specific target
                        if (Math.random() < 0.02) {
                            e._perception.targetAngle += (Math.random() - 0.5) * Math.PI;
                        }
                    }
                    return NodeState.SUCCESS;
                })
            ]),

            // Priority 5: SUPPORT player
            new Sequence('SupportPlayer', [
                Conditions.PlayerNeedsHelp(),
                Actions.MoveToPlayer()
            ]),

            // Priority 6: PATROL
            Actions.Patrol()
        ]);
    }

    update(dt, context) {
        // Update perception first
        this.ally._perception = this.perception;
        const perceivedState = this.perception.update(dt, context);

        // Update blackboard with PERCEIVED state (not omniscient)
        this.updateBlackboardFromPerception(context, perceivedState);

        // Flanking calculation
        if (Math.random() < 0.02) {
            this.blackboard.calculateFlankingRoute(this.ally);
        }

        // Shoot cooldown
        const now = performance.now() / 1000;
        this.ally.canShoot = (now - this.ally.lastShoot > (this.ally.shootCooldown || 0.3));
        this.ally.wantsToShoot = false;

        // Run behavior tree
        this.behaviorTree.tick(this.ally, this.blackboard, dt);

        // Process shooting - only if perception allows
        let shoot = false;
        let target = null;
        if (this.ally.wantsToShoot && this.ally.canShoot && this.blackboard.currentTarget) {
            if (this.perception.canEngage(this.blackboard.currentTarget)) {
                if (this.ally.pistolAmmo > 0) {
                    this.ally.pistolAmmo--;
                    this.ally.lastShoot = now;
                    shoot = true;
                    target = this.blackboard.currentTarget;
                }
            }
        }

        return { shoot, target };
    }

    updateBlackboardFromPerception(context, perceivedState) {
        const bb = this.blackboard;

        // Player info (always know about player)
        bb.playerPos = context.playerPos;
        bb.playerHealth = context.playerHealth || 100;

        // ONLY use perceived enemies, not all enemies
        bb.visibleEnemies = perceivedState.visibleEnemies.map(e => e.entity);
        bb.nearestEnemy = perceivedState.nearestVisibleEnemy;
        bb.nearestEnemyDist = perceivedState.nearestVisibleDistance;
        bb.nearbyEnemyCount = perceivedState.visibleEnemies.length;

        // Current target from visible enemies
        if (perceivedState.visibleEnemies.length > 0) {
            // Prioritize closest visible enemy
            bb.currentTarget = perceivedState.visibleEnemies.sort((a, b) => a.distance - b.distance)[0].entity;
            bb.targetDistance = perceivedState.visibleEnemies[0].distance;
        } else {
            bb.currentTarget = null;
            bb.targetDistance = Infinity;
            this.perception.clearTargetAcquisition();
        }

        // Last known positions from memory
        if (perceivedState.rememberedEnemies.length > 0) {
            bb.lastKnownEnemyPos = perceivedState.rememberedEnemies[0].predictedPosition;
        }

        // Allies (can always see teammates)
        bb.allies = context.allies || [];
        bb.nearbyAllyCount = bb.allies.filter(a =>
            a !== this.ally && a.mesh &&
            this.ally.mesh.position.distanceTo(a.mesh.position) < 15
        ).length;

        // Grenades (can hear/see)
        bb.grenades = context.grenades || [];
        bb.nearestGrenadeDist = Infinity;
        for (const g of bb.grenades) {
            if (!g.alive || !g.mesh) continue;
            const dist = this.ally.mesh.position.distanceTo(g.mesh.position);
            if (dist < bb.nearestGrenadeDist) {
                bb.nearestGrenadeDist = dist;
                bb.nearestGrenade = g;
            }
        }

        // Cover (analyze based on perceived threats)
        bb.obstacles = context.obstacles || [];
        if (bb.nearestEnemy) {
            bb.updateCoverPoints(this.ally, bb.obstacles);
        }

        // World
        bb.worldCenter = context.worldCenter || new THREE.Vector3(0, 1, 0);
    }
}

/**
 * Advanced AI Controller for Enemies
 * Role-based behavior with perception system
 */
export class AdvancedEnemyAI {
    constructor(enemy) {
        this.enemy = enemy;
        this.blackboard = new Blackboard();
        this.perception = new AIPerception(enemy);
        this.behaviorTree = this.buildBehaviorTree();

        // Set perception parameters based on role
        this.configurePerceptionByRole();
    }

    configurePerceptionByRole() {
        const role = this.enemy.role || 'ASSAULT';

        switch (role) {
            case 'SNIPER':
                this.perception.fov = 60; // Narrow but focused
                this.perception.visionRange = 80; // See far
                this.perception.reactionTime = 0.3; // Slower but accurate
                break;
            case 'FLANKER':
                this.perception.fov = 140; // Wide peripheral
                this.perception.visionRange = 30;
                this.perception.reactionTime = 0.1; // Quick reactions
                break;
            case 'ASSAULT':
            default:
                this.perception.fov = 100;
                this.perception.visionRange = 45;
                this.perception.reactionTime = 0.2;
                break;
        }
    }

    buildBehaviorTree() {
        const role = this.enemy.role || 'ASSAULT';

        switch (role) {
            case 'SNIPER':
                return this.buildSniperTree();
            case 'FLANKER':
                return this.buildFlankerTree();
            default:
                return this.buildAssaultTree();
        }
    }

    buildSniperTree() {
        return new Selector('SniperRoot', [
            new Sequence('Evade', [
                Conditions.GrenadeNearby(10),
                Actions.EvadeGrenade()
            ]),

            new Sequence('Snipe', [
                new Condition('HasVisibleTarget', (e, bb) => bb.visibleEnemies && bb.visibleEnemies.length > 0),
                new Condition('CanEngage', (e, bb) => e._perception && e._perception.canEngage(bb.currentTarget)),
                new Selector('SniperAction', [
                    new Sequence('TooClose', [
                        Conditions.TargetInRange(15),
                        Actions.Retreat()
                    ]),
                    new Sequence('SniperShoot', [
                        Conditions.HasCover(),
                        Actions.TakeCover(),
                        Actions.Shoot()
                    ]),
                    Actions.Shoot()
                ])
            ]),

            // Investigate when hearing sounds
            new Sequence('Investigate', [
                new Condition('HeardSomething', (e, bb) => e._perception && e._perception.recentSounds.length > 0),
                Actions.Investigate()
            ]),

            Actions.Patrol()
        ]);
    }

    buildFlankerTree() {
        return new Selector('FlankerRoot', [
            new Sequence('Evade', [
                Conditions.GrenadeNearby(10),
                Actions.EvadeGrenade()
            ]),

            new Sequence('Flank', [
                new Condition('HasVisibleTarget', (e, bb) => bb.visibleEnemies && bb.visibleEnemies.length > 0),
                new Selector('FlankAction', [
                    new Sequence('FlankAttack', [
                        Conditions.TargetInRange(15),
                        new Condition('CanEngage', (e, bb) => e._perception && e._perception.canEngage(bb.currentTarget)),
                        Actions.Strafe(),
                        Actions.Shoot()
                    ]),
                    Actions.FlankTarget()
                ])
            ]),

            new Sequence('HuntTarget', [
                new Condition('RemembersTarget', (e, bb) => bb.lastKnownEnemyPos !== null),
                Actions.Investigate()
            ]),

            Actions.Patrol()
        ]);
    }

    buildAssaultTree() {
        return new Selector('AssaultRoot', [
            new Sequence('Evade', [
                Conditions.GrenadeNearby(6),
                Actions.EvadeGrenade()
            ]),

            new Sequence('Assault', [
                new Condition('HasVisibleTarget', (e, bb) => bb.visibleEnemies && bb.visibleEnemies.length > 0),
                new Condition('CanEngage', (e, bb) => e._perception && e._perception.canEngage(bb.currentTarget)),
                new Selector('AssaultAction', [
                    new Sequence('CloseAssault', [
                        Conditions.TargetInRange(20),
                        Actions.SuppressingFire(),
                        Actions.MoveToTarget()
                    ]),
                    new Sequence('AdvanceAndShoot', [
                        Actions.MoveToTarget(),
                        Actions.Shoot()
                    ])
                ])
            ]),

            new Sequence('SearchAndDestroy', [
                new Condition('HeardSomething', (e, bb) => e._perception && e._perception.alertness > 0.3),
                Actions.Investigate()
            ]),

            Actions.Patrol()
        ]);
    }

    update(dt, context) {
        this.enemy._perception = this.perception;

        // Update perception with swapped perspective
        const perceivedState = this.perception.update(dt, {
            ...context,
            enemies: [...(context.allies || []), { mesh: { position: context.playerPos } }]
        });

        // Update blackboard from perception
        this.updateBlackboardFromPerception(context, perceivedState);

        // Run behavior tree
        this.enemy.wantsToShoot = false;
        this.behaviorTree.tick(this.enemy, this.blackboard, dt);

        // Shooting only if perception allows
        let shoot = false;
        if (this.enemy.wantsToShoot && this.blackboard.currentTarget) {
            if (this.perception.canEngage(this.blackboard.currentTarget)) {
                shoot = true;
            }
        }

        const acc = (this.enemy.role === 'SNIPER') ? 0.85 :
            (this.enemy.role === 'ASSAULT') ? 0.65 : 0.7;

        const contact = this.blackboard.targetDistance < 1.5;

        return { contact, shoot, acc };
    }

    updateBlackboardFromPerception(context, perceivedState) {
        const bb = this.blackboard;

        // Only perceived enemies
        bb.visibleEnemies = perceivedState.visibleEnemies.map(e => e.entity);
        bb.nearestEnemy = perceivedState.nearestVisibleEnemy;
        bb.nearestEnemyDist = perceivedState.nearestVisibleDistance;
        bb.nearbyEnemyCount = perceivedState.visibleEnemies.length;

        if (perceivedState.visibleEnemies.length > 0) {
            bb.currentTarget = perceivedState.visibleEnemies[0].entity;
            bb.targetDistance = perceivedState.visibleEnemies[0].distance;
        } else {
            bb.currentTarget = null;
            bb.targetDistance = Infinity;
            this.perception.clearTargetAcquisition();
        }

        // Memory
        if (perceivedState.rememberedEnemies.length > 0) {
            bb.lastKnownEnemyPos = perceivedState.rememberedEnemies[0].predictedPosition;
        } else {
            bb.lastKnownEnemyPos = null;
        }

        // Grenades
        bb.grenades = context.grenades || [];
        bb.nearestGrenadeDist = Infinity;
        for (const g of bb.grenades) {
            if (!g.alive || !g.mesh) continue;
            const dist = this.enemy.mesh.position.distanceTo(g.mesh.position);
            if (dist < bb.nearestGrenadeDist) {
                bb.nearestGrenadeDist = dist;
            }
        }

        bb.obstacles = context.obstacles || [];
    }
}
