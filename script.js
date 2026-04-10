// ============================================================
// CONFIG SUPABASE — remplace par tes vraies clés
// ============================================================
const SUPABASE_URL = 'https://rufkhrfwmfkzsmzxhgeg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LkNOHXfA4X2FMZ7E0Onr3Q_xgd699NP';


let sb;

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
let gameMode = 'normal'; // 'normal' ou 'survival'
let currentUser = null;
let gameChampionsFound = []; // champions trouvés dans la partie en cours
let gameChampionsSkipped = []; // champions passés dans la partie en cours

// ============================================================
// TEXTES UI (français uniquement)
// ============================================================
const TXT = {
    saving: 'Sauvegarde...',
    saved: 'Score sauvegardé !',
    highscore: 'Meilleur score',
    avgScore: 'Score moyen',
    gamesPlayed: 'Parties jouées',
    bestChamp: 'Champion le mieux reconnu',
    worstChamp: 'Champion le moins bien reconnu',
    leaderboard: 'Classement',
    noGames: 'Aucune partie jouée pour le moment.',
};

function getLangCode() { return lang === 'fr' ? 'fr_fr' : 'default'; }

// Normalise une chaîne pour la comparaison : minuscules, sans accents,
// sans apostrophes ni espaces. Permet de matcher "Kaï'Sa" avec "kaisa".
function normalize(str) {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // diacritiques
        .replace(/['’\s.\-]/g, '');       // apostrophes, espaces, points, tirets
}

// Échappe le HTML pour éviter l'injection XSS quand on construit du HTML
// avec des données venant de la base (usernames, etc.)
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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

    feedback.textContent = TXT.saving;

    // 1. Sauvegarder la partie
    const { error: gameError } = await sb.from('games').insert({
        user_id: currentUser.id,
        score,
        difficulty,
        lang,
        mode: gameMode,
        duration: TOTAL_TIME - timeLeft,
    });

    if (gameError) {
        console.error('Erreur sauvegarde partie:', gameError);
        feedback.textContent = 'Erreur de sauvegarde';
        feedback.style.color = '#ff4e50';
        return;
    }

    // 2. Agréger les stats par champion en mémoire
    // (un même champion peut apparaître plusieurs fois dans une partie)
    const aggregated = new Map();
    for (const champ of gameChampionsFound) {
        const key = champ.id;
        if (!aggregated.has(key)) {
            aggregated.set(key, { champ, found: 0, skipped: 0 });
        }
        aggregated.get(key).found++;
    }
    for (const champ of gameChampionsSkipped) {
        const key = champ.id;
        if (!aggregated.has(key)) {
            aggregated.set(key, { champ, found: 0, skipped: 0 });
        }
        aggregated.get(key).skipped++;
    }

    // 3. Récupérer les stats existantes en UNE SEULE requête
    const champIds = Array.from(aggregated.keys());
    if (champIds.length === 0) {
        feedback.textContent = TXT.saved;
        feedback.style.color = '#c8aa6e';
        return;
    }

    const { data: existingStats, error: selectError } = await sb
        .from('champion_stats')
        .select('champion_id, found, skipped')
        .eq('user_id', currentUser.id)
        .in('champion_id', champIds);

    if (selectError) {
        console.error('Erreur lecture stats:', selectError);
        feedback.textContent = 'Erreur de sauvegarde';
        feedback.style.color = '#ff4e50';
        return;
    }

    // Indexer les stats existantes par champion_id
    const existingByChamp = new Map();
    for (const row of (existingStats || [])) {
        existingByChamp.set(row.champion_id, row);
    }

    // 4. Construire les lignes à upsert en additionnant
    const rows = [];
    for (const [champId, agg] of aggregated) {
        const existing = existingByChamp.get(champId);
        rows.push({
            user_id: currentUser.id,
            champion_id: champId,
            champion_name: agg.champ.name,
            found: (existing?.found || 0) + agg.found,
            skipped: (existing?.skipped || 0) + agg.skipped,
            updated_at: new Date().toISOString(),
        });
    }

    // 5. UPSERT en UNE SEULE requête au lieu de N × 2
    const { error: upsertError } = await sb
        .from('champion_stats')
        .upsert(rows, { onConflict: 'user_id,champion_id' });

    if (upsertError) {
        console.error('Erreur upsert stats:', upsertError);
        feedback.textContent = 'Erreur de sauvegarde';
        feedback.style.color = '#ff4e50';
        return;
    }

    feedback.textContent = TXT.saved;
    feedback.style.color = '#c8aa6e';

    // Rafraîchir le leaderboard pour que le nouveau score apparaisse
    loadLeaderboard(lang, difficulty, gameMode);
}

// ============================================================
// DASHBOARD
// ============================================================
async function showDashboard() {
    if (!currentUser) return;

    const modal = document.getElementById('dashboard-modal');
    const content = document.getElementById('dashboard-content');
    modal.style.display = 'flex';
    content.innerHTML = '<p style="color:#c8aa6e;text-align:center">Chargement...</p>';

    // Récupérer les parties
    const { data: games, error: gamesErr } = await sb
        .from('games')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('played_at', { ascending: false });

    // Récupérer les stats champions
    const { data: champStats, error: statsErr } = await sb
        .from('champion_stats')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('found', { ascending: false });

    // Leaderboard global
    const { data: leaderboard, error: lbErr } = await sb
        .from('games')
        .select('score, lang, difficulty, profiles(username, avatar_url)')
        .order('score', { ascending: false })
        .limit(10);

    if (gamesErr || statsErr || lbErr) {
        console.error('Erreur dashboard:', gamesErr || statsErr || lbErr);
        content.innerHTML = '<p style="color:#ff4e50;text-align:center">Erreur de chargement. Réessaie plus tard.</p>';
        return;
    }

    if (!games || games.length === 0) {
        content.innerHTML = `<p style="color:#888;text-align:center">${TXT.noGames}</p>`;
        return;
    }

    const highscore = Math.max(...games.map(g => g.score));
    const avg = Math.round(games.reduce((a, g) => a + g.score, 0) / games.length);
    const bestChamp = champStats?.[0];
    const worstChamp = champStats?.filter(c => c.skipped > 0).sort((a, b) => b.skipped - a.skipped)[0];

    const leaderboardHTML = leaderboard?.map((g, i) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a2e33;">
            <span style="color:${i === 0 ? '#c8aa6e' : '#f0e6d2'}">${i + 1}. ${escapeHtml(g.profiles?.username || 'Anonyme')}</span>
            <span style="color:#c8aa6e;font-weight:bold">${g.score}</span>
        </div>
    `).join('') || '';

    const recentGames = games.slice(0, 5).map(g => `
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #2a2e33;font-size:0.85rem;">
            <span style="color:#888">${new Date(g.played_at).toLocaleDateString()}</span>
            <span style="color:#888">${escapeHtml(g.difficulty)} · ${escapeHtml((g.lang || '').toUpperCase())}</span>
            <span style="color:#c8aa6e;font-weight:bold">${g.score} pts</span>
        </div>
    `).join('');

    document.getElementById('dashboard-content').innerHTML = `
        <div class="dash-stats">
            <div class="dash-stat">
                <div class="dash-stat-value">${highscore}</div>
                <div class="dash-stat-label">${TXT.highscore}</div>
            </div>
            <div class="dash-stat">
                <div class="dash-stat-value">${avg}</div>
                <div class="dash-stat-label">${TXT.avgScore}</div>
            </div>
            <div class="dash-stat">
                <div class="dash-stat-value">${games.length}</div>
                <div class="dash-stat-label">${TXT.gamesPlayed}</div>
            </div>
        </div>

        ${bestChamp ? `
        <div class="dash-section">
            <div class="dash-section-title">🏆 ${TXT.bestChamp}</div>
            <div style="color:#f0e6d2">${escapeHtml(bestChamp.champion_name)} — ${bestChamp.found} fois trouvé</div>
        </div>` : ''}

        ${worstChamp ? `
        <div class="dash-section">
            <div class="dash-section-title">💀 ${TXT.worstChamp}</div>
            <div style="color:#f0e6d2">${escapeHtml(worstChamp.champion_name)} — ${worstChamp.skipped} fois passé</div>
        </div>` : ''}

        <div class="dash-section">
            <div class="dash-section-title">🕹️ Dernières parties</div>
            ${recentGames}
        </div>

        <div class="dash-section">
            <div class="dash-section-title">🌍 ${TXT.leaderboard}</div>
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
    if (gameMode === 'survival') {
        TOTAL_TIME = 15;          // timer court en Survie
        timeLeft = TOTAL_TIME;
    } else {
        TOTAL_TIME = 90;
        timeLeft = TOTAL_TIME;
    }
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
        // En Survie, le score = secondes totales survécues
        if (gameMode === 'survival') {
            score++;
            scoreDisplay.textContent = score;
        }
        updateTimer();
        if (timeLeft <= 0) endGame();
    }, 1000);
}

