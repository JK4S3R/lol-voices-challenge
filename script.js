let champions = [];
let availableChamps = [];
let currentChamp = null;
let score = 0;
let timeLeft = 90;
let TOTAL_TIME = 90;
let timerInterval = null;

let lang = 'fr';
let difficulty = 'easy';

// --- TRADUCTIONS ---
const i18n = {
    fr: {
        title: 'LoL Voices',
        start: '🎮 Démarrer la partie',
        replay: 'Rejouer',
        relisten: '🔊 Réécouter',
        placeholder: 'Nom du champion...',
        verify: 'Vérifier',
        skip: 'Passer ⏭️',
        found: 'Champions trouvés',
        good: 'Bien joué ! ',
        wrong: 'Faux !',
        itwas: "C'était ",
        finished: 'Fini ! Score : ',
        easy: 'Facile',
        hard: 'Difficile',
        langLabel: 'Langue',
        diffLabel: 'Difficulté',
        easyDesc: 'Sons de sélection uniquement',
        hardDesc: 'Toutes les répliques (déplacements, sorts…)',
    },
    en: {
        title: 'LoL Voices',
        start: '🎮 Start game',
        replay: 'Play again',
        relisten: '🔊 Replay',
        placeholder: 'Champion name...',
        verify: 'Check',
        skip: 'Skip ⏭️',
        found: 'Found champions',
        good: 'Nice! ',
        wrong: 'Wrong!',
        itwas: 'It was ',
        finished: 'Done! Score: ',
        easy: 'Easy',
        hard: 'Hard',
        langLabel: 'Language',
        diffLabel: 'Difficulty',
        easyDesc: 'Champion select sounds only',
        hardDesc: 'All voice lines (move, spell…)',
    }
};

function t(key) { return i18n[lang][key] || key; }

function getLangCode() { return lang === 'fr' ? 'fr_fr' : 'en_us'; }

// --- SOURCES AUDIO selon difficulté ---
function getAudioSources(champ) {
    const lc = getLangCode();
    const base = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/${lc}/v1`;
    if (difficulty === 'easy') {
        return [`${base}/champion-choose-vo/${champ.id}.ogg`];
    } else {
        // Hard : sélection + ban (toutes les répliques de pick/ban phase)
        return [
            `${base}/champion-choose-vo/${champ.id}.ogg`,
            `${base}/champion-ban-vo/${champ.id}.ogg`,
        ];
    }
}

// --- DOM ---
const input = document.getElementById('user-input');
const feedback = document.getElementById('feedback');
const player = document.getElementById('voice-player');
const scoreDisplay = document.getElementById('streak-display');
const timerBar = document.getElementById('timer-bar');
const historyContainer = document.getElementById('champions-history');
const list = document.getElementById('autocomplete-list');

// --- TRADUCTION UI ---
function applyTranslations() {
    document.querySelector('h1').textContent = t('title');
    const startBtn = document.getElementById('start-btn');
    if (startBtn.textContent !== t('replay')) startBtn.textContent = t('start');
    document.getElementById('play-btn').textContent = t('relisten');
    document.getElementById('user-input').placeholder = t('placeholder');
    document.getElementById('check-btn').textContent = t('verify');
    document.getElementById('skip-btn').textContent = t('skip');
    document.querySelector('.history-container h3').textContent = t('found');
    document.getElementById('lang-label').textContent = t('langLabel');
    document.getElementById('diff-label').textContent = t('diffLabel');
    document.getElementById('btn-easy').textContent = t('easy');
    document.getElementById('btn-hard').textContent = t('hard');
    document.getElementById('easy-desc').textContent = t('easyDesc');
    document.getElementById('hard-desc').textContent = t('hardDesc');
}

// --- UTILITAIRES ---
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function setEpicBackground() {
    const epicSplashes = [
        "Aatrox_0", "Akali_32", "Belveth_0", "Diana_12", "Evelynn_6",
        "Jhin_5", "Kaisa_16", "Kayn_15", "Mordekaiser_13", "Pantheon_8",
        "Pyke_44", "Riven_16", "Samira_10", "Sylas_0", "Volibear_9",
        "Yone_0", "Zed_11", "Viego_0"
    ];
    const pick = epicSplashes[Math.floor(Math.random() * epicSplashes.length)];
    document.body.style.backgroundImage = `linear-gradient(rgba(1,10,19,0.8),rgba(1,10,19,0.8)),url('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${pick}.jpg')`;
}
setEpicBackground();

// --- CHARGEMENT CHAMPIONS ---
async function loadChampions() {
    try {
        const res = await fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json');
        const data = await res.json();
        champions = data
            .filter(c => c.id !== -1 && !c.name.includes("Bot") && !c.name.includes("Boom"))
            .map(c => ({ id: c.id, name: c.name, alias: c.alias }));
    } catch (e) { console.error("Erreur chargement champions"); }
}
loadChampions();

// --- AUDIO ---
function playAudio(champ) {
    const sources = getAudioSources(champ);
    const idx = Math.floor(Math.random() * sources.length);
    player.src = sources[idx];
    player.play().catch(() => {
        // Fallback sur l'autre source si disponible
        const fallback = sources[idx === 0 ? sources.length - 1 : 0];
        if (fallback && fallback !== sources[idx]) {
            player.src = fallback;
            player.play().catch(() => {});
        }
    });
}

// --- JEUX ---
function nextChampion() {
    if (availableChamps.length === 0) {
        availableChamps = [...champions];
        shuffle(availableChamps);
    }
    currentChamp = availableChamps.pop();
    playAudio(currentChamp);
    input.value = '';
    list.innerHTML = '';
    document.getElementById('champ-image').style.display = 'none';
    input.focus();
}

function initGame() {
    score = 0;
    TOTAL_TIME = difficulty === 'hard' ? 120 : 90;
    timeLeft = TOTAL_TIME;
    scoreDisplay.textContent = '0';
    feedback.textContent = '';
    historyContainer.innerHTML = '';

    document.getElementById('start-btn').style.display = 'none';
    document.getElementById('game-area').style.display = 'block';
    document.getElementById('setup-area').style.display = 'none';

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
    timerBar.style.width = p + '%';
    timerBar.classList.toggle('warning', timeLeft <= 15);
}

function check() {
    if (!currentChamp) return;
    if (input.value.toLowerCase().trim() === currentChamp.name.toLowerCase().trim()) {
        score++;
        scoreDisplay.textContent = score;
        feedback.textContent = t('good') + currentChamp.name;
        feedback.style.color = '#00ff00';

        const img = document.createElement('img');
        img.src = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${currentChamp.id}.png`;
        img.classList.add('history-icon');
        img.title = currentChamp.name;
        historyContainer.prepend(img);

        list.innerHTML = '';
        nextChampion();
    } else {
        feedback.textContent = t('wrong');
        feedback.style.color = '#ff4e50';
        input.value = '';
    }
}

