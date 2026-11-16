// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score,
// kill feed, bomb status, buy menu and the overlay panels. It never touches
// the simulation; main.js pushes numbers in and reads callbacks out.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorFill = $('armor-fill');
  const armorNum = $('armor-num');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const phaseLabel = $('phase-label');
  const scoreValue = $('score-value');
  const roundValue = $('round-value');
  const aliveAttack = $('alive-attack');
  const aliveDefend = $('alive-defend');
  const killfeed = $('killfeed');
  const bombStatus = $('bomb-status');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const vignette = $('vignette');
  const buyMenu = $('buymenu');
  const buyMoney = $('buy-money');
  const buyGrid = $('buy-grid');
  const bombCarrier = $('bomb-carrier');
  const spectate = $('spectate');

  let hitTimer = 0;
  let bannerTimer = 0;
  let last = { mag: -1, reserve: -1, hp: -1, armor: -1, money: -1, timer: -1, score: '', alive: '' };

  function setAmmo(mag, reserve, name) {
    if (mag === last.mag && reserve === last.reserve) return;
    last.mag = mag;
    last.reserve = reserve;
    ammoMag.textContent = String(mag);
    ammoReserve.textContent = `/ ${reserve}`;
    if (name) weaponName.textContent = name;
    $('ammo').classList.toggle('empty', mag === 0);
  }

  function setHealth(hp, armor) {
    if (hp === last.hp && armor === last.armor) return;
    last.hp = hp;
    last.armor = armor;
    healthFill.style.width = `${Math.max(0, hp)}%`;
    healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
    armorFill.style.width = `${Math.min(100, armor)}%`;
    armorNum.textContent = String(Math.ceil(armor));
    $('health').classList.toggle('low', hp <= 30);
  }

  function setMoney(value) {
    if (value === last.money) return;
    last.money = value;
    moneyValue.textContent = `$${value}`;
    if (buyMoney) buyMoney.textContent = `$${value}`;
  }

  function setTimer(seconds, phase) {
    const s = Math.max(0, Math.ceil(seconds));
    if (s === last.timer) return;
    last.timer = s;
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    timerValue.textContent = `${mm}:${ss}`;
    timerValue.classList.toggle('urgent', s <= 10 && phase !== 'buy');
    phaseLabel.textContent = phase === 'buy' ? 'BUY PHASE' : phase === 'planted' ? 'BOMB PLANTED' : phase === 'over' ? 'ROUND OVER' : 'ROUND';
  }

  function setScore(a, d, round) {
    const text = `${a} — ${d}`;
    if (text === last.score) return;
    last.score = text;
    scoreValue.textContent = text;
    roundValue.textContent = `ROUND ${round}`;
  }

  function setAlive(a, d) {
    const text = `${a}|${d}`;
    if (text === last.alive) return;
    last.alive = text;
    aliveAttack.textContent = '●'.repeat(a) + '○'.repeat(Math.max(0, 4 - a));
    aliveDefend.textContent = '●'.repeat(d) + '○'.repeat(Math.max(0, 4 - d));
  }

  function hitMarker(killed, holdMs = 90) {
    hitmarker.classList.add('on');
    hitmarker.classList.toggle('kill', killed);
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
  }

  function setCrosshairGap(px) {
    crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
  }

  function damageFlash() {
    vignette.classList.add('on');
    setTimeout(() => vignette.classList.remove('on'), 180);
  }

  function killfeedAdd(killer, victim, headshot, killerTeam) {
    const line = document.createElement('div');
    line.className = `feed-line ${killerTeam}`;
    line.innerHTML = `<b></b><span class="sep"> → </span><span class="hs">${headshot ? '◉ ' : ''}</span><span></span>`;
    line.children[0].textContent = killer;
    line.children[3].textContent = victim;
    killfeed.prepend(line);
    while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
    setTimeout(() => line.remove(), 6000);
  }

  function showBanner(text, sub, good) {
    bannerTitle.textContent = text;
    bannerSub.textContent = sub || '';
    banner.classList.toggle('good', !!good);
    banner.classList.toggle('bad', !good);
    banner.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      banner.hidden = true;
    }, 3800);
  }

  function hideBanner() {
    banner.hidden = true;
    clearTimeout(bannerTimer);
  }

  function setBombPlanted(seconds) {
    bombStatus.hidden = false;
    bombStatus.textContent = `BOMB PLANTED — ${Math.ceil(seconds)}s`;
    bombStatus.classList.toggle('urgent', seconds <= 10);
  }

  function clearBomb() {
    bombStatus.hidden = true;
  }

  function setBombCarrier(has) {
    bombCarrier.hidden = !has;
  }

  function showBuyMenu(items, money, onBuy) {
    buyGrid.innerHTML = '';
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.disabled = money < item.price || !!item.owned;
      button.innerHTML = `<span class="buy-key"></span><span class="buy-name"></span><span class="buy-desc"></span><span class="buy-price"></span>`;
      button.children[0].textContent = item.key;
      button.children[1].textContent = item.name;
      button.children[2].textContent = item.desc;
      button.children[3].textContent = item.owned ? 'OWNED' : `$${item.price}`;
      button.addEventListener('click', () => onBuy(item.id));
      buyGrid.appendChild(button);
    }
    setMoney(money);
    buyMenu.hidden = false;
  }

  function hideBuyMenu() {
    buyMenu.hidden = true;
  }

  function showSpectate(text) {
    spectate.hidden = false;
    spectate.querySelector('p').textContent = text;
  }

  function hideSpectate() {
    spectate.hidden = true;
  }

  const OVERLAY_COPY = {
    start: {
      title: 'Emberworks',
      copy: 'Foundry Yard. Plant the bomb at A or B, or wipe out Rogue. First to five rounds takes the match.',
      action: 'Click to play',
    },
    paused: {
      title: 'Emberworks',
      copy: 'Paused. Click to resume.',
      action: 'Click to resume',
    },
    dead: {
      title: 'You were eliminated',
      copy: 'Your team fights on. You respawn next round.',
      action: 'Keep watching',
    },
    matchwin: {
      title: 'Vanguard takes the match',
      copy: '',
      action: 'Play again',
    },
    matchlose: {
      title: 'Rogue takes the match',
      copy: '',
      action: 'Play again',
    },
  };

  function showOverlay(mode, detail) {
    const text = OVERLAY_COPY[mode];
    title.textContent = text.title;
    copy.textContent = mode === 'matchwin' || mode === 'matchlose' ? `Final score ${detail}.` : text.copy;
    play.textContent = text.action;
    overlay.hidden = false;
    play.focus();
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  return {
    setAmmo,
    setHealth,
    setMoney,
    setTimer,
    setScore,
    setAlive,
    hitMarker,
    setCrosshairGap,
    damageFlash,
    killfeedAdd,
    showBanner,
    hideBanner,
    setBombPlanted,
    clearBomb,
    setBombCarrier,
    showBuyMenu,
    hideBuyMenu,
    showSpectate,
    hideSpectate,
    showOverlay,
    hideOverlay,
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
