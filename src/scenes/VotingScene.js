
export class VotingScene {
    constructor(game) {
        this.game = game;
        this.duration = 15; // 15 seconds
        this.timer = this.duration;
        this.intervalId = null;

        // Game Modes
        this.modes = ['TEAM DEATHMATCH', 'FREE FOR ALL', 'CAPTURE THE FLAG', 'KING OF THE HILL'];
        this.options = [];

        // Voters
        this.voters = [];
    }

    enter() {
        console.log("Entering Voting Phase");

        // 1. Assign Team if missing
        if (!this.game.player.team) {
            if (typeof this.game.assignTeams === 'function') {
                this.game.assignTeams();
            } else {
                this.game.player.team = (Math.random() > 0.5 ? 'RED' : 'BLUE');
            }
        }

        // 2. Select Options
        this.options = [...this.modes].sort(() => 0.5 - Math.random());

        // 3. Setup Voters
        this.setupVoters();

        // 4. Create UI
        this.createVotingUI();

        // 5. Start Timer & Logic (setInterval to be independent of game loop)
        this.startLogic();
    }

    setupVoters() {
        this.voters = [];
        const playerTeam = this.game.player.team;
        const enemyTeam = (playerTeam === 'RED' ? 'BLUE' : 'RED');

        // 11 Bots + 1 Player = 12 Votes
        for (let i = 0; i < 11; i++) {
            this.voters.push({
                id: i,
                team: (i < 5) ? playerTeam : enemyTeam,
                currentVote: -1,
                decisionTime: Math.random() * 10 + 1 // Vote at random time 1-11s
            });
        }
    }

    createVotingUI() {
        // Container
        this.container = document.createElement('div');
        this.container.id = 'voting-ui';
        Object.assign(this.container.style, {
            position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: '2000'
        });

        // Header
        const title = document.createElement('h1');
        title.textContent = 'VOTE SECTOR';
        title.style.fontSize = '3rem';
        title.style.textShadow = '0 0 20px #0ff';
        this.container.appendChild(title);

        // Team Indicator
        const teamText = document.createElement('h2');
        const pTeam = this.game.player.team;
        teamText.textContent = `YOU ARE TEAM ${pTeam}`;
        teamText.className = pTeam === 'RED' ? 'token-red' : 'token-blue'; // Re-use color classes if valid or inline
        teamText.style.color = (pTeam === 'RED' ? '#ff0055' : '#00f0ff');
        teamText.style.marginBottom = '20px';
        teamText.style.background = 'transparent'; // Reset from class
        this.container.appendChild(teamText);

        // Timer
        this.timerEl = document.createElement('div');
        this.timerEl.id = 'vote-timer';
        this.timerEl.textContent = this.duration;
        this.timerEl.style.fontSize = '4rem';
        this.timerEl.style.fontWeight = 'bold';
        this.timerEl.style.marginBottom = '40px';
        this.container.appendChild(this.timerEl);

        // Options
        const optionsWrapper = document.createElement('div');
        Object.assign(optionsWrapper.style, {
            display: 'flex', gap: '20px', width: '90%', justifyContent: 'center', flexWrap: 'wrap'
        });

        this.cardEls = [];
        this.options.forEach((opt, index) => {
            const card = document.createElement('div');
            card.className = 'vote-card';
            Object.assign(card.style, {
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid #444',
                padding: '20px', width: '220px', cursor: 'pointer', textAlign: 'center',
                borderRadius: '8px'
            });

            card.onclick = () => this.playerVote(index);

            const name = document.createElement('div');
            name.textContent = opt;
            name.style.fontWeight = 'bold';
            name.style.fontSize = '1.2rem';
            name.style.marginBottom = '10px';
            card.appendChild(name);

            // Token Container
            const tokenContainer = document.createElement('div');
            tokenContainer.className = 'vote-token-container';
            tokenContainer.id = `vote-tokens-${index}`;
            card.appendChild(tokenContainer);

            optionsWrapper.appendChild(card);
            this.cardEls.push(card);
        });

        this.container.appendChild(optionsWrapper);
        document.body.appendChild(this.container);
    }

    startLogic() {
        this.timer = this.duration;
        this.timerEl.innerText = this.timer;

        let elapsed = 0;

        this.intervalId = setInterval(() => {
            elapsed++;
            this.timer--;

            // GUI Update
            if (this.timerEl) this.timerEl.innerText = Math.max(0, this.timer);

            // Bot Decisions
            this.processBots(elapsed);

            // End?
            if (this.timer <= 0) {
                this.endVoting();
            }
        }, 1000);
    }

    processBots(elapsedSec) {
        this.voters.forEach(bot => {
            // Simple logic: if decisionTime matches current elapsed, vote
            // Checking integer match is enough for 1s interval
            if (Math.floor(bot.decisionTime) === elapsedSec && bot.currentVote === -1) {
                // Vote Randomly
                const choice = Math.floor(Math.random() * 4);
                bot.currentVote = choice;
                this.addVoteToken(choice, bot.team);
            }
        });
    }

    playerVote(index) {
        if (this.playerChoice !== undefined) return; // Vote once
        this.playerChoice = index;

        // Visual Border
        const card = this.cardEls[index];
        if (card) {
            const color = (this.game.player.team === 'RED' ? '#ff0055' : '#00f0ff');
            card.style.border = `2px solid ${color}`;
            card.style.transform = 'scale(1.05)';
        }

        this.addVoteToken(index, this.game.player.team);
    }

    addVoteToken(optionIndex, team) {
        const container = document.getElementById(`vote-tokens-${optionIndex}`);
        if (!container) return;

        const token = document.createElement('div');
        // Matches CSS: .vote-token .token-red / .token-blue
        const colorClass = (team === 'RED' ? 'token-red' : 'token-blue');
        token.className = `vote-token ${colorClass}`;

        // Add with animation
        token.style.animation = 'fade-in 0.3s';
        container.appendChild(token);
    }

    endVoting() {
        if (this.intervalId) clearInterval(this.intervalId);

        // Determine Winner
        const counts = [0, 0, 0, 0];
        // Re-count from voters + player (though tokens are visual, logic is here)
        this.voters.forEach(b => { if (b.currentVote >= 0) counts[b.currentVote]++; });
        if (this.playerChoice !== undefined) counts[this.playerChoice]++;

        const max = Math.max(...counts);
        const winners = this.options.filter((_, i) => counts[i] === max);
        const winnerMode = winners[Math.floor(Math.random() * winners.length)];

        console.log(`Voting Finished. Winner: ${winnerMode}`);

        // Cleanup
        this.exit();

        // Proceed
        if (this.game && typeof this.game.enterGame === 'function') {
            this.game.enterGame(winnerMode);
        }
    }

    exit() {
        if (this.intervalId) clearInterval(this.intervalId);
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
}
