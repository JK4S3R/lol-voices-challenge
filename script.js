let champions = [];
let availableChamps = []; // Notre "pioche" de champions restants
let currentChamp = null;
let score = 0;
let timeLeft = 90; // CHANGEMENT ICI : 90 secondes
const TOTAL_TIME = 90; // CHANGEMENT ICI : 90 secondes
let timerInterval = null;

const input = document.getElementById('user-input');
const feedback = document.getElementById('feedback');
const player = document.getElementById('voice-player');
const scoreDisplay = document.getElementById('streak-display');
const timerBar = document.getElementById('timer-bar'); 
const historyContainer = document.getElementById('champions-history');
const list = document.getElementById('autocomplete-list');

// --- FONCTION DE MÉLANGE (Fisher-Yates Shuffle) ---
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// --- SYSTÈME DE FOND ALÉATOIRE ---
function setEpicBackground() {
    const epicSplashes = [
        "Aatrox_0", "Akali_32", "Belveth_0", "Diana_12", "Evelynn_6", 
        "Jhin_5", "Kaisa_16", "Kayn_15", "Mordekaiser_13", "Pantheon_8", 
        "Pyke_44", "Riven_16", "Samira_10", "Sylas_0", "Volibear_9", 
        "Yone_0", "Zed_11", "Viego_0"
    ];
    const randomPick = epicSplashes[Math.floor(Math.random() * epicSplashes.length)];
    const url = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${randomPick}.jpg`;
    document.body.style.backgroundImage = `linear-gradient(rgba(1, 10, 19, 0.8), rgba(1, 10, 19, 0.8)), url('${url}')`;
}
setEpicBackground();

// --- CHARGEMENT ---
async function loadChampions() {
    try {
        const response = await fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json');
        const data = await response.json();
        champions = data.filter(c => c.id !== -1 && !c.name.includes("Bot") && !c.name.includes("Boom"))
            .map(c => ({
                id: c.id,
                name: c.name,
                alias: c.alias,
                audio: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/fr_fr/v1/champion-choose-vo/${c.id}.ogg`
            }));
    } catch (e) { console.error("Erreur API"); }
}
loadChampions();

function nextChampion() {
    if (availableChamps.length === 0) {
        availableChamps = [...champions];
        shuffle(availableChamps);
    }

    currentChamp = availableChamps.pop();
    
    player.src = currentChamp.audio;
    player.play();
    input.value = "";
    document.getElementById('champ-image').style.display = "none";
    input.focus();
}

function initGame() {
    score = 0; 
    timeLeft = TOTAL_TIME;
    scoreDisplay.textContent = "0";
    feedback.textContent = "";
    historyContainer.innerHTML = "";
    document.getElementById('start-btn').style.display = "none";
    document.getElementById('game-area').style.display = "block";
    
    availableChamps = [...champions];
    shuffle(availableChamps);
    
    updateTimer();
    nextChampion();
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimer();
        if (timeLeft <= 0) endGame();
    }, 1000);
}

function updateTimer() {
    const p = (timeLeft / TOTAL_TIME) * 100;
    timerBar.style.width = p + "%";
    // Alerte visuelle (rouge) quand il reste 15 secondes
    if (timeLeft <= 15) timerBar.classList.add('warning');
    else timerBar.classList.remove('warning');
}

document.getElementById('start-btn').onclick = initGame;
document.getElementById('reset-btn').onclick = initGame;

function check() {
    if (!currentChamp) return;
    if (input.value.toLowerCase().trim() === currentChamp.name.toLowerCase().trim()) {
        score++;
        scoreDisplay.textContent = score;
        feedback.textContent = "Bien joué ! " + currentChamp.name;
        feedback.style.color = "#00ff00";
        
        const img = document.createElement('img');
        img.src = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${currentChamp.id}.png`;
        img.classList.add('history-icon');
        historyContainer.prepend(img);
        
        list.innerHTML = "";
        nextChampion();
    } else {
        feedback.textContent = "Faux !";
        feedback.style.color = "#ff4e50";
        input.value = "";
    }
}

document.getElementById('check-btn').onclick = check;
document.getElementById('skip-btn').onclick = () => {
    feedback.textContent = "C'était " + currentChamp.name;
    feedback.style.color = "#c8aa6e";
    nextChampion();
};

document.getElementById('play-btn').onclick = () => { player.play(); input.focus(); };

function endGame() {
    clearInterval(timerInterval);
    document.getElementById('game-area').style.display = "none";
    document.getElementById('start-btn').style.display = "block";
    document.getElementById('start-btn').textContent = "Rejouer";
    feedback.textContent = "Fini ! Score : " + score;
    document.getElementById('champ-image').src = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${currentChamp.alias}_0.jpg`;
    document.getElementById('champ-image').style.display = "block";
}

input.addEventListener('input', () => {
    const val = input.value.toLowerCase();
    list.innerHTML = '';
    if (!val) return;
    champions.filter(c => c.name.toLowerCase().includes(val)).slice(0, 5).forEach(m => {
        const div = document.createElement('div');
        div.textContent = m.name;
        div.onclick = () => { input.value = m.name; list.innerHTML = ''; check(); };
        list.appendChild(div);
    });
});

input.addEventListener('keydown', (e) => {
    if (e.key === "Enter") check();
    if (e.key === "ArrowRight") { e.preventDefault(); document.getElementById('skip-btn').click(); }
});

document.addEventListener('click', (e) => { if (e.target !== input) list.innerHTML = ''; });