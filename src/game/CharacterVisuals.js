import * as THREE from 'three';

/**
 * Enhanced Character Visuals
 * Creates detailed, stylized character models for AI units
 */

// Shared materials (for performance)
const SharedMaterials = {
    // Ally team colors
    allyBody: new THREE.MeshStandardMaterial({
        color: 0x0a1628,
        roughness: 0.3,
        metalness: 0.7,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.3
    }),
    allyArmor: new THREE.MeshStandardMaterial({
        color: 0x1e3a5f,
        roughness: 0.4,
        metalness: 0.6
    }),
    allyVisor: new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.9
    }),
    allyAccent: new THREE.MeshBasicMaterial({
        color: 0x38bdf8
    }),

    // Enemy team colors
    enemyBody: new THREE.MeshStandardMaterial({
        color: 0x280a0a,
        roughness: 0.3,
        metalness: 0.7,
        emissive: 0xff4444,
        emissiveIntensity: 0.3
    }),
    enemyArmor: new THREE.MeshStandardMaterial({
        color: 0x5f1e1e,
        roughness: 0.4,
        metalness: 0.6
    }),
    enemyVisor: new THREE.MeshStandardMaterial({
        color: 0xff3333,
        emissive: 0xff3333,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.9
    }),
    enemyAccent: new THREE.MeshBasicMaterial({
        color: 0xff6b6b
    }),

    // Shared
    weapon: new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.2,
        metalness: 0.9
    }),
    joint: new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.5,
        metalness: 0.5
    })
};

/**
 * Create enhanced ally character model
 */
export function createAllyModel(role = 'STANDARD') {
    const group = new THREE.Group();

    // Body dimensions based on role
    const config = getRoleConfig(role, 'ally');

    // 1. Main Body (Capsule)
    const bodyGeo = new THREE.CapsuleGeometry(config.bodyWidth * 0.5, config.bodyHeight, 8, 16);
    const body = new THREE.Mesh(bodyGeo, SharedMaterials.allyBody);
    body.position.y = config.bodyHeight * 0.6;
    group.add(body);

    // 2. Vest/Armor
    const vestGeo = new THREE.BoxGeometry(
        config.bodyWidth * 1.2,
        config.bodyHeight * 0.5,
        config.bodyWidth * 0.8
    );
    const vest = new THREE.Mesh(vestGeo, SharedMaterials.allyArmor);
    vest.position.y = config.bodyHeight * 0.5;
    group.add(vest);

    // 3. Shoulder pads
    const shoulderGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const leftShoulder = new THREE.Mesh(shoulderGeo, SharedMaterials.allyArmor);
    leftShoulder.position.set(-config.bodyWidth * 0.6, config.bodyHeight * 0.7, 0);
    leftShoulder.scale.set(1, 0.6, 1);
    group.add(leftShoulder);

    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.x = config.bodyWidth * 0.6;
    group.add(rightShoulder);

    // 4. Helmet/Head
    const headGeo = new THREE.SphereGeometry(0.25, 12, 12);
    const head = new THREE.Mesh(headGeo, SharedMaterials.allyBody);
    head.position.y = config.bodyHeight + 0.3;
    head.scale.set(1, 0.9, 0.95);
    group.add(head);

    // 5. Visor (glowing eyes)
    const visorGeo = new THREE.BoxGeometry(0.35, 0.08, 0.15);
    const visor = new THREE.Mesh(visorGeo, SharedMaterials.allyVisor);
    visor.position.set(0, config.bodyHeight + 0.32, 0.18);
    group.add(visor);

    // 6. Visor Glow Effect
    const visorGlowGeo = new THREE.PlaneGeometry(0.4, 0.15);
    const visorGlowMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    const visorGlow = new THREE.Mesh(visorGlowGeo, visorGlowMat);
    visorGlow.position.set(0, config.bodyHeight + 0.32, 0.25);
    group.add(visorGlow);

    // 7. Antenna (for squad leaders)
    if (role === 'LEADER' || Math.random() < 0.3) {
        const antennaGeo = new THREE.CylinderGeometry(0.015, 0.01, 0.3, 6);
        const antenna = new THREE.Mesh(antennaGeo, SharedMaterials.allyAccent);
        antenna.position.set(-0.15, config.bodyHeight + 0.5, -0.1);
        antenna.rotation.z = 0.2;
        group.add(antenna);

        // Antenna tip light
        const tipGeo = new THREE.SphereGeometry(0.03, 6, 6);
        const tip = new THREE.Mesh(tipGeo, SharedMaterials.allyVisor);
        tip.position.set(-0.21, config.bodyHeight + 0.65, -0.1);
        group.add(tip);
    }

    // 8. Weapon
    const weaponGroup = createWeaponModel(role, 'ally');
    weaponGroup.position.set(config.bodyWidth * 0.4, config.bodyHeight * 0.4, 0.2);
    group.add(weaponGroup);

    // 9. Leg stripes (accent lighting)
    const stripeGeo = new THREE.BoxGeometry(0.05, 0.4, 0.05);
    const leftStripe = new THREE.Mesh(stripeGeo, SharedMaterials.allyAccent);
    leftStripe.position.set(-0.15, 0.2, 0.2);
    group.add(leftStripe);

    const rightStripe = leftStripe.clone();
    rightStripe.position.x = 0.15;
    group.add(rightStripe);

    // Store role info
    group.userData.role = role;
    group.userData.team = 'ally';
    group.userData._visorGlow = visorGlow;

    return group;
}

