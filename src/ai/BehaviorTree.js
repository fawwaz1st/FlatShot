/**
 * FlatShot AI - Behavior Tree Framework
 * Advanced decision-making for intelligent NPCs
 */

// Node States
export const NodeState = {
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    RUNNING: 'RUNNING'
};

/**
 * Base Behavior Tree Node
 */
export class BTNode {
    constructor(name = 'Node') {
        this.name = name;
    }

    tick(entity, blackboard, dt) {
        return NodeState.FAILURE;
    }
}

/**
 * Sequence - Runs children in order, fails on first failure
 */
export class Sequence extends BTNode {
    constructor(name, children = []) {
        super(name);
        this.children = children;
        this.currentIndex = 0;
    }

    tick(entity, blackboard, dt) {
        for (let i = this.currentIndex; i < this.children.length; i++) {
            const result = this.children[i].tick(entity, blackboard, dt);
            if (result === NodeState.RUNNING) {
                this.currentIndex = i;
                return NodeState.RUNNING;
            }
            if (result === NodeState.FAILURE) {
                this.currentIndex = 0;
                return NodeState.FAILURE;
            }
        }
        this.currentIndex = 0;
        return NodeState.SUCCESS;
    }
}

/**
 * Selector - Runs children until one succeeds
 */
export class Selector extends BTNode {
    constructor(name, children = []) {
        super(name);
        this.children = children;
        this.currentIndex = 0;
    }

    tick(entity, blackboard, dt) {
        for (let i = this.currentIndex; i < this.children.length; i++) {
            const result = this.children[i].tick(entity, blackboard, dt);
            if (result === NodeState.RUNNING) {
                this.currentIndex = i;
                return NodeState.RUNNING;
            }
            if (result === NodeState.SUCCESS) {
                this.currentIndex = 0;
                return NodeState.SUCCESS;
            }
        }
        this.currentIndex = 0;
        return NodeState.FAILURE;
    }
}

/**
 * Parallel - Runs all children simultaneously
 */
export class Parallel extends BTNode {
    constructor(name, children = [], successThreshold = 1) {
        super(name);
        this.children = children;
        this.successThreshold = successThreshold;
    }

    tick(entity, blackboard, dt) {
        let successCount = 0;
        let failureCount = 0;
        let runningCount = 0;

        for (const child of this.children) {
            const result = child.tick(entity, blackboard, dt);
            if (result === NodeState.SUCCESS) successCount++;
            else if (result === NodeState.FAILURE) failureCount++;
            else runningCount++;
        }

        if (successCount >= this.successThreshold) return NodeState.SUCCESS;
        if (failureCount > this.children.length - this.successThreshold) return NodeState.FAILURE;
        return NodeState.RUNNING;
    }
}

/**
 * Inverter - Inverts child result
 */
export class Inverter extends BTNode {
    constructor(child) {
        super('Inverter');
        this.child = child;
    }

    tick(entity, blackboard, dt) {
        const result = this.child.tick(entity, blackboard, dt);
        if (result === NodeState.SUCCESS) return NodeState.FAILURE;
        if (result === NodeState.FAILURE) return NodeState.SUCCESS;
        return NodeState.RUNNING;
    }
}

/**
 * Condition Node - Checks a condition
 */
export class Condition extends BTNode {
    constructor(name, conditionFn) {
        super(name);
        this.conditionFn = conditionFn;
    }

    tick(entity, blackboard, dt) {
        return this.conditionFn(entity, blackboard) ? NodeState.SUCCESS : NodeState.FAILURE;
    }
}

/**
 * Action Node - Performs an action
 */
export class Action extends BTNode {
    constructor(name, actionFn) {
        super(name);
        this.actionFn = actionFn;
    }

    tick(entity, blackboard, dt) {
        return this.actionFn(entity, blackboard, dt);
    }
}

/**
 * Wait Node - Waits for specified duration
 */
