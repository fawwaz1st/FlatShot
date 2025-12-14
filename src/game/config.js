export const GameConfig = {
    // Gameplay
    difficulty: 'normal',
    player: {
        speedWalk: 5,
        speedRun: 8.5,
        maxHealth: 100,
        jumpForce: 8.5,
        gravity: -20,
        fireRate: 7, // rounds per second
        recoilRecover: 2.5
    },
    weapon: {
        pistol: {
            damage: 28,
            headshotMult: 1.8,
            spread: 0.02
        },
        grenade: {
            damageMax: 110,
            radius: 12,
            fuse: 1.6
        }
    },
    enemy: {
        baseHealth: 80,
        baseSpeed: 2.6,
        spawnRate: {
            normal: 2.5, // seconds
            hard: 1.8
        }
    },
    // Graphics
    graphics: {
        fov: 70,
        renderScale: 1.0,
        bloomStrength: 0.7,
        particlesLimit: 400
    },
    // Audio
    audio: {
        masterVolume: 1.0,
        musicVolume: 0.15,
        sfxVolume: 1.0,
        maxVoices: 16 // max simultaneous SFX
    }
};
