import { VotingScene } from '../scenes/VotingScene.js';

// Mock Game Object for VotingScene
// VotingScene expects: game.player.team, game.assignTeams(), game.enterGame()
class MockGame {
    constructor() {
        this.player = {
            team: null // Will be assigned by VotingScene or params
        };
    }

    assignTeams() {
        // Simple random assignment if not provided
        this.player.team = Math.random() > 0.5 ? 'RED' : 'BLUE';
        console.log(`Assigned Team: ${this.player.team}`);
    }

    enterGame(mode) {
        console.log(`Vote Finished! Redirecting to Game... Mode: ${mode}, Team: ${this.player.team}`);

        // --- REDIRECTION LOGIC ---
        // Encode parameters safely
        const params = new URLSearchParams();
        params.append('mode', mode);
        params.append('team', this.player.team);

        window.location.href = `game.html?${params.toString()}`;
    }
}

// Initialize
function initVoting() {
    const mockGame = new MockGame();
    const votingScene = new VotingScene(mockGame);

    // Start
    votingScene.enter();
}

window.addEventListener('load', initVoting);
