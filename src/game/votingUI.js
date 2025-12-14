
export function createVotingUI(options, onVote) {
    const container = document.createElement('div');
    container.id = 'voting-ui';
    Object.assign(container.style, {
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: '2000',
        fontFamily: '"Rajdhani", sans-serif'
    });

    const title = document.createElement('h1');
    title.textContent = 'VOTE FOR NEXT MODE';
    title.style.fontSize = '3rem';
    title.style.textShadow = '0 0 20px #0ff';
    container.appendChild(title);

    const timer = document.createElement('div');
    timer.id = 'vote-timer';
    timer.style.fontSize = '2rem';
    timer.style.color = '#ff0055';
    timer.style.margin = '20px 0';
    container.appendChild(timer);

    const optionsContainer = document.createElement('div');
    Object.assign(optionsContainer.style, {
        display: 'flex', gap: '20px', width: '80%', justifyContent: 'center'
    });

    options.forEach((opt, index) => {
        const card = document.createElement('div');
        card.className = 'vote-card';
        card.dataset.index = index;
        Object.assign(card.style, {
            background: 'rgba(255, 255, 255, 0.05)', border: '1px solid #333',
            padding: '20px', width: '200px', cursor: 'pointer', textAlign: 'center',
            transition: 'all 0.2s', position: 'relative'
        });

        // Hover effect via JS for simplicity
        card.onmouseenter = () => card.style.background = 'rgba(0, q, 255, 0.2)';
        card.onmouseleave = () => {
            if (!card.classList.contains('selected')) card.style.background = 'rgba(255, 255, 255, 0.05)';
        };
        card.onclick = () => {
            document.querySelectorAll('.vote-card').forEach(c => {
                c.classList.remove('selected');
                c.style.border = '1px solid #333';
            });
            card.classList.add('selected');
            card.style.border = '2px solid #0ff';
            onVote(index);
        };

        const name = document.createElement('div');
        name.textContent = opt;
        name.style.fontWeight = 'bold';

        const count = document.createElement('div');
        count.id = `vote-count-${index}`;
        count.textContent = '0';
        count.style.fontSize = '2.5rem';
        count.style.marginTop = '10px';

        card.appendChild(name);
        card.appendChild(count);
        optionsContainer.appendChild(card);
    });

    container.appendChild(optionsContainer);
    document.body.appendChild(container);
}

export function updateVotingUI(counts, timeLeft) {
    const timer = document.getElementById('vote-timer');
    if (timer) timer.textContent = Math.ceil(timeLeft);

    counts.forEach((c, i) => {
        const el = document.getElementById(`vote-count-${i}`);
        if (el) el.textContent = c;
    });
}

export function destroyVotingUI() {
    const el = document.getElementById('voting-ui');
    if (el) el.remove();
}
