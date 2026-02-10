/**
 * Tower Defense Player - Citadel Guardians
 * Phone controls for the cooperative tower defense game
 */

const socket = io();

// Game state
let gamePin = null;
let myPlayer = null;
let myZoneSlots = [];
let selectedSlot = null;
let selectedAvatar = '🛡️';
let isReady = false;

// Tower costs
const TOWER_COSTS = {
    sentinel: { base: 100, upgrade: [0, 75, 150] },
    arcane: { base: 150, upgrade: [0, 100, 200] },
    barracks: { base: 125, upgrade: [0, 80, 160] },
    cannon: { base: 200, upgrade: [0, 150, 300] }
};

const TOWER_EMOJIS = {
    sentinel: '🏹',
    arcane: '🔮',
    barracks: '⚔️',
    cannon: '💥'
};

const TOWER_NAMES = {
    sentinel: 'Sentinel',
    arcane: 'Arcane Spire',
    barracks: 'Vanguard Post',
    cannon: 'Thunder Cannon'
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupJoinForm();
    setupAvatarSelection();
    setupTowerPanel();
    setupReadyButton();
});

// ==================== SETUP ====================

function setupJoinForm() {
    document.getElementById('btn-join').addEventListener('click', () => {
        const pin = document.getElementById('pin-input').value.trim();
        const nickname = document.getElementById('nickname-input').value.trim();

        if (!pin || pin.length !== 4) {
            showError('Inserisci un PIN valido');
            return;
        }

        if (!nickname || nickname.length < 2) {
            showError('Inserisci un nome (min 2 caratteri)');
            return;
        }

        socket.emit('tower:player-join', { pin, nickname, avatar: selectedAvatar });
    });

    // Enter key support
    document.getElementById('nickname-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btn-join').click();
        }
    });
}

function setupAvatarSelection() {
    const grid = document.getElementById('avatar-grid');
    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.avatar-btn');
        if (!btn) return;

        grid.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedAvatar = btn.dataset.avatar;
    });
}

function setupTowerPanel() {
    // Close panel button
    document.getElementById('btn-close-panel').addEventListener('click', closePanel);

    // Build tower buttons
    document.getElementById('build-options').addEventListener('click', (e) => {
        const btn = e.target.closest('.tower-btn');
        if (!btn || btn.disabled) return;

        const towerType = btn.dataset.tower;
        buildTower(towerType);
    });

    // Upgrade button
    document.getElementById('btn-upgrade').addEventListener('click', upgradeTower);

    // Sell button
    document.getElementById('btn-sell').addEventListener('click', sellTower);
}

function setupReadyButton() {
    document.getElementById('btn-ready').addEventListener('click', toggleReady);
}

// ==================== SOCKET EVENTS ====================

socket.on('tower:joined', ({ player, players, gamePin: pin }) => {
    gamePin = pin || gamePin;
    myPlayer = player;
    showScreen('lobby');
    updateLobbyDisplay(players);
});

socket.on('tower:join-error', ({ message }) => {
    showError(message);
});

socket.on('tower:lobby-update', ({ players }) => {
    updateLobbyDisplay(players);
});

socket.on('tower:game-started', ({ map, players }) => {
    myPlayer = players.find(p => p.socketId === socket.id) || myPlayer;
    myZoneSlots = map.towerSlots.filter(s => s.zoneOwnerIndex === myPlayer.zoneIndex);
    showScreen('game');
    renderSlots();
    updateGold(myPlayer.gold);
});

socket.on('tower:building-phase', ({ waveNumber }) => {
    document.getElementById('phase-badge').textContent = 'COSTRUZIONE';
    document.getElementById('phase-badge').classList.remove('wave');
    document.getElementById('wave-number').textContent = waveNumber;
    document.getElementById('ready-section').style.display = 'block';
    isReady = false;
    updateReadyButton();
});

socket.on('tower:ready-update', ({ readyCount, totalPlayers }) => {
    document.getElementById('ready-status').textContent = `${readyCount}/${totalPlayers} pronti`;
});

socket.on('tower:wave-start', ({ waveNumber }) => {
    document.getElementById('phase-badge').textContent = 'WAVE ' + waveNumber;
    document.getElementById('phase-badge').classList.add('wave');
    document.getElementById('wave-number').textContent = waveNumber;
    document.getElementById('ready-section').style.display = 'none';
    closePanel();
});

