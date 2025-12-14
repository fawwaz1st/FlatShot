export const SaveManager = {
    KEY: 'flatshot_save_v1',
    data: {
        highScore: 0,
        totalKills: 0,
        settings: {},
        unlockedSkills: []
    },

    load() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                this.data = { ...this.data, ...parsed };
            }
        } catch (e) {
            console.warn('SaveManager: Load failed', e);
        }
        return this.data;
    },

    save() {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('SaveManager: Save failed', e);
        }
    },

    updateScore(score) {
        if (score > this.data.highScore) {
            this.data.highScore = score;
            this.save();
            return true; // new record
        }
        return false;
    },

    updateSettings(settings) {
        this.data.settings = { ...this.data.settings, ...settings };
        this.save();
    },

    addKill() {
        this.data.totalKills = (this.data.totalKills || 0) + 1;
        // autosave every 10 kills sparingly? better save on game over
    }
};
