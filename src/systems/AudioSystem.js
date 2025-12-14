export class AudioSystem {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterVolume = 1.0;
        this.musicVolume = 0.5;
        this.sfxVolume = 1.0;
        this.sounds = {};
        this.music = null;
    }

    init() {
        // Resume context on user interaction
        const resume = () => {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            window.removeEventListener('click', resume);
            window.removeEventListener('keydown', resume);
        };
        window.addEventListener('click', resume);
        window.addEventListener('keydown', resume);
    }

    loadSound(name, url) {
        // Placeholder for loading audio buffers
        // In fully implemented version, fetch(url) -> arrayBuffer -> decodeAudioData
        console.log(`[AudioSystem] Loading sound: ${name} from ${url}`);
    }

    playSound(name) {
        if (!this.sounds[name]) return;
        // implementation for playing buffer
    }

    playTone(freq = 440, type = 'sine', duration = 0.1) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(this.sfxVolume * this.masterVolume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }
}
