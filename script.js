// ============================================================
// CONFIG SUPABASE — remplace par tes vraies clés
// ============================================================
const SUPABASE_URL = 'https://rufkhrfwmfkzsmzxhgeg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LkNOHXfA4X2FMZ7E0Onr3Q_xgd699NP';


const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// ÉTAT DU JEU
// ============================================================
let champions = [];
let availableChamps = [];
let currentChamp = null;
let score = 0;
let timeLeft = 90;
let TOTAL_TIME = 90;
let timerInterval = null;
let lang = 'fr';
let difficulty = 'easy';
let currentUser = null;
let gameChampionsFound = []; // champions trouvés dans la partie en cours
let gameChampionsSkipped = []; // champions passés dans la partie en cours

// ============================================================
// TRADUCTIONS
// ============================================================
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
        login: 'Se connecter avec Google',
        logout: 'Déconnexion',
        dashboard: 'Mon dashboard',
        highscore: 'Meilleur score',
        avgScore: 'Score moyen',
        gamesPlayed: 'Parties jouées',
        bestChamp: 'Champion le mieux reconnu',
        worstChamp: 'Champion le moins bien reconnu',
        leaderboard: 'Classement',
        noGames: 'Aucune partie jouée pour le moment.',
        saving: 'Sauvegarde...',
        saved: 'Score sauvegardé !',
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
        login: 'Sign in with Google',
        logout: 'Sign out',
        dashboard: 'My dashboard',
        highscore: 'Best score',
        avgScore: 'Average score',
        gamesPlayed: 'Games played',
        bestChamp: 'Best recognized champion',
        worstChamp: 'Least recognized champion',
        leaderboard: 'Leaderboard',
        noGames: 'No games played yet.',
        saving: 'Saving...',
        saved: 'Score saved!',
    }
};

function t(key) { return i18n[lang][key] || key; }
function getLangCode() { return lang === 'fr' ? 'fr_fr' : 'default'; }

