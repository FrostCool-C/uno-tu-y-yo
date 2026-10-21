// game.js - UNO! Virtual para Parejas con Firebase Realtime Database (V2.1: corregido)
(function () {
  'use strict';

  // Colección de Avatares Tiernos
  const AVATARS = [
    { id: 'cat', emoji: '🐱', name: 'Michi' },
    { id: 'bunny', emoji: '🐰', name: 'Conejita' },
    { id: 'panda', emoji: '🐼', name: 'Pandita' },
    { id: 'fox', emoji: '🦊', name: 'Zorrito' },
    { id: 'bear', emoji: '🐻', name: 'Osito' },
    { id: 'penguin', emoji: '🐧', name: 'Pingüi' },
    { id: 'dog', emoji: '🐶', name: 'Perrito' },
    { id: 'koala', emoji: '🐨', name: 'Koala' }
  ];

  // Autenticación (SHA-256 con salt). La contraseña no está en el código.
  const AUTH_SALT = 'uno_tu_y_yo_amor_inquebrantable_2026';
  const AUTH_HASH = '2a3793a12fbd676a552f81c5fef70ecbad97cb57c1a41609db3e82535627b16b';

  // Estado local
  let db = null;
  let roomRef = null;
  let currentRoomId = null;
  let myRole = null; // 'p1' o 'p2'
  let myName = 'Jugador';
  let opponentName = 'Rival';
  let myAvatar = AVATARS[0];
  let opponentAvatarEmoji = '💌';
  let gameState = null;
  let roomScores = { p1: 0, p2: 0 };   // FIX: puntajes reales de la sala
  let pendingWildCard = null;
  let drawnThisTurn = false;
  let lastTurnSeen = null;             // FIX: para reiniciar el robo solo al cambiar de turno
  let isAnimatingCard = false;
  let lastReactionTime = 0;

  // Elementos del DOM
  const screens = {
    lock: document.getElementById('screen-lock'),
    connect: document.getElementById('screen-connect'),
    waiting: document.getElementById('screen-waiting'),
    config: document.getElementById('screen-config'),
    colorPicker: document.getElementById('modal-color-picker'),
    winnerModal: document.getElementById('modal-winner')
  };

  const ui = {
    lockInput: document.getElementById('input-lock-pass'),
    lockForm: document.getElementById('form-lock'),
    lockError: document.getElementById('lock-error-msg'),
    btnUnlock: document.getElementById('btn-unlock'),
    avatarPickerGrid: document.getElementById('avatar-picker-grid'),
    btnRandomAvatar: document.getElementById('btn-random-avatar'),
    roomInput: document.getElementById('input-room'),
    nameInput: document.getElementById('input-name'),
    btnCreate: document.getElementById('btn-create-room'),
    btnJoin: document.getElementById('btn-join-room'),
    shareLink: document.getElementById('share-link-text'),
    btnCopyLink: document.getElementById('btn-copy-link'),
    btnStartGame: document.getElementById('btn-start-game'),
    btnConfig: document.getElementById('btn-open-config'), // puede no existir en el HTML
    btnSaveConfig: document.getElementById('btn-save-config'),
    btnCloseConfig: document.getElementById('btn-close-config'),
    configJson: document.getElementById('input-config-json'),
    btnSoundToggle: document.getElementById('btn-sound-toggle'),
    opponentAvatar: document.getElementById('opponent-avatar'),
    opponentName: document.getElementById('opponent-name'),
    opponentCardCount: document.getElementById('opponent-card-count'),
    opponentScore: document.getElementById('opponent-score'),
    opponentCardsFan: document.getElementById('opponent-cards-fan'),
    opponentPill: document.getElementById('opponent-pill'),
    myAvatar: document.getElementById('player-avatar'),
    myHandContainer: document.getElementById('player-hand-cards'),
    myName: document.getElementById('player-name'),
    myCardCount: document.getElementById('player-card-count'),
    myScore: document.getElementById('player-score'),
    myPill: document.getElementById('player-pill'),
    drawPile: document.getElementById('draw-pile'),
    discardSlot: document.getElementById('discard-slot'),
    activeColorBanner: document.getElementById('active-color-badge'),
    actionBanner: document.getElementById('action-status-banner'),
    btnUno: document.getElementById('btn-shout-uno'),
    btnPass: document.getElementById('btn-pass-turn'),
    btnRematch: document.getElementById('btn-rematch'),
    winnerText: document.getElementById('winner-name-text'),
    winnerAvatarDisplay: document.getElementById('winner-avatar-display')
  };

  // Helper: registra un listener solo si el elemento existe (evita que un null rompa todo)
  function on(el, evt, fn) {
    if (el) el.addEventListener(evt, fn);
  }

  // Los scripts están al final del <body>, así que el DOM puede estar ya listo
  function boot() {
    initAuthLock();
    initSoundToggle();
    initAvatarSelector();
    checkUrlParams();
    setupEventListeners();
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  async function computePasswordHash(input) {
    const data = new TextEncoder().encode(input.trim() + AUTH_SALT);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function initAuthLock() {
    const savedToken = localStorage.getItem('uno_auth_token');
    const hasConfig = window.FirebaseManager.getSavedConfig();

    if (savedToken === AUTH_HASH && hasConfig) {
      screens.lock.classList.add('hidden');
      screens.connect.classList.remove('hidden');
    } else {
      screens.lock.classList.remove('hidden');
      screens.connect.classList.add('hidden');
    }

    if (!window.crypto || !crypto.subtle) {
      ui.lockError.textContent = 'Abre el juego desde HTTPS (GitHub Pages) para poder entrar.';
      ui.lockError.classList.remove('hidden');
      return;
    }

    on(ui.lockForm, 'submit', async (e) => {
      e.preventDefault();
      const val = ui.lockInput.value;
      if (!val) return;
      const hash = await computePasswordHash(val);
      if (hash === AUTH_HASH) {
        const cfg = await window.FirebaseManager.unlock(val);
        if (!cfg) {
          ui.lockError.textContent = 'No se pudo descifrar la configuración de Firebase.';
          ui.lockError.classList.remove('hidden');
          return;
        }
        localStorage.setItem('uno_auth_token', AUTH_HASH);
        ui.lockError.classList.add('hidden');
        screens.lock.classList.add('hidden');
        screens.connect.classList.remove('hidden');
        window.sounds.victory();
      } else {
        ui.lockError.textContent = 'Contraseña incorrecta ❌';
        ui.lockError.classList.remove('hidden');
        ui.lockInput.classList.add('shake-input');
        setTimeout(() => ui.lockInput.classList.remove('shake-input'), 400);
        ui.lockInput.value = '';
      }
    });
  }

  function initSoundToggle() {
    on(ui.btnSoundToggle, 'click', () => {
      const active = window.sounds.toggle();
      ui.btnSoundToggle.textContent = active ? '🔊' : '🔇';
    });
  }

  function initAvatarSelector() {
    const savedAvatarId = localStorage.getItem('uno_my_avatar_id');
    const found = savedAvatarId && AVATARS.find(a => a.id === savedAvatarId);
    myAvatar = found || AVATARS[Math.floor(Math.random() * AVATARS.length)];
    renderAvatarGrid();

    on(ui.btnRandomAvatar, 'click', () => {
      const remaining = AVATARS.filter(a => a.id !== myAvatar.id);
      myAvatar = remaining[Math.floor(Math.random() * remaining.length)];
      localStorage.setItem('uno_my_avatar_id', myAvatar.id);
      renderAvatarGrid();
      window.sounds.emojiPop();
    });
  }

  function renderAvatarGrid() {
    ui.avatarPickerGrid.innerHTML = '';
    AVATARS.forEach(avatar => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `avatar-option-btn ${avatar.id === myAvatar.id ? 'selected' : ''}`;
      btn.innerHTML = `
        <span class="avatar-emoji-main">${avatar.emoji}</span>
        <span class="avatar-name-sub">${avatar.name}</span>
      `;
      btn.addEventListener('click', () => {
        myAvatar = avatar;
        localStorage.setItem('uno_my_avatar_id', avatar.id);
        renderAvatarGrid();
        window.sounds.emojiPop();
      });
      ui.avatarPickerGrid.appendChild(btn);
    });
  }

  function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room') || params.get('sala');
    if (roomParam) ui.roomInput.value = roomParam.trim().toUpperCase();
  }

  function setupEventListeners() {
    // FIX PRINCIPAL: btn-open-config no existe en index.html; antes esto lanzaba
    // TypeError y dejaba TODOS los botones siguientes sin funcionar.
    on(ui.btnConfig, 'click', () => {
      const saved = window.FirebaseManager.getSavedConfig();
      if (saved) ui.configJson.value = JSON.stringify(saved, null, 2);
      screens.config.classList.remove('hidden');
    });

    on(ui.btnCloseConfig, 'click', () => screens.config.classList.add('hidden'));

    on(ui.btnSaveConfig, 'click', () => {
      try {
        const parsed = JSON.parse(ui.configJson.value);
        if (!parsed.apiKey || !parsed.databaseURL) {
          alert('Por favor incluye al menos "apiKey" y "databaseURL".');
          return;
        }
        window.FirebaseManager.saveConfig(parsed);
        alert('¡Configuración guardada! La página se actualizará.');
        window.location.reload();
      } catch (err) {
        alert('JSON inválido. Revisa el formato de tus credenciales de Firebase.');
      }
    });

    on(ui.btnCreate, 'click', () => {
      const name = ui.nameInput.value.trim() || 'Jugador 1';
      initFirebaseSession(generateRoomCode(), 'p1', name);
    });

    on(ui.btnJoin, 'click', () => {
      const name = ui.nameInput.value.trim() || 'Jugador 2';
      const roomId = ui.roomInput.value.trim().toUpperCase();
      if (!roomId) {
        alert('Escribe el código de sala o abre el enlace que te enviaron.');
        return;
      }
      initFirebaseSession(roomId, 'p2', name);
    });

    on(ui.btnCopyLink, 'click', () => {
      const url = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
      const done = () => {
        ui.btnCopyLink.textContent = '¡Copiado! ✓';
        setTimeout(() => ui.btnCopyLink.textContent = 'Copiar Enlace', 2000);
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(done).catch(() => prompt('Copia este enlace:', url));
      } else {
        prompt('Copia este enlace:', url);
      }
    });

    on(ui.btnStartGame, 'click', startNewGame);

    on(ui.drawPile, 'click', onDrawCard);
    on(ui.btnPass, 'click', onPassTurn);
    on(ui.btnUno, 'click', onShoutUno);
    on(ui.btnRematch, 'click', () => {
      screens.winnerModal.classList.add('hidden');
      startNewGame();
    });

    document.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', () => sendReaction(btn.dataset.emoji));
    });

    document.querySelectorAll('.color-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => applyChosenColor(btn.dataset.color));
    });
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  }

  // Conexión con Firebase
  function initFirebaseSession(roomId, role, name) {
    const config = window.FirebaseManager.getSavedConfig();
    if (!config) {
      screens.config.classList.remove('hidden');
      alert('Para jugar en tiempo real, primero pega las credenciales de tu proyecto gratuito de Firebase.');
      return;
    }
    if (typeof firebase === 'undefined') {
      alert('No se pudo cargar Firebase. Revisa tu conexión a internet.');
      return;
    }

    try {
      if (!firebase.apps.length) firebase.initializeApp(config);
      db = firebase.database();
    } catch (err) {
      alert('Error inicializando Firebase: ' + err.message);
      return;
    }

    currentRoomId = roomId;
    myRole = role;
    myName = name;
    roomRef = db.ref(`uno_rooms/${currentRoomId}`);

    screens.connect.classList.add('hidden');
    ui.shareLink.textContent = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
    if (myRole === 'p2') screens.waiting.classList.remove('hidden');

    const playerUpdate = {};
    playerUpdate[`players/${myRole}`] = { name: myName, avatar: myAvatar.emoji, connected: true };
    roomRef.update(playerUpdate).catch(err => {
      alert('Firebase rechazó la conexión: ' + err.message +
        '\n\nRevisa las Reglas de Realtime Database en la consola de Firebase.');
      screens.waiting.classList.add('hidden');
      screens.connect.classList.remove('hidden');
    });

    db.ref('.info/connected').on('value', (snap) => {
      if (snap.val() === true) {
        const connRef = roomRef.child(`players/${myRole}/connected`);
        connRef.onDisconnect().set(false);
        connRef.set(true);
      }
    });

    roomRef.on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      handleRoomUpdate(data);
    }, (err) => {
      alert('Sin permiso para leer la sala: ' + err.message);
    });

    roomRef.child('reaction').on('value', (snapshot) => {
      const rx = snapshot.val();
      // FIX: no repetir el emoji propio (ya se muestra localmente) ni reacciones viejas
      if (rx && rx.time && rx.sender !== myRole && rx.time !== lastReactionTime &&
          Date.now() - rx.time < 4000) {
        lastReactionTime = rx.time;
        window.sounds.emojiPop();
        triggerFloatingEmoji(rx.emoji);
      }
    });
  }

  function handleRoomUpdate(data) {
    const p1 = data.players && data.players.p1;
    const p2 = data.players && data.players.p2;
    roomScores = { p1: (data.scores && data.scores.p1) || 0, p2: (data.scores && data.scores.p2) || 0 };

    const me = myRole === 'p1' ? p1 : p2;
    const opp = myRole === 'p1' ? p2 : p1;
    const oppRole = myRole === 'p1' ? 'p2' : 'p1';

    ui.myName.textContent = (me && me.name) || myName;
    ui.myAvatar.textContent = (me && me.avatar) || myAvatar.emoji;
    opponentName = (opp && opp.name) || 'Rival';
    opponentAvatarEmoji = (opp && opp.avatar) || '💌';
    ui.opponentName.textContent = (opp && opp.name) || 'Esperando a tu pareja...';
    ui.opponentAvatar.textContent = opponentAvatarEmoji;
    ui.myScore.textContent = `★ ${roomScores[myRole]}`;
    ui.opponentScore.textContent = `★ ${roomScores[oppRole]}`;

    if (!data.gameState) {
      screens.waiting.classList.remove('hidden');
      // Solo el creador (p1) puede iniciar, para evitar dos barajas distintas
      if (p1 && p2 && myRole === 'p1') {
        ui.btnStartGame.classList.remove('hidden');
        ui.btnStartGame.textContent = '¡Ambos conectados! Comenzar Juego';
      } else {
        ui.btnStartGame.classList.add('hidden');
      }
      return;
    }

    screens.waiting.classList.add('hidden');
    gameState = data.gameState;
    renderGameState();
  }

  // Baraja oficial de 108 cartas
  function createUnoDeck() {
    const colors = ['red', 'blue', 'green', 'yellow'];
    const deck = [];
    let id = 1;
    colors.forEach(color => {
      deck.push({ id: `c_${id++}`, color, value: '0' });
      for (let n = 1; n <= 9; n++) {
        deck.push({ id: `c_${id++}`, color, value: `${n}` });
        deck.push({ id: `c_${id++}`, color, value: `${n}` });
      }
      ['skip', 'reverse', '+2'].forEach(action => {
        deck.push({ id: `c_${id++}`, color, value: action });
        deck.push({ id: `c_${id++}`, color, value: action });
      });
    });
    for (let i = 0; i < 4; i++) {
      deck.push({ id: `c_${id++}`, color: 'wild', value: 'wild' });
      deck.push({ id: `c_${id++}`, color: 'wild', value: '+4' });
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function startNewGame() {
    if (!roomRef) return;
    const deck = createUnoDeck();
    const p1Hand = deck.splice(0, 7);
    const p2Hand = deck.splice(0, 7);
    // Carta inicial numérica (sin comodines ni acciones)
    let firstCardIndex = deck.findIndex(c => c.color !== 'wild' && /^\d$/.test(c.value));
    if (firstCardIndex === -1) firstCardIndex = 0;
    const initialDiscard = deck.splice(firstCardIndex, 1)[0];

    lastTurnSeen = null;
    roomRef.update({
      status: 'playing',
      gameState: {
        deck,
        discardTop: initialDiscard,
        activeColor: initialDiscard.color,
        currentTurn: 'p1',
        hands: { p1: p1Hand, p2: p2Hand },
        unoCalled: { p1: false, p2: false },
        lastAction: 'Partida iniciada',
        winner: null
      }
    });
  }

  // Firebase elimina arrays vacíos y a veces los devuelve como objetos
  function asArray(v) {
    if (!v) return [];
    return Array.isArray(v) ? v.filter(Boolean) : Object.values(v).filter(Boolean);
  }

  function renderGameState() {
    if (!gameState) return;
    const isMyTurn = gameState.currentTurn === myRole;
    const hands = gameState.hands || {};

    // FIX: antes se reiniciaba en cada actualización y permitía robar infinitas cartas
    if (gameState.currentTurn !== lastTurnSeen) {
      lastTurnSeen = gameState.currentTurn;
      drawnThisTurn = false;
      ui.btnPass.classList.add('hidden');
    }
    if (!isMyTurn) ui.btnPass.classList.add('hidden');

    ui.myPill.classList.toggle('active-turn', isMyTurn);
    ui.opponentPill.classList.toggle('active-turn', !isMyTurn);

    ui.actionBanner.textContent = gameState.lastAction || (isMyTurn ? '¡Es tu turno!' : `Turno de ${opponentName}`);

    const colorNames = { red: 'Rojo', blue: 'Azul', green: 'Verde', yellow: 'Amarillo', wild: 'Comodín' };
    ui.activeColorBanner.textContent = colorNames[gameState.activeColor] || gameState.activeColor;
    ui.activeColorBanner.style.background = `var(--uno-${gameState.activeColor}, #64748b)`;

    ui.discardSlot.innerHTML = '';
    if (gameState.discardTop) ui.discardSlot.appendChild(createCardElement(gameState.discardTop, false));

    const opponentRole = myRole === 'p1' ? 'p2' : 'p1';
    const opponentHand = asArray(hands[opponentRole]);
    ui.opponentCardCount.textContent = opponentHand.length;
    ui.opponentCardsFan.innerHTML = '';
    const displayCount = Math.min(opponentHand.length, 14);
    for (let i = 0; i < displayCount; i++) {
      const cardBack = document.createElement('div');
      cardBack.className = 'card-back';
      cardBack.style.transform = `rotate(${(i - displayCount / 2) * 3}deg)`;
      ui.opponentCardsFan.appendChild(cardBack);
    }

    const myHand = asArray(hands[myRole]);
    if (!isAnimatingCard) {
      ui.myCardCount.textContent = myHand.length;
      ui.myHandContainer.innerHTML = '';
      myHand.forEach(card => {
        const isPlayable = isMyTurn && !gameState.winner &&
          canPlayCard(card, gameState.discardTop, gameState.activeColor);
        const cardEl = createCardElement(card, isPlayable);
        if (isPlayable) cardEl.addEventListener('click', () => onPlayCard(card, cardEl));
        ui.myHandContainer.appendChild(cardEl);
      });
    }

    const unoCalled = gameState.unoCalled || {};
    if (myHand.length === 2 && isMyTurn && !unoCalled[myRole]) {
      ui.btnUno.classList.remove('hidden');
    } else {
      ui.btnUno.classList.add('hidden');
    }

    // FIX: cerrar el modal en ambos lados cuando empieza la revancha
    if (gameState.winner) {
      handleGameOver(gameState.winner);
    } else {
      screens.winnerModal.classList.add('hidden');
    }
  }

  function canPlayCard(card, topCard, activeColor) {
    if (card.color === 'wild') return true;
    if (card.color === activeColor) return true;
    if (topCard && card.value === topCard.value) return true;
    return false;
  }

  function createCardElement(card, isPlayable) {
    const el = document.createElement('div');
    el.className = `uno-card color-${card.color} ${isPlayable ? 'playable' : 'unplayable'}`;
    let displayVal = card.value;
    if (card.value === 'skip') displayVal = '⊘';
    if (card.value === 'reverse') displayVal = '⇄';
    if (card.value === 'wild') displayVal = '★';
    el.innerHTML = `
      <div class="card-corner top-left">${displayVal}</div>
      <div class="card-inner-oval">
        <div class="card-center-val">${displayVal}</div>
      </div>
      <div class="card-corner bottom-right">${displayVal}</div>
    `;
    return el;
  }

  function animateCardToDiscard(cardEl, card, onComplete) {
    const cardRect = cardEl.getBoundingClientRect();
    const targetRect = ui.discardSlot.getBoundingClientRect();
    isAnimatingCard = true;

    const clone = cardEl.cloneNode(true);
    clone.className = `uno-card color-${card.color} card-flying-animation`;
    clone.style.left = `${cardRect.left}px`;
    clone.style.top = `${cardRect.top}px`;
    clone.style.width = `${cardRect.width}px`;
    clone.style.height = `${cardRect.height}px`;
    clone.style.margin = '0';
    clone.style.transform = 'scale(1)';
    cardEl.style.visibility = 'hidden';
    document.body.appendChild(clone);

    const randomRot = (Math.random() * 24 - 12).toFixed(1);
    requestAnimationFrame(() => {
      clone.style.left = `${targetRect.left}px`;
      clone.style.top = `${targetRect.top}px`;
      clone.style.transform = `scale(1.02) rotate(${randomRot}deg)`;
    });

    setTimeout(() => {
      clone.remove();
      isAnimatingCard = false;
      window.sounds.playCard();
      onComplete();
    }, 420);
  }

  function animateDrawCardToHand(onComplete) {
    const drawRect = ui.drawPile.getBoundingClientRect();
    const handRect = ui.myHandContainer.getBoundingClientRect();
    const clone = document.createElement('div');
    clone.className = 'draw-pile-card card-flying-animation';
    clone.style.left = `${drawRect.left}px`;
    clone.style.top = `${drawRect.top}px`;
    clone.style.width = `${drawRect.width}px`;
    clone.style.height = `${drawRect.height}px`;
    clone.style.margin = '0';
    clone.innerHTML = '<div class="uno-logo-text">UNO</div>';
    document.body.appendChild(clone);

    requestAnimationFrame(() => {
      clone.style.left = `${handRect.left + handRect.width / 2 - 40}px`;
      clone.style.top = `${handRect.top}px`;
      clone.style.transform = 'scale(0.9) rotate(6deg)';
    });

    setTimeout(() => {
      clone.remove();
      window.sounds.drawCard();
      onComplete();
    }, 400);
  }

  function onPlayCard(card, cardEl) {
    if (!gameState || gameState.currentTurn !== myRole || isAnimatingCard || gameState.winner) return;
    if (card.color === 'wild') {
      pendingWildCard = { card, cardEl };
      screens.colorPicker.classList.remove('hidden');
      return;
    }
    animateCardToDiscard(cardEl, card, () => executePlayCard(card, card.color));
  }

  function applyChosenColor(chosenColor) {
    screens.colorPicker.classList.add('hidden');
    if (!pendingWildCard) return;
    window.sounds.colorSelect();
    const { card, cardEl } = pendingWildCard;
    pendingWildCard = null;
    animateCardToDiscard(cardEl, card, () => executePlayCard(card, chosenColor));
  }

  function cardLabel(card, color) {
    const colorNames = { red: 'rojo', blue: 'azul', green: 'verde', yellow: 'amarillo' };
    const names = { wild: 'Comodín', '+4': '+4', '+2': '+2', skip: 'Salto', reverse: 'Reversa' };
    return `${names[card.value] || card.value} ${colorNames[color] || ''}`.trim();
  }

  function executePlayCard(card, resolvedColor) {
    const hands = gameState.hands || {};
    const myHand = asArray(hands[myRole]);
    const cardIdx = myHand.findIndex(c => c.id === card.id);
    if (cardIdx === -1) return;
    myHand.splice(cardIdx, 1);

    const opponentRole = myRole === 'p1' ? 'p2' : 'p1';
    let nextTurn = opponentRole;
    const newDeck = asArray(gameState.deck);
    const opponentHand = asArray(hands[opponentRole]);
    let actionDesc = `${myName} jugó ${cardLabel(card, resolvedColor)}`;

    // Reglas oficiales de UNO para 2 jugadores
    if (card.value === 'reverse' || card.value === 'skip') {
      nextTurn = myRole;
      actionDesc = `${myName} jugó ${card.value === 'reverse' ? 'Reversa' : 'Salto'} y vuelve a tirar!`;
    } else if (card.value === '+2') {
      opponentHand.push(...drawCardsFromDeck(newDeck, 2));
      nextTurn = myRole;
      actionDesc = `${opponentName} roba 2 cartas! ${myName} vuelve a tirar`;
    } else if (card.value === '+4') {
      opponentHand.push(...drawCardsFromDeck(newDeck, 4));
      nextTurn = myRole;
      actionDesc = `${opponentName} roba 4 cartas! ${myName} vuelve a tirar`;
    }

    // Si no gritó UNO al quedarse con 1 carta: penalización de 2 cartas
    const unoCalledState = Object.assign({ p1: false, p2: false }, gameState.unoCalled || {});
    if (myHand.length === 1 && !unoCalledState[myRole]) {
      myHand.push(...drawCardsFromDeck(newDeck, 2));
      actionDesc += ` · ¡No gritó UNO! +2 de castigo`;
    }
    if (myHand.length > 1) unoCalledState[myRole] = false;
    if (opponentHand.length > 1) unoCalledState[opponentRole] = false;

    let roundWinner = null;
    if (myHand.length === 0) {
      roundWinner = myRole;
      actionDesc = `🎉 ¡${myName} ha ganado la partida!`;
      updateScoreOnWin(myRole);
    }

    // Se fuerza que el turno se reinicie para el siguiente jugador
    if (nextTurn === myRole) drawnThisTurn = false;
    ui.btnPass.classList.add('hidden');

    const updatedHands = {};
    updatedHands[myRole] = myHand;
    updatedHands[opponentRole] = opponentHand;

    roomRef.child('gameState').update({
      deck: newDeck,
      discardTop: card,
      activeColor: resolvedColor,
      currentTurn: nextTurn,
      hands: updatedHands,
      unoCalled: unoCalledState,
      lastAction: actionDesc,
      winner: roundWinner
    });
  }

  function onDrawCard() {
    if (!gameState || gameState.currentTurn !== myRole || drawnThisTurn || isAnimatingCard || gameState.winner) return;
    drawnThisTurn = true;

    animateDrawCardToHand(() => {
      const hands = gameState.hands || {};
      const newDeck = asArray(gameState.deck);
      const drawn = drawCardsFromDeck(newDeck, 1);
      if (!drawn.length) return;
      const opponentRole = myRole === 'p1' ? 'p2' : 'p1';

      const updatedHands = {};
      updatedHands[myRole] = [...asArray(hands[myRole]), ...drawn];
      updatedHands[opponentRole] = asArray(hands[opponentRole]);

      const unoCalled = Object.assign({ p1: false, p2: false }, gameState.unoCalled || {});
      unoCalled[myRole] = false;

      roomRef.child('gameState').update({
        deck: newDeck,
        hands: updatedHands,
        unoCalled,
        lastAction: `${myName} robó una carta`
      });
      ui.btnPass.classList.remove('hidden');
    });
  }

  function onPassTurn() {
    if (!gameState || gameState.currentTurn !== myRole) return;
    ui.btnPass.classList.add('hidden');
    roomRef.child('gameState').update({
      currentTurn: myRole === 'p1' ? 'p2' : 'p1',
      lastAction: `${myName} pasó el turno`
    });
  }

  function onShoutUno() {
    if (!gameState) return;
    window.sounds.shoutUno();
    triggerFloatingEmoji('⚡ ¡UNO!');
    const unoCalled = Object.assign({ p1: false, p2: false }, gameState.unoCalled || {});
    unoCalled[myRole] = true;
    roomRef.child('gameState').update({
      unoCalled,
      lastAction: `⚡ ¡${myName} gritó UNO!`
    });
    ui.btnUno.classList.add('hidden');
  }

  // Roba cartas; si el mazo se acaba, rebaraja una baraja nueva
  function drawCardsFromDeck(deck, count) {
    const cards = [];
    for (let i = 0; i < count; i++) {
      if (deck.length === 0) deck.push(...createUnoDeck());
      cards.push(deck.pop());
    }
    return cards;
  }

  // FIX: usa el puntaje real de la sala (antes siempre quedaba en 1)
  function updateScoreOnWin(winnerRole) {
    window.sounds.victory();
    roomRef.child(`scores/${winnerRole}`).transaction(current => (current || 0) + 1);
  }

  function handleGameOver(winnerRole) {
    const winnerIsMe = winnerRole === myRole;
    ui.winnerText.textContent = winnerIsMe ? `¡Ganaste tú, ${myName}! 🏆` : `¡Ganó ${opponentName}! 💖`;
    ui.winnerAvatarDisplay.textContent = winnerIsMe ? myAvatar.emoji : opponentAvatarEmoji;
    screens.winnerModal.classList.remove('hidden');
  }

  function sendReaction(emoji) {
    window.sounds.emojiPop();
    triggerFloatingEmoji(emoji);
    if (roomRef) {
      roomRef.child('reaction').set({ sender: myRole, emoji, time: Date.now() });
    }
  }

  function triggerFloatingEmoji(emoji) {
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    el.style.left = `${25 + Math.random() * 50}%`;
    el.style.bottom = '120px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }
})();