/**
 * Create enhanced enemy character model
 */
export function createEnemyModel(role = 'ASSAULT') {
    const group = new THREE.Group();
    const config = getRoleConfig(role, 'enemy');

    // 1. Main Body
    const bodyGeo = new THREE.CapsuleGeometry(config.bodyWidth * 0.5, config.bodyHeight, 8, 16);
    const body = new THREE.Mesh(bodyGeo, SharedMaterials.enemyBody);
    body.position.y = config.bodyHeight * 0.6;
    group.add(body);

    // 2. Heavy Armor
    const armorGeo = new THREE.BoxGeometry(
        config.bodyWidth * 1.3,
        config.bodyHeight * 0.6,
        config.bodyWidth * 0.9
    );
    const armor = new THREE.Mesh(armorGeo, SharedMaterials.enemyArmor);
    armor.position.y = config.bodyHeight * 0.5;
    group.add(armor);

    // 3. Shoulder plates (angular)
    const shoulderGeo = new THREE.BoxGeometry(0.25, 0.1, 0.2);
    const leftShoulder = new THREE.Mesh(shoulderGeo, SharedMaterials.enemyArmor);
    leftShoulder.position.set(-config.bodyWidth * 0.65, config.bodyHeight * 0.75, 0);
    leftShoulder.rotation.z = -0.3;
    group.add(leftShoulder);

    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.x = config.bodyWidth * 0.65;
    rightShoulder.rotation.z = 0.3;
    group.add(rightShoulder);

    // 4. Helmet (more angular/aggressive)
    const headGeo = new THREE.BoxGeometry(0.4, 0.35, 0.35);
    const head = new THREE.Mesh(headGeo, SharedMaterials.enemyBody);
    head.position.y = config.bodyHeight + 0.25;
    group.add(head);

    // 5. Menacing Visor (V-shape)
    const visorGeo = new THREE.BufferGeometry();
    const visorVerts = new Float32Array([
        -0.18, 0, 0.05,  // left
        0.18, 0, 0.05,   // right
        0, 0.08, 0.05,   // top center
        -0.18, 0, 0.05,  // left
        0, 0.08, 0.05,   // top center
        0, -0.05, 0.1    // bottom center
    ]);
    visorGeo.setAttribute('position', new THREE.BufferAttribute(visorVerts, 3));
    visorGeo.computeVertexNormals();
    const visor = new THREE.Mesh(visorGeo, SharedMaterials.enemyVisor);
    visor.position.set(0, config.bodyHeight + 0.22, 0.12);
    group.add(visor);

    // 6. Evil eye glow
    const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeo, SharedMaterials.enemyVisor);
    leftEye.position.set(-0.08, config.bodyHeight + 0.25, 0.18);
    group.add(leftEye);

    const rightEye = leftEye.clone();
    rightEye.position.x = 0.08;
    group.add(rightEye);

    // 7. Weapon
    const weaponGroup = createWeaponModel(role, 'enemy');
    weaponGroup.position.set(config.bodyWidth * 0.4, config.bodyHeight * 0.4, 0.2);
    group.add(weaponGroup);

    // 8. Danger stripes (accent)
    const stripeGeo = new THREE.BoxGeometry(config.bodyWidth * 1.2, 0.05, 0.02);
    const stripe1 = new THREE.Mesh(stripeGeo, SharedMaterials.enemyAccent);
    stripe1.position.set(0, config.bodyHeight * 0.3, config.bodyWidth * 0.45);
    group.add(stripe1);

    const stripe2 = stripe1.clone();
    stripe2.position.y = config.bodyHeight * 0.5;
    group.add(stripe2);

    // Store role info
    group.userData.role = role;
    group.userData.team = 'enemy';
    group.userData._body = body;

    return group;
}