// ============================================================
// AUDIO
// ============================================================
function getAudioSources(champ) {
    const lc = getLangCode();
    const base = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/${lc}/v1`;
    if (difficulty === 'easy') {
        return [`${base}/champion-choose-vo/${champ.id}.ogg`];
    } else {
        return [
            `${base}/champion-choose-vo/${champ.id}.ogg`,
            `${base}/champion-ban-vo/${champ.id}.ogg`,
        ];
    }
}

// ============================================================
// DOM
// ============================================================
const input = document.getElementById('user-input');
const feedback = document.getElementById('feedback');
const player = document.getElementById('voice-player');
const scoreDisplay = document.getElementById('streak-display');
const timerBar = document.getElementById('timer-bar');
const historyContainer = document.getElementById('champions-history');
const list = document.getElementById('autocomplete-list');

// ============================================================
// AUTH
// ============================================================
async function signInWithGoogle() {
    await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://jk4s3r.github.io/lol-voices-challenge/' }
    });
}

async function signOut() {
    await sb.auth.signOut();
    currentUser = null;
    updateAuthUI();
}

function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    const dashboardBtn = document.getElementById('dashboard-btn');

    if (currentUser) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        dashboardBtn.style.display = 'inline-block';
        userInfo.style.display = 'flex';
        userInfo.querySelector('.user-name').textContent = currentUser.user_metadata?.full_name || currentUser.email;
        const avatar = userInfo.querySelector('.user-avatar');
        if (currentUser.user_metadata?.avatar_url) {
            avatar.src = currentUser.user_metadata.avatar_url;
            avatar.style.display = 'inline-block';
        }
    } else {
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        dashboardBtn.style.display = 'none';
        userInfo.style.display = 'none';
    }
}

// ============================================================
// SAUVEGARDE SCORE
// ============================================================
async function saveGame() {
    if (!currentUser) return;

    feedback.textContent = t('saving');

    // 1. Sauvegarder la partie
    const { error: gameError } = await sb.from('games').insert({
        user_id: currentUser.id,
        score,
        difficulty,
        lang,
        duration: TOTAL_TIME - timeLeft,
    });

    if (gameError) { console.error(gameError); return; }

    // 2. Mettre à jour les stats par champion (trouvés)
    for (const champ of gameChampionsFound) {
        const { data: existing } = await sb
            .from('champion_stats')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('champion_id', champ.id)
            .single();

        if (existing) {
            await sb.from('champion_stats')
                .update({ found: existing.found + 1, updated_at: new Date() })
                .eq('id', existing.id);
        } else {
            await sb.from('champion_stats').insert({
                user_id: currentUser.id,
                champion_id: champ.id,
                champion_name: champ.name,
                found: 1,
                skipped: 0,
            });
        }
    }

    // 3. Mettre à jour les stats par champion (passés)
    for (const champ of gameChampionsSkipped) {
        const { data: existing } = await sb
            .from('champion_stats')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('champion_id', champ.id)
            .single();

        if (existing) {
            await sb.from('champion_stats')
                .update({ skipped: existing.skipped + 1, updated_at: new Date() })
                .eq('id', existing.id);
        } else {
            await sb.from('champion_stats').insert({
                user_id: currentUser.id,
                champion_id: champ.id,
                champion_name: champ.name,
                found: 0,
                skipped: 1,
            });
        }
    }

    feedback.textContent = t('saved');
    feedback.style.color = '#c8aa6e';
}

// ============================================================
// DASHBOARD
// ============================================================
async function showDashboard() {
    if (!currentUser) return;

    const modal = document.getElementById('dashboard-modal');
    modal.style.display = 'flex';
    document.getElementById('dashboard-content').innerHTML = '<p style="color:#c8aa6e;text-align:center">Chargement...</p>';

    // Récupérer les parties
    const { data: games } = await sb
        .from('games')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('played_at', { ascending: false });

    // Récupérer les stats champions
    const { data: champStats } = await sb
        .from('champion_stats')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('found', { ascending: false });

    // Leaderboard global
    const { data: leaderboard } = await sb
        .from('games')
        .select('score, lang, difficulty, profiles(username, avatar_url)')
        .order('score', { ascending: false })
        .limit(10);

    if (!games || games.length === 0) {
        document.getElementById('dashboard-content').innerHTML = `<p style="color:#888;text-align:center">${t('noGames')}</p>`;
        return;
    }

    const highscore = Math.max(...games.map(g => g.score));
    const avg = Math.round(games.reduce((a, g) => a + g.score, 0) / games.length);
    const bestChamp = champStats?.[0];
    const worstChamp = champStats?.filter(c => c.skipped > 0).sort((a, b) => b.skipped - a.skipped)[0];

    const leaderboardHTML = leaderboard?.map((g, i) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a2e33;">
            <span style="color:${i === 0 ? '#c8aa6e' : '#f0e6d2'}">${i + 1}. ${g.profiles?.username || 'Anonyme'}</span>
            <span style="color:#c8aa6e;font-weight:bold">${g.score}</span>
        </div>
    `).join('') || '';

    const recentGames = games.slice(0, 5).map(g => `
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #2a2e33;font-size:0.85rem;">
            <span style="color:#888">${new Date(g.played_at).toLocaleDateString()}</span>
            <span style="color:#888">${g.difficulty} · ${g.lang.toUpperCase()}</span>
            <span style="color:#c8aa6e;font-weight:bold">${g.score} pts</span>
        </div>
    `).join('');

    document.getElementById('dashboard-content').innerHTML = `
        <div class="dash-stats">
            <div class="dash-stat">
                <div class="dash-stat-value">${highscore}</div>
                <div class="dash-stat-label">${t('highscore')}</div>
            </div>
            <div class="dash-stat">
                <div class="dash-stat-value">${avg}</div>
                <div class="dash-stat-label">${t('avgScore')}</div>
            </div>
            <div class="dash-stat">
                <div class="dash-stat-value">${games.length}</div>
                <div class="dash-stat-label">${t('gamesPlayed')}</div>
            </div>
        </div>

        ${bestChamp ? `
        <div class="dash-section">
            <div class="dash-section-title">🏆 ${t('bestChamp')}</div>
            <div style="color:#f0e6d2">${bestChamp.champion_name} — ${bestChamp.found} fois trouvé</div>
        </div>` : ''}

        ${worstChamp ? `
        <div class="dash-section">
            <div class="dash-section-title">💀 ${t('worstChamp')}</div>
            <div style="color:#f0e6d2">${worstChamp.champion_name} — ${worstChamp.skipped} fois passé</div>
        </div>` : ''}

        <div class="dash-section">
            <div class="dash-section-title">🕹️ Dernières parties</div>
            ${recentGames}
        </div>

        <div class="dash-section">
            <div class="dash-section-title">🌍 ${t('leaderboard')}</div>
            ${leaderboardHTML}
        </div>
    `;
}

