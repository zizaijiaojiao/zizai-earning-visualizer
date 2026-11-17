(() => {
  'use strict';

  const KEY = 'zizai-earnings-v2';
  const OLD_KEY = 'zizai-earnings-v1';
  const ZONE = 'Asia/Shanghai';
  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
  const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const money = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const whole = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
  const $ = id => document.getElementById(id);
  const hkd = n => `HK$${money.format(n)}`;
  const rmb = n => `¥${money.format(n)}`;
  const rmbRounded = n => `¥${whole.format(Math.ceil(n))}`;
  const formatClock = n => `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor(n % 3600 / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  function clockParts(instant = new Date()) {
    const p = Object.fromEntries(dateFormat.formatToParts(instant).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, seconds: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second), display: `${p.hour}:${p.minute}:${p.second}` };
  }
  function defaults() {
    return {
      version: 2,
      settings: { basePay: 1100, overtimePay: 225, rate: 0.9, rateCustomized: false, startTime: '09:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00', overtimeEnd: '20:00', startDate: clockParts().date, workdays: [1, 2, 3, 4, 5], nickname: '', greeting: '今天也在一点点靠近想要的生活。', signature: '' },
      goals: [{ name: '银白色 iPhone 18 Pro', amount: 12000 }, { name: '下一站的心愿', amount: 5000 }],
      stage: 1, stageTwoStart: null, stageOneArchive: null,
      days: {},
      milestones: [
        { amount: 300, message: '第一枚小勋章到手，记得喝水。' },
        { amount: 600, message: '今天已经走了很远啦。' },
        { amount: 900, message: '再坚持一下，快到下班时间。' },
        { amount: 1100, message: '正常班通关！今晚好好休息。' }
      ],
      milestoneSeen: { date: '', amount: 0 }
    };
  }
  const baseDefaults = defaults();
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const minutes = value => /^\d{2}:\d{2}$/.test(value || '') ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
  const validTime = value => Number.isFinite(minutes(value)) && minutes(value) >= 0 && minutes(value) < 1440 && Number(value.slice(3)) < 60;
  const numberIn = (value, fallback, min, max) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;
  const plainText = (value, fallback, max) => typeof value === 'string' ? value.trim().slice(0, max) : fallback;
  function validSchedule(s) {
    return [s.startTime, s.breakStart, s.breakEnd, s.endTime, s.overtimeEnd].every(validTime) && minutes(s.startTime) < minutes(s.breakStart) && minutes(s.breakStart) < minutes(s.breakEnd) && minutes(s.breakEnd) < minutes(s.endTime) && minutes(s.endTime) < minutes(s.overtimeEnd);
  }
  function sanitizeDays(days) {
    const result = {};
    if (!days || typeof days !== 'object' || Array.isArray(days)) return result;
    for (const [date, value] of Object.entries(days)) {
      if (!validDate(date) || !value || typeof value !== 'object') continue;
      const item = {};
      if (value.status === 'work' || value.status === 'off') item.status = value.status;
      if (value.overtime === true && item.status !== 'off') item.overtime = true;
      if (Object.keys(item).length) result[date] = item;
    }
    return result;
  }
  function sanitizeSettings(source) {
    const d = baseDefaults.settings;
    const s = source || {};
    const result = {
      basePay: numberIn(s.basePay, d.basePay, 0, 1000000), overtimePay: numberIn(s.overtimePay, d.overtimePay, 0, 1000000),
      rate: numberIn(s.rate, d.rate, 0.000001, 100), rateCustomized: Boolean(s.rateCustomized),
      startTime: validTime(s.startTime) ? s.startTime : d.startTime, endTime: validTime(s.endTime) ? s.endTime : d.endTime,
      breakStart: validTime(s.breakStart) ? s.breakStart : d.breakStart, breakEnd: validTime(s.breakEnd) ? s.breakEnd : d.breakEnd,
      overtimeEnd: validTime(s.overtimeEnd) ? s.overtimeEnd : d.overtimeEnd, startDate: validDate(s.startDate) ? s.startDate : d.startDate,
      workdays: Array.isArray(s.workdays) ? [...new Set(s.workdays.filter(n => Number.isInteger(n) && n >= 0 && n <= 6))] : d.workdays,
      nickname: plainText(s.nickname, '', 20), greeting: plainText(s.greeting, d.greeting, 80) || d.greeting, signature: plainText(s.signature, '', 20)
    };
    if (!validSchedule(result)) throw new Error('备份里的工作时间顺序有误。');
    return result;
  }
  function sanitizeGoal(goal, fallback) {
    return { name: plainText(goal?.name, fallback.name, 50) || fallback.name, amount: numberIn(goal?.amount, fallback.amount, 0.01, 1000000000) };
  }
  function sanitizeState(source) {
    if (!source || typeof source !== 'object' || !source.settings) throw new Error('这不是有效的备份文件。');
    if (source.version === 1) {
      const migrated = defaults();
      migrated.settings = sanitizeSettings(source.settings);
      migrated.goals[0] = sanitizeGoal({ name: source.settings.goalName, amount: source.settings.goalAmount }, migrated.goals[0]);
      migrated.days = sanitizeDays(source.days);
      return migrated;
    }
    if (source.version !== 2 || !Array.isArray(source.goals) || source.goals.length < 2) throw new Error('备份版本无法识别。');
    const result = defaults();
    result.settings = sanitizeSettings(source.settings);
    result.goals = [sanitizeGoal(source.goals[0], result.goals[0]), sanitizeGoal(source.goals[1], result.goals[1])];
    result.days = sanitizeDays(source.days);
    if (Array.isArray(source.milestones)) {
      const list = source.milestones.slice(0, 8).map((x, i) => ({ amount: numberIn(x?.amount, baseDefaults.milestones[i]?.amount || (i + 1) * 300, 1, 1000000), message: plainText(x?.message, baseDefaults.milestones[i]?.message || '继续加油！', 80) })).filter(x => x.message);
      if (list.length) result.milestones = list.sort((a, b) => a.amount - b.amount);
    }
    if (source.stage === 2 && typeof source.stageTwoStart === 'string' && !Number.isNaN(Date.parse(source.stageTwoStart))) {
      result.stage = 2;
      result.stageTwoStart = source.stageTwoStart;
      if (source.stageOneArchive && typeof source.stageOneArchive === 'object') result.stageOneArchive = { purchasedAt: typeof source.stageOneArchive.purchasedAt === 'string' && !Number.isNaN(Date.parse(source.stageOneArchive.purchasedAt)) ? source.stageOneArchive.purchasedAt : source.stageTwoStart, earnedRmb: numberIn(source.stageOneArchive.earnedRmb, 0, 0, 100000000000), name: plainText(source.stageOneArchive.name, result.goals[0].name, 50), amount: numberIn(source.stageOneArchive.amount, result.goals[0].amount, 0.01, 1000000000) };
    }
    if (source.milestoneSeen && validDate(source.milestoneSeen.date)) result.milestoneSeen = { date: source.milestoneSeen.date, amount: numberIn(source.milestoneSeen.amount, 0, 0, 1000000) };
    return result;
  }
  function loadState() {
    try {
      const current = localStorage.getItem(KEY);
      if (current) return sanitizeState(JSON.parse(current));
      const old = localStorage.getItem(OLD_KEY);
      if (old) return sanitizeState(JSON.parse(old));
    } catch (_) { /* Keep the page usable if storage is unavailable. */ }
    return defaults();
  }

  let state = loadState();
  let selectedDate = clockParts().date;
  let calendarYear = Number(selectedDate.slice(0, 4));
  let calendarMonth = Number(selectedDate.slice(5, 7)) - 1;
  let historyCache = { date: '', hkd: 0, days: 0 };
  let baselineCache = { key: '', hkd: 0 };
  let toastTimer;
  let milestoneTimer;
  let previousTickDate = clockParts().date;
  let lastCoinSecond = -1;

  function saveState(invalidate = true) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (_) { showToast('浏览器无法保存，请导出备份。'); }
    if (invalidate) { historyCache.date = ''; baselineCache.key = ''; }
  }
  function showToast(text) {
    const box = $('toast'); box.textContent = text; box.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => box.classList.remove('show'), 3200);
  }
  function dateFromKey(key) { return new Date(`${key}T00:00:00Z`); }
  function keyFromDate(date) { return date.toISOString().slice(0, 10); }
  function nextDate(key) { const d = dateFromKey(key); d.setUTCDate(d.getUTCDate() + 1); return keyFromDate(d); }
  function dayOfWeek(key) { return dateFromKey(key).getUTCDay(); }
  function readableDate(key) { const [y, m, d] = key.split('-').map(Number); return `${y}年${m}月${d}日`; }
  function isWorkday(key) {
    const override = state.days[key]?.status;
    if (override === 'work') return true;
    if (override === 'off') return false;
    return state.settings.workdays.includes(dayOfWeek(key));
  }
  function hasOvertime(key) { return isWorkday(key) && state.days[key]?.overtime === true; }
  function schedule() {
    const s = state.settings;
    return { start: minutes(s.startTime) * 60, breakStart: minutes(s.breakStart) * 60, breakEnd: minutes(s.breakEnd) * 60, end: minutes(s.endTime) * 60, overtimeEnd: minutes(s.overtimeEnd) * 60 };
  }
  function elapsed(now, start, end) { return Math.max(0, Math.min(now, end) - start); }
  function earningsAt(date, seconds) {
    if (date < state.settings.startDate || !isWorkday(date)) return { hkd: 0, paidSeconds: 0, possibleSeconds: 0 };
    const t = schedule();
    const baseSeconds = t.breakStart - t.start + t.end - t.breakEnd;
    const paidBase = elapsed(seconds, t.start, t.breakStart) + elapsed(seconds, t.breakEnd, t.end);
    const overtime = hasOvertime(date);
    const overtimeSeconds = overtime ? t.overtimeEnd - t.end : 0;
    const paidExtra = overtime ? elapsed(seconds, t.end, t.overtimeEnd) : 0;
    return { hkd: state.settings.basePay * paidBase / baseSeconds + (overtime ? state.settings.overtimePay * paidExtra / overtimeSeconds : 0), paidSeconds: paidBase + paidExtra, possibleSeconds: baseSeconds + overtimeSeconds };
  }
  function fullDaysBefore(date) {
    if (historyCache.date === date) return historyCache;
    let hkdTotal = 0, days = 0;
    if (state.settings.startDate < date) for (let key = state.settings.startDate; key < date; key = nextDate(key)) if (isWorkday(key)) { hkdTotal += state.settings.basePay + (hasOvertime(key) ? state.settings.overtimePay : 0); days++; }
    historyCache = { date, hkd: hkdTotal, days };
    return historyCache;
  }
  function totalAt(parts) { return fullDaysBefore(parts.date).hkd + earningsAt(parts.date, parts.seconds).hkd; }
  function stageTwoBaseline() {
    if (state.stage !== 2 || !state.stageTwoStart) return 0;
    const key = `${state.stageTwoStart}|${state.settings.basePay}|${state.settings.overtimePay}|${state.settings.startDate}|${state.settings.workdays.join(',')}|${Object.keys(state.days).length}`;
    if (baselineCache.key === key) return baselineCache.hkd;
    const value = totalAt(clockParts(new Date(state.stageTwoStart)));
    baselineCache = { key, hkd: value };
    return value;
  }

  function activePaying(now) {
    if (now.date < state.settings.startDate || !isWorkday(now.date)) return false;
    const t = schedule(), s = now.seconds;
    return s >= t.start && s < t.breakStart || s >= t.breakEnd && s < t.end || hasOvertime(now.date) && s >= t.end && s < t.overtimeEnd;
  }
  function renderCountdown(now) {
    const t = schedule();
    if (now.date < state.settings.startDate || !isWorkday(now.date)) {
      $('countdownLabel').textContent = '今天休息'; $('countdownValue').textContent = '☀'; $('countdownEnd').textContent = '下一次上班，再继续累计'; return;
    }
    if (now.seconds < t.start) {
      $('countdownLabel').textContent = '距离上班'; $('countdownValue').textContent = formatClock(t.start - now.seconds); $('countdownEnd').textContent = `${state.settings.startTime} 开始`; return;
    }
    const end = hasOvertime(now.date) ? t.overtimeEnd : t.end;
    if (now.seconds >= end) {
      $('countdownLabel').textContent = '今日已下班'; $('countdownValue').textContent = '00:00:00'; $('countdownEnd').textContent = '辛苦啦，收工！'; return;
    }
    $('countdownLabel').textContent = '距离下班'; $('countdownValue').textContent = formatClock(end - now.seconds); $('countdownEnd').textContent = `今天 ${hasOvertime(now.date) ? state.settings.overtimeEnd : state.settings.endTime} 下班`;
  }
  function renderLive() {
    const now = clockParts();
    const today = earningsAt(now.date, now.seconds);
    const prior = fullDaysBefore(now.date);
    const total = prior.hkd + today.hkd;
    const goal = state.goals[state.stage - 1];
    const stageHkd = Math.max(0, state.stage === 1 ? total : total - stageTwoBaseline());
    const stageRmb = stageHkd * state.settings.rate;
    const remaining = Math.max(0, goal.amount - stageRmb);
    const percent = Math.min(100, stageRmb / goal.amount * 100);
    const t = schedule();
    const works = now.date >= state.settings.startDate && isWorkday(now.date);
    $('clockLabel').textContent = `北京时间 ${now.display}`;
    const todayText = money.format(today.hkd);
    $('todayHkd').textContent = todayText;
    $('todayHkd').classList.toggle('compact-amount', todayText.length >= 8);
    $('todayHkd').classList.toggle('very-compact-amount', todayText.length >= 10);
    $('todayRmb').textContent = rmb(today.hkd * state.settings.rate);
    $('rateNote').textContent = state.settings.rateCustomized ? `1 港币 = ${state.settings.rate} 元` : `演示汇率 ${state.settings.rate}`;
    $('totalHkd').textContent = hkd(total);
    $('totalRmb').textContent = rmb(total * state.settings.rate);
    $('totalDays').textContent = `${readableDate(state.settings.startDate)}起 · ${prior.days + (works ? 1 : 0)} 个工作日`;
    $('workPercent').textContent = `${today.possibleSeconds ? Math.round(today.paidSeconds / today.possibleSeconds * 100) : 0}%`;
    const paidLeft = Math.max(0, Math.ceil((today.possibleSeconds - today.paidSeconds) / 60));
    $('workTimeLeft').textContent = !works ? '今天未安排工作' : paidLeft === 0 ? '今日计薪已结束' : `剩余计薪 ${Math.floor(paidLeft / 60)} 小时 ${paidLeft % 60} 分钟`;
    $('todayDate').textContent = `${Number(now.date.slice(5, 7))}月${Number(now.date.slice(8))}日 · 星期${dayNames[dayOfWeek(now.date)]}`;
    let status = '今天休息';
    if (now.date < state.settings.startDate) status = '尚未到累计开始日期';
    else if (works && now.seconds < t.start) status = '尚未上班';
    else if (works && now.seconds >= t.breakStart && now.seconds < t.breakEnd) status = '午休中';
    else if (works && activePaying(now)) status = now.seconds >= t.end ? '加班赚钱中' : '正在赚钱中';
    else if (works) status = '今天已下班';
    $('earningStatus').textContent = status;
    renderCountdown(now);
    $('currentGoalName').textContent = goal.name;
    $('goalTarget').textContent = rmbRounded(goal.amount);
    $('goalRemaining').textContent = rmbRounded(remaining);
    $('goalPercent').textContent = `${percent.toFixed(1)}%`;
    $('goalProgress').setAttribute('aria-valuenow', percent.toFixed(1));
    $('progressFill').style.width = `${percent}%`;
    $('progressCaption').textContent = `本阶段已赚 ${rmb(stageRmb)} · 工资估算，不扣除支出`;
    $('heroGoalName').textContent = goal.name;
    $('heroGoalPercent').textContent = `${percent.toFixed(1)}%`;
    $('heroGoalProgress').setAttribute('aria-valuenow', percent.toFixed(1));
    $('heroGoalFill').style.width = `${percent}%`;
    $('heroGoalRemaining').textContent = remaining <= 0 ? '已经达到目标金额' : `距离买到还差 ${rmbRounded(remaining)}`;
    $('todayOvertime').disabled = !works;
    $('todayOvertime').checked = hasOvertime(now.date);
    $('overtimeHint').textContent = works ? '开启后，加班费会逐秒累计' : '今天不是工作日，可在日历补记上班';
    if (selectedDate === now.date) updateSelectedEditor();
    maybeShowMilestone(now, today.hkd);
    if (activePaying(now) && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches && now.seconds !== lastCoinSecond) { lastCoinSecond = now.seconds; sprinkle(2); }
  }
  function renderStatic() {
    const s = state.settings;
    $('heroFor').textContent = s.nickname ? `给${s.nickname}的赚钱小站` : '给你的赚钱小站';
    $('heroGreeting').textContent = s.greeting;
    $('goalTitle').textContent = s.nickname ? `${s.nickname}的两站心愿` : '我的两站心愿';
    $('signatureText').textContent = s.signature ? `来自 ${s.signature}` : '只属于你的赚钱小站';
    $('stageOneName').textContent = state.goals[0].name;
    $('stageTwoName').textContent = state.goals[1].name;
    $('stageOneNode').className = `stage-node ${state.stage === 1 ? 'active' : 'done'}`;
    $('stageTwoNode').className = `stage-node ${state.stage === 2 ? 'active' : ''}`;
    $('stageOneState').textContent = state.stage === 1 ? '正在努力' : '已买到';
    $('stageTwoState').textContent = state.stage === 1 ? '等待开启' : '正在努力';
    $('stageArchive').hidden = state.stage !== 2 || !state.stageOneArchive;
    if (state.stage === 2 && state.stageOneArchive) {
      const archived = state.stageOneArchive;
      const purchaseDate = clockParts(new Date(archived.purchasedAt)).date;
      $('stageArchive').textContent = `第 1 站「${archived.name}」已于 ${readableDate(purchaseDate)} 买到 · 完成时累计 ${rmb(archived.earnedRmb)}`;
    }
    $('goalStageChip').textContent = `第 ${state.stage} 站`;
    $('goalEyebrow').textContent = `当前目标 · 第 ${state.stage} 站`;
    $('completeStage').hidden = state.stage !== 1;
    $('goalActionHint').hidden = state.stage !== 1;
    $('startTimeText').textContent = s.startTime;
    $('breakTimeText').textContent = `${s.breakStart} – ${s.breakEnd}`;
    $('endTimeText').textContent = s.endTime;
    $('overtimeTimeText').textContent = `${s.endTime} – ${s.overtimeEnd}`;
    renderCalendar(); renderLive();
  }

  function renderCalendar() {
    $('calendarMonth').textContent = `${calendarYear}年${calendarMonth + 1}月`;
    const grid = $('calendarGrid'); grid.replaceChildren();
    const first = new Date(Date.UTC(calendarYear, calendarMonth, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const start = new Date(Date.UTC(calendarYear, calendarMonth, 1 - offset));
    const today = clockParts().date;
    for (let i = 0; i < 42; i++) {
      const date = new Date(start); date.setUTCDate(start.getUTCDate() + i);
      const key = keyFromDate(date);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'calendar-day'; button.textContent = String(date.getUTCDate());
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', `${readableDate(key)}，${isWorkday(key) ? hasOvertime(key) ? '加班日' : '工作日' : '休息日'}`);
      button.setAttribute('aria-selected', String(key === selectedDate));
      if (date.getUTCMonth() !== calendarMonth) button.classList.add('is-outside');
      if (key < state.settings.startDate) button.classList.add('is-before-start');
      if (isWorkday(key)) button.classList.add('is-work'); else button.classList.add('is-off');
      if (hasOvertime(key)) button.classList.add('is-overtime');
      if (key === selectedDate) button.classList.add('is-selected');
      if (key === today) button.classList.add('is-today');
      button.addEventListener('click', () => { selectedDate = key; if (date.getUTCMonth() !== calendarMonth) { calendarYear = date.getUTCFullYear(); calendarMonth = date.getUTCMonth(); } renderCalendar(); });
      grid.appendChild(button);
    }
    updateSelectedEditor();
  }
  function updateSelectedEditor() {
    const entry = state.days[selectedDate] || {};
    const today = clockParts();
    $('selectedDateLabel').textContent = `${readableDate(selectedDate)} · 星期${dayNames[dayOfWeek(selectedDate)]}`;
    $('selectedDateInfo').textContent = selectedDate < state.settings.startDate ? '早于开始日期，不计入收入' : selectedDate > today.date ? '可提前安排上班或加班' : selectedDate === today.date ? `${hkd(earningsAt(selectedDate, today.seconds).hkd)} · 今天已赚` : isWorkday(selectedDate) ? `${hkd(state.settings.basePay + (hasOvertime(selectedDate) ? state.settings.overtimePay : 0))} · 当日估算` : '休息日，不计入收入';
    $('dayStatus').value = entry.status || 'default';
    $('dayOvertime').checked = hasOvertime(selectedDate);
    $('dayOvertime').disabled = !isWorkday(selectedDate);
  }
  function updateDay(patch) {
    const item = { ...(state.days[selectedDate] || {}), ...patch };
    if (!item.status) delete item.status;
    if (!item.overtime || item.status === 'off') delete item.overtime;
    if (Object.keys(item).length) state.days[selectedDate] = item; else delete state.days[selectedDate];
    saveState(); renderCalendar(); renderLive();
  }

  function sprinkle(count = 12) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const field = $('coinRain');
    const room = Math.max(0, 32 - field.childElementCount);
    for (let i = 0; i < Math.min(count, room); i++) {
      const coin = document.createElement('span'); coin.className = 'fall-coin'; coin.textContent = '¥';
      coin.style.setProperty('--x', `${window.innerWidth <= 760 ? 79 + Math.random() * 14 : 4 + Math.random() * 50}%`);
      coin.style.setProperty('--duration', `${2.1 + Math.random() * 1.3}s`);
      coin.style.setProperty('--delay', `${Math.random() * .5}s`);
      coin.style.setProperty('--spin', `${(Math.random() - .5) * 900}deg`);
      coin.style.setProperty('--distance', `${$('coinRain').clientHeight + 55}px`);
      field.appendChild(coin); coin.addEventListener('animationend', () => coin.remove(), { once: true });
    }
  }
  function maybeShowMilestone(now, todayHkd) {
    if (now.date < state.settings.startDate || !isWorkday(now.date)) return;
    const reached = state.milestones.filter(x => todayHkd >= x.amount).at(-1);
    if (!reached) return;
    const seen = state.milestoneSeen;
    if (seen.date === now.date && seen.amount >= reached.amount) return;
    state.milestoneSeen = { date: now.date, amount: reached.amount };
    saveState(false);
    $('milestoneTitle').textContent = `今天赚到 ${hkd(reached.amount)} 啦`;
    $('milestoneMessage').textContent = reached.message;
    $('milestoneToast').hidden = false;
    clearTimeout(milestoneTimer); milestoneTimer = setTimeout(() => $('milestoneToast').hidden = true, 6800);
    sprinkle(12);
  }

  function fillSettings() {
    const form = $('settingsForm');
    for (const [key, value] of Object.entries(state.settings)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value;
    form.elements.namedItem('goalOneName').value = state.goals[0].name;
    form.elements.namedItem('goalOneAmount').value = state.goals[0].amount;
    form.elements.namedItem('goalTwoName').value = state.goals[1].name;
    form.elements.namedItem('goalTwoAmount').value = state.goals[1].amount;
    form.elements.namedItem('goalOneName').disabled = state.stage === 2;
    form.elements.namedItem('goalOneAmount').disabled = state.stage === 2;
    $('stageSettingsNote').textContent = state.stage === 2 ? '第 1 站已完成并归档；你仍可以修改第 2 站的名称和金额。' : '买到第 1 站的心愿后，手动开启第 2 站，进度从零开始。';
    $('weekdaySettings').replaceChildren();
    for (let d = 1; d <= 7; d++) {
      const n = d === 7 ? 0 : d, label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.name = 'workday'; input.value = String(n); input.checked = state.settings.workdays.includes(n);
      label.append(input, document.createTextNode(`周${dayNames[n]}`)); $('weekdaySettings').appendChild(label);
    }
    $('milestoneSettings').replaceChildren();
    state.milestones.forEach((item, i) => {
      const row = document.createElement('div'); row.className = 'milestone-row';
      const amountLabel = document.createElement('label'), messageLabel = document.createElement('label');
      amountLabel.textContent = '金额 · 港币'; messageLabel.textContent = '鼓励文案';
      const amount = document.createElement('input'), message = document.createElement('input');
      amount.type = 'number'; amount.min = '1'; amount.max = '1000000'; amount.step = '1'; amount.name = `milestoneAmount${i}`; amount.value = String(item.amount); amount.required = true;
      message.type = 'text'; message.maxLength = 80; message.name = `milestoneMessage${i}`; message.value = item.message; message.required = true;
      amountLabel.appendChild(amount); messageLabel.appendChild(message); row.append(amountLabel, messageLabel); $('milestoneSettings').appendChild(row);
    });
    $('formError').hidden = true;
  }
  let lastFocus = null;
  function openSettings(trigger) { lastFocus = trigger; fillSettings(); $('settingsBackdrop').hidden = false; document.body.style.overflow = 'hidden'; $('closeSettings').focus(); }
  function closeSettings() { $('settingsBackdrop').hidden = true; document.body.style.overflow = ''; lastFocus?.focus(); }
  function showFormError(message) { $('formError').textContent = message; $('formError').hidden = false; $('formError').scrollIntoView({ block: 'nearest' }); }
  function saveSettings(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const settings = {
      basePay: Number(data.get('basePay')), overtimePay: Number(data.get('overtimePay')), rate: Number(data.get('rate')), rateCustomized: true,
      startTime: String(data.get('startTime')), endTime: String(data.get('endTime')), breakStart: String(data.get('breakStart')), breakEnd: String(data.get('breakEnd')), overtimeEnd: String(data.get('overtimeEnd')),
      startDate: String(data.get('startDate')), workdays: data.getAll('workday').map(Number),
      nickname: String(data.get('nickname') || '').trim(), greeting: String(data.get('greeting') || '').trim() || baseDefaults.settings.greeting, signature: String(data.get('signature') || '').trim()
    };
    const goalOne = state.stage === 2 ? state.goals[0] : { name: String(data.get('goalOneName') || '').trim(), amount: Number(data.get('goalOneAmount')) };
    const goalTwo = { name: String(data.get('goalTwoName') || '').trim(), amount: Number(data.get('goalTwoAmount')) };
    const milestones = state.milestones.map((_, i) => ({ amount: Number(data.get(`milestoneAmount${i}`)), message: String(data.get(`milestoneMessage${i}`) || '').trim() }));
    if (![settings.basePay, settings.overtimePay, settings.rate].every(Number.isFinite) || settings.basePay < 0 || settings.overtimePay < 0 || settings.rate <= 0) return showFormError('请填写有效的工资和汇率。');
    if (!validSchedule(settings)) return showFormError('时间顺序应为：上班、午休开始、午休结束、正常下班、加班结束。');
    if (!validDate(settings.startDate) || !settings.workdays.length) return showFormError('请设置有效的开始日期和至少一个每周上班日。');
    if (![goalOne, goalTwo].every(x => x.name && Number.isFinite(x.amount) && x.amount > 0)) return showFormError('请填写两站心愿的名称和金额。');
    if (milestones.some(x => !Number.isInteger(x.amount) || x.amount < 1 || !x.message) || new Set(milestones.map(x => x.amount)).size !== milestones.length) return showFormError('奖励金额需为不同的正整数，并填写对应文案。');
    state.settings = settings; state.goals = [goalOne, goalTwo]; state.milestones = milestones.sort((a, b) => a.amount - b.amount);
    saveState(); renderStatic(); closeSettings(); showToast('设置已保存。');
  }
  function openStageConfirm() { $('confirmBackdrop').hidden = false; document.body.style.overflow = 'hidden'; $('cancelStage').focus(); }
  function closeStageConfirm() { $('confirmBackdrop').hidden = true; document.body.style.overflow = ''; $('completeStage').focus(); }
  function completeStage() {
    if (state.stage !== 1) return;
    const now = new Date(), earned = totalAt(clockParts(now)) * state.settings.rate;
    state.stageOneArchive = { purchasedAt: now.toISOString(), earnedRmb: earned, name: state.goals[0].name, amount: state.goals[0].amount };
    state.stageTwoStart = now.toISOString(); state.stage = 2;
    saveState(); closeStageConfirm(); renderStatic(); sprinkle(25); showToast('第 2 站已开启，从 ¥0 开始！');
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `自在赚钱可视化备份_${clockParts().date}.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); showToast('备份已导出。');
  }
  async function importData(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2000000) throw new Error('备份文件过大，请检查文件。');
      const imported = sanitizeState(JSON.parse(await file.text()));
      state = imported; selectedDate = clockParts().date; calendarYear = Number(selectedDate.slice(0, 4)); calendarMonth = Number(selectedDate.slice(5, 7)) - 1;
      saveState(); fillSettings(); renderStatic(); showToast('备份已导入，记录已恢复。');
    } catch (error) { showToast(error.message || '导入失败，请检查文件。'); }
  }

  $('openSettings').addEventListener('click', e => openSettings(e.currentTarget));
  $('closeSettings').addEventListener('click', closeSettings);
  $('cancelSettings').addEventListener('click', closeSettings);
  $('settingsBackdrop').addEventListener('click', e => { if (e.target === $('settingsBackdrop')) closeSettings(); });
  $('settingsForm').addEventListener('submit', saveSettings);
  $('coinButton').addEventListener('click', () => sprinkle(22));
  $('todayOvertime').addEventListener('change', e => { selectedDate = clockParts().date; updateDay({ overtime: e.target.checked }); showToast(e.target.checked ? '今天加班已开启。' : '今天加班已关闭。'); });
  $('dayStatus').addEventListener('change', e => updateDay({ status: e.target.value === 'default' ? undefined : e.target.value }));
  $('dayOvertime').addEventListener('change', e => updateDay({ overtime: e.target.checked }));
  $('prevMonth').addEventListener('click', () => { calendarMonth--; if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; } renderCalendar(); });
  $('nextMonth').addEventListener('click', () => { calendarMonth++; if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; } renderCalendar(); });
  $('completeStage').addEventListener('click', openStageConfirm);
  $('cancelStage').addEventListener('click', closeStageConfirm);
  $('confirmStage').addEventListener('click', completeStage);
  $('confirmBackdrop').addEventListener('click', e => { if (e.target === $('confirmBackdrop')) closeStageConfirm(); });
  $('exportData').addEventListener('click', exportData);
  $('importData').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', importData);
  $('closeMilestone').addEventListener('click', () => { $('milestoneToast').hidden = true; clearTimeout(milestoneTimer); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('confirmBackdrop').hidden) closeStageConfirm(); else if (!$('settingsBackdrop').hidden) closeSettings(); } });
  // Persist the first-visit start date even if the page closes before any setting changes.
  saveState();
  renderStatic();
  setInterval(() => {
    const now = clockParts();
    if (now.date !== previousTickDate) { previousTickDate = now.date; selectedDate = now.date; calendarYear = Number(now.date.slice(0, 4)); calendarMonth = Number(now.date.slice(5, 7)) - 1; historyCache.date = ''; renderCalendar(); }
    renderLive();
  }, 1000);
})();