export class Wait extends BTNode {
    constructor(duration) {
        super('Wait');
        this.duration = duration;
        this.elapsed = 0;
    }

    tick(entity, blackboard, dt) {
        this.elapsed += dt;
        if (this.elapsed >= this.duration) {
            this.elapsed = 0;
            return NodeState.SUCCESS;
        }
        return NodeState.RUNNING;
    }
}

/**
 * Repeater - Repeats child N times
 */
export class Repeater extends BTNode {
    constructor(child, times = -1) {
        super('Repeater');
        this.child = child;
        this.times = times; // -1 = infinite
        this.count = 0;
    }

    tick(entity, blackboard, dt) {
        const result = this.child.tick(entity, blackboard, dt);
        if (result === NodeState.RUNNING) return NodeState.RUNNING;

        this.count++;
        if (this.times > 0 && this.count >= this.times) {
            this.count = 0;
            return NodeState.SUCCESS;
        }
        return NodeState.RUNNING;
    }
}

/**
 * RandomSelector - Randomly picks a child to run
 */
export class RandomSelector extends BTNode {
    constructor(name, children = []) {
        super(name);
        this.children = children;
    }

    tick(entity, blackboard, dt) {
        const shuffled = [...this.children].sort(() => Math.random() - 0.5);
        for (const child of shuffled) {
            const result = child.tick(entity, blackboard, dt);
            if (result !== NodeState.FAILURE) return result;
        }
        return NodeState.FAILURE;
    }
}

// ============================================
// PRE-BUILT CONDITIONS
// ============================================

export const Conditions = {
    HealthCritical: (threshold = 30) => new Condition('HealthCritical', (e, bb) => e.health < threshold),
    HealthLow: (threshold = 50) => new Condition('HealthLow', (e, bb) => e.health < threshold),
    AmmoLow: (threshold = 5) => new Condition('AmmoLow', (e, bb) => (e.pistolAmmo || 0) < threshold),
    EnemyVisible: () => new Condition('EnemyVisible', (e, bb) => bb.visibleEnemies && bb.visibleEnemies.length > 0),
    EnemyNearby: (range = 15) => new Condition('EnemyNearby', (e, bb) => bb.nearestEnemyDist < range),
    GrenadeNearby: (range = 8) => new Condition('GrenadeNearby', (e, bb) => bb.nearestGrenadeDist < range),
    Outnumbered: () => new Condition('Outnumbered', (e, bb) => bb.nearbyEnemyCount > bb.nearbyAllyCount),
    HasCover: () => new Condition('HasCover', (e, bb) => bb.nearestCover !== null),
    InCover: () => new Condition('InCover', (e, bb) => bb.isInCover),
    PlayerNeedsHelp: () => new Condition('PlayerNeedsHelp', (e, bb) => bb.playerHealth < 40 || bb.playerUnderAttack),
    HasTarget: () => new Condition('HasTarget', (e, bb) => bb.currentTarget !== null),
    TargetInRange: (range = 25) => new Condition('TargetInRange', (e, bb) => bb.targetDistance < range),
    IsRole: (role) => new Condition(`IsRole:${role}`, (e, bb) => e.role === role),
    Random: (chance = 0.5) => new Condition('Random', () => Math.random() < chance)
};

// ============================================
// PRE-BUILT ACTIONS
// ============================================