/**
 * Create weapon model based on role
 */
function createWeaponModel(role, team) {
    const group = new THREE.Group();
    const color = team === 'ally' ? 0x38bdf8 : 0xff6b6b;

    if (role === 'SNIPER') {
        // Long rifle
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.025, 0.8, 8),
            SharedMaterials.weapon
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.4;
        group.add(barrel);

        // Scope
        const scope = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8),
            SharedMaterials.weapon
        );
        scope.position.set(0, 0.05, 0.15);
        group.add(scope);

        // Scope lens
        const lens = new THREE.Mesh(
            new THREE.CircleGeometry(0.025, 8),
            new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8 })
        );
        lens.rotation.x = -Math.PI / 2;
        lens.position.set(0, 0.08, 0.15);
        group.add(lens);

    } else if (role === 'ASSAULT') {
        // Bulky SMG
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.12, 0.35),
            SharedMaterials.weapon
        );
        body.position.z = 0.15;
        group.add(body);

        // Barrel
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6),
            SharedMaterials.weapon
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.4;
        group.add(barrel);

        // Magazine
        const mag = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.15, 0.06),
            SharedMaterials.weapon
        );
        mag.position.set(0, -0.1, 0.1);
        group.add(mag);

    } else {
        // Standard pistol
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.1, 0.2),
            SharedMaterials.weapon
        );
        body.position.z = 0.1;
        group.add(body);

        // Barrel
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6),
            SharedMaterials.weapon
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.25;
        group.add(barrel);
    }

    return group;
}

/**
 * Get size configuration based on role
 */
function getRoleConfig(role, team) {
    const configs = {
        SNIPER: { bodyWidth: 0.55, bodyHeight: 1.1 },
        ASSAULT: { bodyWidth: 0.75, bodyHeight: 1.3 },
        FLANKER: { bodyWidth: 0.5, bodyHeight: 0.95 },
        LEADER: { bodyWidth: 0.65, bodyHeight: 1.2 },
        STANDARD: { bodyWidth: 0.6, bodyHeight: 1.0 }
    };
    return configs[role] || configs.STANDARD;
}

/**
 * Update character visuals (for animations)
 */
export function updateCharacterVisuals(character, dt) {
    // Visor glow pulse
    if (character.userData._visorGlow) {
        const glow = character.userData._visorGlow;
        glow.material.opacity = 0.2 + Math.sin(performance.now() * 0.003) * 0.15;
    }
}