function endGame() {
    clearInterval(timerInterval);
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('setup-area').style.display = 'flex';
    document.getElementById('start-btn').style.display = 'block';
    document.getElementById('start-btn').textContent = t('replay');
    feedback.textContent = t('finished') + score;
    if (currentChamp) {
        document.getElementById('champ-image').src = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${currentChamp.alias}_0.jpg`;
        document.getElementById('champ-image').style.display = 'block';
    }
}

// --- ÉVÉNEMENTS ---
document.getElementById('btn-fr').onclick = () => {
    lang = 'fr';
    document.getElementById('btn-fr').classList.add('active');
    document.getElementById('btn-en').classList.remove('active');
    applyTranslations();
};
document.getElementById('btn-en').onclick = () => {
    lang = 'en';
    document.getElementById('btn-en').classList.add('active');
    document.getElementById('btn-fr').classList.remove('active');
    applyTranslations();
};
document.getElementById('btn-easy').onclick = () => {
    difficulty = 'easy';
    document.getElementById('btn-easy').classList.add('active');
    document.getElementById('btn-hard').classList.remove('active');
};
document.getElementById('btn-hard').onclick = () => {
    difficulty = 'hard';
    document.getElementById('btn-hard').classList.add('active');
    document.getElementById('btn-easy').classList.remove('active');
};

document.getElementById('start-btn').onclick = initGame;
document.getElementById('reset-btn').onclick = initGame;
document.getElementById('check-btn').onclick = check;
document.getElementById('skip-btn').onclick = () => {
    feedback.textContent = t('itwas') + currentChamp.name;
    feedback.style.color = '#c8aa6e';
    nextChampion();
};
document.getElementById('play-btn').onclick = () => { player.play(); input.focus(); };

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
    if (e.key === 'Enter') check();
    if (e.key === 'ArrowRight') { e.preventDefault(); document.getElementById('skip-btn').click(); }
});

document.addEventListener('click', (e) => { if (e.target !== input) list.innerHTML = ''; });