socket.on('tower:tower-placed', ({ tower, player, slot }) => {
    if (player.socketId === socket.id) {
        updateGold(player.gold);
        // Update slot in local array
        const localSlot = myZoneSlots.find(s => s.id === slot.id);
        if (localSlot) {
            localSlot.tower = tower;
        }
        renderSlots();
        closePanel();
    }
});

socket.on('tower:tower-upgraded', ({ tower, player, slot }) => {
    if (player.socketId === socket.id) {
        updateGold(player.gold);
        const localSlot = myZoneSlots.find(s => s.id === slot.id);
        if (localSlot) {
            localSlot.tower = tower;
        }
        renderSlots();
        if (selectedSlot && selectedSlot.id === slot.id) {
            showUpgradeOptions(localSlot);
        }
    }
});

socket.on('tower:tower-sold', ({ slotId, player, refund }) => {
    if (player.socketId === socket.id) {
        updateGold(player.gold);
        const localSlot = myZoneSlots.find(s => s.id === slotId);
        if (localSlot) {
            localSlot.tower = null;
        }
        renderSlots();
        closePanel();
    }
});

socket.on('tower:gold-update', ({ gold }) => {
    updateGold(gold);
});

socket.on('tower:build-error', ({ message }) => {
    alert(message);
});

socket.on('tower:game-state', (state) => {
    // Update player gold from state
    const me = state.players.find(p => p.socketId === socket.id);
    if (me) {
        updateGold(me.gold);
    }
});

socket.on('tower:wave-complete', ({ bonus, players }) => {
    const me = players.find(p => p.socketId === socket.id);
    if (me) {
        updateGold(me.gold);
    }
});

socket.on('tower:game-over', ({ victory, stats }) => {
    showGameOver(victory, stats);
});

socket.on('tower:host-left', () => {
    alert('L\'host ha lasciato la partita.');
    location.reload();
});

// ==================== UI FUNCTIONS ====================