function updateTimer() {
    const p = (timeLeft / TOTAL_TIME) * 100;
    timerBar.style.width = p + '%';
    timerBar.classList.toggle('warning', timeLeft <= 15);
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const display = document.getElementById('timer-display');
    if (display) {
        display.textContent = mins + ':' + String(secs).padStart(2, '0');
        display.classList.toggle('warning', timeLeft <= 15);
    }
}

function check() {
    if (!currentChamp) return;
    if (normalize(input.value) === normalize(currentChamp.name)) {
        // En mode Normal, le score est le nombre de champions trouvés
        // En mode Survie, le score est le temps (déjà géré par le setInterval)
        if (gameMode === 'normal') {
            score++;
            scoreDisplay.textContent = score;
        } else {
            // Recharger le timer en Survie
            timeLeft = TOTAL_TIME;
            updateTimer();
        }
        feedback.textContent = 'Bien joué ! ' + currentChamp.name;
        feedback.style.color = '#00e676';
        feedback.classList.remove('animate');
        void feedback.offsetWidth;
        feedback.classList.add('animate');

        gameChampionsFound.push(currentChamp);

        const img = document.createElement('img');
        img.src = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${currentChamp.id}.png`;
        img.classList.add('history-icon', 'new');
        img.title = currentChamp.name;
        historyContainer.prepend(img);
        setTimeout(() => img.classList.remove('new'), 400);

        list.innerHTML = '';
        nextChampion();
    } else {
        feedback.textContent = 'Faux !';
        feedback.style.color = '#ff4e50';
        feedback.classList.remove('animate');
        void feedback.offsetWidth;
        feedback.classList.add('animate');
        input.value = '';
    }
}

async function endGame() {
    clearInterval(timerInterval);
    timerInterval = null;
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('setup-area').style.display = 'flex';
    document.getElementById('start-btn').style.display = 'block';
    document.getElementById('start-btn').innerHTML = '<svg class="btn-icon"><use href="#icon-sword"/></svg> Rejouer';
    feedback.textContent = 'Fini ! Score : ' + score;
    feedback.style.color = '#c8aa6e';
    player.pause();

    if (currentUser) await saveGame();
}

// ============================================================
// ÉVÉNEMENTS
// ============================================================
document.getElementById('btn-fr').onclick = () => {
    lang = 'fr';
    document.getElementById('btn-fr').classList.add('active');
    document.getElementById('btn-en').classList.remove('active');
    loadLeaderboard(lang, difficulty, gameMode);
};
document.getElementById('btn-en').onclick = () => {
    lang = 'en';
    document.getElementById('btn-en').classList.add('active');
    document.getElementById('btn-fr').classList.remove('active');
    loadLeaderboard(lang, difficulty, gameMode);
};
document.getElementById('btn-normal').onclick = () => {
    gameMode = 'normal';
    document.getElementById('btn-normal').classList.add('active');
    document.getElementById('btn-survival').classList.remove('active');
    document.getElementById('normal-desc').style.display = '';
    document.getElementById('survival-desc').style.display = 'none';
    loadLeaderboard(lang, difficulty, gameMode);
};
document.getElementById('btn-survival').onclick = () => {
    gameMode = 'survival';
    document.getElementById('btn-survival').classList.add('active');
    document.getElementById('btn-normal').classList.remove('active');
    document.getElementById('normal-desc').style.display = 'none';
    document.getElementById('survival-desc').style.display = '';
    loadLeaderboard(lang, difficulty, gameMode);
};
document.getElementById('btn-easy').onclick = () => {
    difficulty = 'easy';
    document.getElementById('btn-easy').classList.add('active');
    document.getElementById('btn-hard').classList.remove('active');
    document.getElementById('easy-desc').style.display = '';
    document.getElementById('hard-desc').style.display = 'none';
    loadLeaderboard(lang, difficulty, gameMode);
};
document.getElementById('btn-hard').onclick = () => {
    difficulty = 'hard';
    document.getElementById('btn-hard').classList.add('active');
    document.getElementById('btn-easy').classList.remove('active');
    document.getElementById('easy-desc').style.display = 'none';
    document.getElementById('hard-desc').style.display = '';
    loadLeaderboard(lang, difficulty, gameMode);
};

document.getElementById('start-btn').onclick = initGame;
document.getElementById('menu-btn').onclick = () => {
    clearInterval(timerInterval);
    timerInterval = null;
    // Réinitialiser le timer à sa valeur de base selon le mode
    TOTAL_TIME = gameMode === 'survival' ? 15 : 90;
    timeLeft = TOTAL_TIME;
    updateTimer();
    // Réinitialiser le score et l'historique affiché
    score = 0;
    scoreDisplay.textContent = '0';
    historyContainer.innerHTML = '';
    gameChampionsFound = [];
    gameChampionsSkipped = [];
    currentChamp = null;
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('setup-area').style.display = 'flex';
    document.getElementById('start-btn').style.display = 'block';
    document.getElementById('start-btn').innerHTML = '<svg class="btn-icon"><use href="#icon-sword"/></svg> Démarrer la partie';
    feedback.textContent = '';
    document.getElementById('champ-image').style.display = 'none';
    player.pause();
};
document.getElementById('reset-btn').onclick = initGame;
document.getElementById('check-btn').onclick = check;
document.getElementById('skip-btn').onclick = skipChampion;

function skipChampion() {
    if (!currentChamp) return;
    gameChampionsSkipped.push(currentChamp);
    const penalty = gameMode === 'survival' ? 3 : 5;
    feedback.textContent = "C'était " + currentChamp.name + "  (−" + penalty + "s)";
    feedback.style.color = '#ff9040';
    feedback.classList.remove('animate');
    void feedback.offsetWidth;
    feedback.classList.add('animate');
    timeLeft = Math.max(0, timeLeft - penalty);
    updateTimer();
    if (timeLeft <= 0) {
        endGame();
        return;
    }
    nextChampion();
}
document.getElementById('play-btn').onclick = () => { player.play(); input.focus(); };
document.getElementById('login-btn').onclick = () => {
    initSupabase();
    signInWithGoogle();
};
document.getElementById('logout-btn').onclick = signOut;
document.getElementById('dashboard-btn').onclick = showDashboard;
document.getElementById('close-dashboard').onclick = closeDashboard;
document.getElementById('dashboard-modal').onclick = (e) => {
    if (e.target === document.getElementById('dashboard-modal')) closeDashboard();
};

// Index de la suggestion actuellement surlignée (-1 = aucune)
let autocompleteIndex = -1;

function refreshAutocomplete() {
    const val = normalize(input.value);
    list.innerHTML = '';
    autocompleteIndex = -1;
    if (!val) return;
    const matches = champions
        .filter(c => normalize(c.name).includes(val))
        .slice(0, 8);
    matches.forEach((m, i) => {
        const div = document.createElement('div');
        div.textContent = m.name; // textContent = pas de risque XSS
        div.dataset.index = i;
        div.onclick = () => { input.value = m.name; list.innerHTML = ''; check(); };
        list.appendChild(div);
    });
}

function highlightAutocomplete(idx) {
    const items = list.querySelectorAll('div');
    if (items.length === 0) return;
    autocompleteIndex = ((idx % items.length) + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('active', i === autocompleteIndex));
    items[autocompleteIndex].scrollIntoView({ block: 'nearest' });
}

input.addEventListener('input', refreshAutocomplete);

input.addEventListener('keydown', (e) => {
    const items = list.querySelectorAll('div');
    if (e.key === 'ArrowDown' && items.length) {
        e.preventDefault();
        highlightAutocomplete(autocompleteIndex + 1);
    } else if (e.key === 'ArrowUp' && items.length) {
        e.preventDefault();
        highlightAutocomplete(autocompleteIndex - 1);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (autocompleteIndex >= 0 && items[autocompleteIndex]) {
            input.value = items[autocompleteIndex].textContent;
            list.innerHTML = '';
        }
        check();
    } else if (e.key === 'Escape') {
        list.innerHTML = '';
        autocompleteIndex = -1;
    } else if (e.key === 'Tab') {
        e.preventDefault();
        if (items.length === 0) {
            // Pas de suggestions → Tab = passer au champion suivant
            skipChampion();
        } else {
            // Il y a des suggestions → Tab = auto-complète
            const pick = autocompleteIndex >= 0 ? items[autocompleteIndex] : items[0];
            input.value = pick.textContent;
            list.innerHTML = '';
        }
    }
});

document.addEventListener('click', (e) => { if (e.target !== input) list.innerHTML = ''; });


// ============================================================
// LEADERBOARD PAGE D'ACCUEIL
// ============================================================
async function loadLeaderboard(lang = 'fr', difficulty = 'easy', mode = 'normal') {
    const lbList = document.getElementById('leaderboard-list');
    if (!lbList) return;
    lbList.innerHTML = '<p class="lb-loading">Chargement...</p>';

    // Mettre à jour le label de catégorie
    const cat = document.getElementById('lb-category');
    if (cat) {
        const modeLabel = mode === 'survival' ? 'Survie' : 'Normal';
        const langLabel = lang === 'fr' ? 'FR' : 'EN';
        const diffLabel = difficulty === 'easy' ? 'Facile' : 'Difficile';
        cat.textContent = modeLabel + ' · ' + langLabel + ' · ' + diffLabel;
    }

    if (!sb) initSupabase();

    const { data, error } = await sb
        .from('games')
        .select('score, profiles(username, avatar_url)')
        .eq('lang', lang)
        .eq('difficulty', difficulty)
        .eq('mode', mode)
        .order('score', { ascending: false })
        .limit(50);

    if (error || !data || data.length === 0) {
        lbList.innerHTML = '<p class="lb-empty">Aucune partie encore.</p>';
        return;
    }

    // Garder seulement le meilleur score par joueur
    const seen = new Set();
    const best = [];
    for (const g of data) {
        const name = g.profiles?.username || 'Anonyme';
        if (!seen.has(name)) {
            seen.add(name);
            best.push({ score: g.score, name, avatar: g.profiles?.avatar_url });
        }
        if (best.length >= 10) break;
    }

    lbList.innerHTML = best.map((g, i) => `
        <div class="lb-row ${i === 0 ? 'first' : i === 1 ? 'second' : i === 2 ? 'third' : ''}">
            <span class="lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
            <span class="lb-name">${escapeHtml(g.name)}</span>
            <span class="lb-score">${g.score}</span>
        </div>
    `).join('');
}



// ============================================================
// INIT
// ============================================================
function initSupabase() {
    if (sb) return; // déjà initialisé
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    sb.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user || null;
        updateAuthUI();
    });

    sb.auth.getSession().then(({ data: { session } }) => {
        currentUser = session?.user || null;
        updateAuthUI();
    });
}

// Charger les champions dès que possible (pas besoin de Supabase)
document.addEventListener('DOMContentLoaded', async () => {
    await loadChampions();
    loadLeaderboard('fr', 'easy', 'normal');

    // Initialiser Supabase seulement si on revient d'un redirect OAuth
    // (l'URL contient un token)
    if (window.location.hash.includes('access_token') || 
        window.location.search.includes('code=')) {
        initSupabase();
    }
});