export const Actions = {
    MoveToTarget: () => new Action('MoveToTarget', (e, bb, dt) => {
        if (!bb.currentTarget) return NodeState.FAILURE;
        const target = bb.currentTarget.mesh ? bb.currentTarget.mesh.position : bb.currentTarget;
        e.moveTowards(target, dt);
        return NodeState.SUCCESS;
    }),

    MoveToPlayer: () => new Action('MoveToPlayer', (e, bb, dt) => {
        if (!bb.playerPos) return NodeState.FAILURE;
        e.moveTowards(bb.playerPos, dt);
        return NodeState.SUCCESS;
    }),

    TakeCover: () => new Action('TakeCover', (e, bb, dt) => {
        if (!bb.nearestCover) return NodeState.FAILURE;
        e.waypoint = bb.nearestCover.clone();
        e.state = 'takeCover';
        return NodeState.SUCCESS;
    }),

    Retreat: () => new Action('Retreat', (e, bb, dt) => {
        if (!bb.nearestEnemy) return NodeState.FAILURE;
        const away = e.mesh.position.clone().sub(bb.nearestEnemy.mesh.position).setY(0).normalize().multiplyScalar(12);
        e.waypoint = e.mesh.position.clone().add(away);
        e.state = 'retreat';
        return NodeState.SUCCESS;
    }),

    EvadeGrenade: () => new Action('EvadeGrenade', (e, bb, dt) => {
        if (!bb.nearestGrenade) return NodeState.FAILURE;
        const away = e.mesh.position.clone().sub(bb.nearestGrenade.mesh.position).setY(0).normalize().multiplyScalar(10);
        e.waypoint = e.mesh.position.clone().add(away);
        e.state = 'evade';
        return NodeState.SUCCESS;
    }),

    EngageEnemy: () => new Action('EngageEnemy', (e, bb, dt) => {
        if (!bb.currentTarget) return NodeState.FAILURE;
        e.targetEnemy = bb.currentTarget;
        e.state = 'engage';
        return NodeState.SUCCESS;
    }),

    Shoot: () => new Action('Shoot', (e, bb, dt) => {
        if (!bb.currentTarget || !e.canShoot) return NodeState.FAILURE;
        e.wantsToShoot = true;
        return NodeState.SUCCESS;
    }),

    Patrol: () => new Action('Patrol', (e, bb, dt) => {
        if (!e.waypoint || e.mesh.position.distanceTo(e.waypoint) < 2) {
            e.waypoint = e.chooseWaypoint(bb.worldCenter || e.mesh.position, 8, 25);
        }
        e.state = 'patrol';
        return NodeState.SUCCESS;
    }),

    Investigate: () => new Action('Investigate', (e, bb, dt) => {
        if (!bb.lastKnownEnemyPos) return NodeState.FAILURE;
        e.waypoint = bb.lastKnownEnemyPos.clone();
        e.state = 'investigate';
        return NodeState.SUCCESS;
    }),

    Strafe: () => new Action('Strafe', (e, bb, dt) => {
        if (!bb.currentTarget) return NodeState.FAILURE;
        const toEnemy = bb.currentTarget.mesh.position.clone().sub(e.mesh.position).setY(0).normalize();
        const right = { x: -toEnemy.z, z: toEnemy.x };
        const side = Math.random() < 0.5 ? 1 : -1;
        e.mesh.position.x += right.x * side * e.speed * 0.6 * dt;
        e.mesh.position.z += right.z * side * e.speed * 0.6 * dt;
        return NodeState.SUCCESS;
    }),

    FlankTarget: () => new Action('FlankTarget', (e, bb, dt) => {
        if (!bb.currentTarget || !bb.flankingRoute) return NodeState.FAILURE;
        e.waypoint = bb.flankingRoute;
        e.state = 'flank';
        return NodeState.SUCCESS;
    }),

    SuppressingFire: () => new Action('SuppressingFire', (e, bb, dt) => {
        e.shootCooldown = Math.min(e.shootCooldown, 0.15);
        e.wantsToShoot = true;
        return NodeState.SUCCESS;
    }),

    HoldPosition: () => new Action('HoldPosition', (e, bb, dt) => {
        e.state = 'hold';
        return NodeState.SUCCESS;
    }),

    Regroup: () => new Action('Regroup', (e, bb, dt) => {
        if (!bb.playerPos) return NodeState.FAILURE;
        e.waypoint = e.chooseWaypoint(bb.playerPos, 3, 8);
        e.state = 'regroup';
        return NodeState.SUCCESS;
    })
};