function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${screenName}-screen`).classList.remove('hidden');
}

function showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = message;
    setTimeout(() => errorEl.textContent = '', 3000);
}

function updateLobbyDisplay(players) {
    // Update my info
    const zoneEl = document.getElementById('my-zone');
    zoneEl.textContent = `ZONA ${myPlayer.zoneIndex + 1}`;
    zoneEl.className = `my-zone zone-${myPlayer.zoneIndex}`;

    document.getElementById('my-avatar').textContent = myPlayer.avatar;
    document.getElementById('my-name').textContent = myPlayer.nickname;

    // Update other players
    const othersList = document.getElementById('other-players-list');
    othersList.innerHTML = '';

    players.filter(p => p.socketId !== socket.id).forEach(player => {
        const div = document.createElement('div');
        div.className = `other-player zone-${player.zoneIndex}`;
        div.innerHTML = `
            <span class="other-player-avatar">${player.avatar}</span>
            <span class="other-player-name">${player.nickname}</span>
        `;
        othersList.appendChild(div);
    });
}

function renderSlots() {
    const grid = document.getElementById('slots-grid');
    grid.innerHTML = '';

    myZoneSlots.forEach(slot => {
        const btn = document.createElement('button');
        btn.className = `slot-btn ${slot.tower ? 'occupied' : 'empty'}`;
        btn.dataset.slotId = slot.id;

        if (slot.tower) {
            btn.innerHTML = `
                <span class="slot-tower-emoji">${TOWER_EMOJIS[slot.tower.type]}</span>
                <span class="slot-tower-level">${'★'.repeat(slot.tower.level)}${'☆'.repeat(3 - slot.tower.level)}</span>
            `;
        }

        btn.addEventListener('click', () => openSlotPanel(slot));
        grid.appendChild(btn);
    });
}

function updateGold(gold) {
    if (myPlayer) {
        myPlayer.gold = gold;
    }
    document.getElementById('gold-amount').textContent = gold;
    updateTowerButtonsState();
}

function updateTowerButtonsState() {
    const gold = myPlayer ? myPlayer.gold : 0;

    document.querySelectorAll('#build-options .tower-btn').forEach(btn => {
        const type = btn.dataset.tower;
        const cost = TOWER_COSTS[type].base;
        btn.disabled = gold < cost;
    });
}

function openSlotPanel(slot) {
    selectedSlot = slot;
    const panel = document.getElementById('tower-panel');
    panel.classList.remove('hidden');

    if (slot.tower) {
        showUpgradeOptions(slot);
    } else {
        showBuildOptions();
    }
}

function showBuildOptions() {
    document.getElementById('panel-title').textContent = 'Costruisci Torretta';
    document.getElementById('build-options').classList.remove('hidden');
    document.getElementById('upgrade-options').classList.add('hidden');
    updateTowerButtonsState();
}

function showUpgradeOptions(slot) {
    const tower = slot.tower;
    document.getElementById('panel-title').textContent = 'Gestisci Torretta';
    document.getElementById('build-options').classList.add('hidden');
    document.getElementById('upgrade-options').classList.remove('hidden');

    document.getElementById('current-tower-emoji').textContent = TOWER_EMOJIS[tower.type];
    document.getElementById('current-tower-name').textContent = TOWER_NAMES[tower.type];
    document.getElementById('current-tower-level').textContent = '★'.repeat(tower.level) + '☆'.repeat(3 - tower.level);

    // Upgrade button
    const upgradeBtn = document.getElementById('btn-upgrade');
    const upgradeCostEl = document.getElementById('upgrade-cost');

    if (tower.level >= 3) {
        upgradeBtn.disabled = true;
        upgradeCostEl.textContent = 'MAX';
    } else {
        const upgradeCost = TOWER_COSTS[tower.type].upgrade[tower.level];
        upgradeBtn.disabled = myPlayer.gold < upgradeCost;
        upgradeCostEl.textContent = `💰 ${upgradeCost}`;
    }

    // Sell button
    const totalSpent = tower.totalSpent || TOWER_COSTS[tower.type].base;
    const refund = Math.floor(totalSpent * 0.6);
    document.getElementById('sell-refund').textContent = `💰 ${refund}`;
}

function closePanel() {
    document.getElementById('tower-panel').classList.add('hidden');
    selectedSlot = null;
}

function buildTower(towerType) {
    if (!selectedSlot) return;

    socket.emit('tower:build-tower', {
        pin: gamePin,
        slotId: selectedSlot.id,
        towerType
    });
}

function upgradeTower() {
    if (!selectedSlot || !selectedSlot.tower) return;

    socket.emit('tower:upgrade-tower', {
        pin: gamePin,
        slotId: selectedSlot.id
    });
}

function sellTower() {
    if (!selectedSlot || !selectedSlot.tower) return;

    socket.emit('tower:sell-tower', {
        pin: gamePin,
        slotId: selectedSlot.id
    });
}

function toggleReady() {
    isReady = !isReady;

    if (isReady) {
        socket.emit('tower:vote-ready', { pin: gamePin });
    } else {
        socket.emit('tower:unvote-ready', { pin: gamePin });
    }

    updateReadyButton();
}

function updateReadyButton() {
    const btn = document.getElementById('btn-ready');
    if (isReady) {
        btn.textContent = 'ANNULLA';
        btn.classList.add('ready');
    } else {
        btn.textContent = 'PRONTO!';
        btn.classList.remove('ready');
    }
}

function showGameOver(victory, stats) {
    showScreen('gameover');

    const icon = document.getElementById('gameover-icon');
    const title = document.getElementById('gameover-title');
    const message = document.getElementById('gameover-message');

    if (victory) {
        icon.textContent = '🏆';
        title.textContent = 'VITTORIA!';
        title.className = 'gameover-title victory';
        message.textContent = 'La cittadella è salva!';
    } else {
        icon.textContent = '💀';
        title.textContent = 'SCONFITTA';
        title.className = 'gameover-title defeat';
        message.textContent = 'La cittadella è caduta...';
    }

    // Find my stats
    const myStats = stats.players.find(p => p.nickname === myPlayer.nickname);
    if (myStats) {
        document.getElementById('my-kills').textContent = myStats.totalKills;
        document.getElementById('my-damage').textContent = myStats.totalDamage;
        document.getElementById('my-towers').textContent = myStats.towersBuilt;
    }
}