function closeDashboard() {
    document.getElementById('dashboard-modal').style.display = 'none';
}

// ============================================================
// UTILITAIRES
// ============================================================
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

async function loadChampions() {
    try {
        const res = await fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json');
        const data = await res.json();
        champions = data
            .filter(c => c.id !== -1 && !c.name.includes("Bot") && !c.name.includes("Boom"))
            .map(c => ({ id: c.id, name: c.name, alias: c.alias }));
    } catch (e) { console.error("Erreur chargement champions"); }
}

function playAudio(champ) {
    const sources = getAudioSources(champ);
    const idx = Math.floor(Math.random() * sources.length);
    player.src = sources[idx];
    player.play().catch(() => {
        const fallback = sources[idx === 0 ? sources.length - 1 : 0];
        if (fallback && fallback !== sources[idx]) {
            player.src = fallback;
            player.play().catch(() => {});
        }
    });
}

// ============================================================
// TRADUCTIONS UI
// ============================================================
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
    document.getElementById('login-btn').textContent = t('login');
    document.getElementById('logout-btn').textContent = t('logout');
    document.getElementById('dashboard-btn').textContent = t('dashboard');
}

// ============================================================
// JEU
// ============================================================
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
    gameChampionsFound = [];
    gameChampionsSkipped = [];

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

        gameChampionsFound.push(currentChamp);

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

async function endGame() {
    clearInterval(timerInterval);
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('setup-area').style.display = 'flex';
    document.getElementById('start-btn').style.display = 'block';
    document.getElementById('start-btn').textContent = t('replay');
    feedback.textContent = t('finished') + score;
    feedback.style.color = '#c8aa6e';

    if (currentChamp) {
        document.getElementById('champ-image').src = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${currentChamp.alias}_0.jpg`;
        document.getElementById('champ-image').style.display = 'block';
    }

    if (currentUser) await saveGame();
}

// ============================================================
// ÉVÉNEMENTS
// ============================================================
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
    gameChampionsSkipped.push(currentChamp);
    feedback.textContent = t('itwas') + currentChamp.name;
    feedback.style.color = '#c8aa6e';
    nextChampion();
};
document.getElementById('play-btn').onclick = () => { player.play(); input.focus(); };
document.getElementById('login-btn').onclick = signInWithGoogle;
document.getElementById('logout-btn').onclick = signOut;
document.getElementById('dashboard-btn').onclick = showDashboard;
document.getElementById('close-dashboard').onclick = closeDashboard;
document.getElementById('dashboard-modal').onclick = (e) => {
    if (e.target === document.getElementById('dashboard-modal')) closeDashboard();
};

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

// ============================================================
// INIT AUTH
// ============================================================
sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAuthUI();
});

(async () => {
    const { data: { session } } = await sb.auth.getSession();
    currentUser = session?.user || null;
    updateAuthUI();
    await loadChampions();
})();
