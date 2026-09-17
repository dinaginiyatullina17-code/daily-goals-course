const PAGES = ['home', 'intro', 'goals', 'smart', 'understanding', 'control', 'finish', 'summary'];
const CHAPTER_ORDER = ['intro', 'goals', 'smart', 'understanding', 'control', 'finish', 'summary'];
const CHAPTER_NAMES = {
  home: '',
  intro: 'Введение',
  goals: 'Цели на смену',
  smart: 'Цели по SMART',
  understanding: 'Проверка понимания',
  control: 'Управление в течение смены',
  finish: 'Завершение смены',
  summary: 'Главное по теме'
};

const PROGRESS_KEY = 'daily_goals_course_progress_v9';
const PROGRESS_VERSION = 9;
let currentPage = 'home';
let unlockedChapters = 1;
let fadeObserver;

function navigateTo(pageId) {
  const target = document.getElementById(`page-${pageId}`);
  if (!target) return;
  const requestedChapter = CHAPTER_ORDER.indexOf(pageId);
  const currentChapter = CHAPTER_ORDER.indexOf(currentPage);
  if (requestedChapter > currentChapter && currentChapter >= 0 && !hasAnsweredChapterTests(currentPage)) {
    showTestRequiredHint(currentPage);
    return;
  }
  if (requestedChapter >= unlockedChapters) return;

  PAGES.forEach(id => document.getElementById(`page-${id}`)?.classList.remove('active'));
  target.classList.add('active');
  currentPage = pageId;
  if (pageId === 'smart') resetSmartMatching();
  window.scrollTo({ top: 0, behavior: 'instant' });

  const chapterIndex = requestedChapter;
  document.getElementById('nav-chapter').textContent = CHAPTER_NAMES[pageId] || '';
  document.getElementById('nav-progress').textContent = chapterIndex >= 0 ? `${chapterIndex + 1} / ${CHAPTER_ORDER.length}` : '';
  document.getElementById('progress-bar').style.width = chapterIndex >= 0 ? `${Math.round((chapterIndex + 1) / CHAPTER_ORDER.length * 100)}%` : '0%';

  applyHomeLocks();
  setTimeout(initFadeIn, 30);
}

function resetCourseInteractions() {
  document.querySelectorAll('.choice-grid, .choice-list').forEach(group => {
    delete group.dataset.answered;
    delete group.dataset.solved;
    group.querySelectorAll('button').forEach(button => {
      button.disabled = false;
      button.classList.remove('correct', 'wrong');
    });
  });
  document.querySelectorAll('.feedback-box, .reflection-feedback').forEach(feedback => {
    feedback.className = feedback.id === 'reflection-feedback' ? 'reflection-feedback' : 'feedback-box';
    feedback.textContent = '';
  });
  document.querySelectorAll('.understanding-checklist input').forEach(input => { input.checked = false; });
  document.querySelectorAll('.reason-card').forEach(card => {
    card.classList.remove('open');
    card.querySelector('button')?.setAttribute('aria-expanded', 'false');
  });
  document.querySelectorAll('.question-guidance').forEach(details => { details.open = false; });
  document.getElementById('completion-panel')?.classList.remove('show');
  resetSmartMatching();
}

function startCourse() {
  unlockedChapters = 1;
  resetCourseInteractions();
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(`${PROGRESS_KEY}_completed`);
  } catch (error) {}
  if (window.SCORM && typeof SCORM.set === 'function') {
    try {
      SCORM.set('cmi.suspend_data', '');
      SCORM.set('cmi.core.lesson_status', 'incomplete');
      SCORM.commit?.();
    } catch (error) {}
  }
  applyHomeLocks();
  navigateTo('intro');
}

function completeChapter(completedPageId, nextPageId) {
  const completedIndex = CHAPTER_ORDER.indexOf(completedPageId);
  if (completedIndex < 0 || currentPage !== completedPageId || completedIndex >= unlockedChapters) return;
  if (!hasAnsweredChapterTests(completedPageId)) {
    showTestRequiredHint(completedPageId);
    return;
  }

  unlockedChapters = Math.max(unlockedChapters, Math.min(completedIndex + 2, CHAPTER_ORDER.length));
  saveProgress();
  navigateTo(nextPageId);
}

function hasAnsweredChapterTests(pageId) {
  const page = document.getElementById(`page-${pageId}`);
  if (!page) return true;

  const choiceGroups = [...page.querySelectorAll('.choice-grid, .choice-list')];
  if (choiceGroups.some(group => group.dataset.answered !== 'true')) return false;

  const smartSelects = [...page.querySelectorAll('#smart-matching select')];
  return smartSelects.every(select => Boolean(select.value));
}

function showTestRequiredHint(pageId) {
  const page = document.getElementById(`page-${pageId}`);
  const nextRow = page?.querySelector('.next-row');
  if (!nextRow) return;

  let hint = nextRow.querySelector('.course-gate-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.className = 'course-gate-hint';
    hint.setAttribute('role', 'status');
    nextRow.prepend(hint);
  }
  hint.textContent = 'Сначала пройди тест выше.';
  hint.classList.add('show');
}
function initFadeIn() {
  fadeObserver?.disconnect();
  const elements = document.querySelectorAll('.page.active .fade-in:not(.visible)');
  if (!('IntersectionObserver' in window)) {
    elements.forEach(element => element.classList.add('visible'));
    return;
  }
  fadeObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -30px' });
  elements.forEach(element => {
    if (element.getBoundingClientRect().top < window.innerHeight) element.classList.add('visible');
    else fadeObserver.observe(element);
  });
}

function applyHomeLocks() {
  CHAPTER_ORDER.forEach((chapter, index) => {
    const isLocked = index >= unlockedChapters;
    [`home-card-${index + 1}`, `route-card-${index + 1}`].forEach(id => {
      const card = document.getElementById(id);
      if (!card) return;
      card.classList.toggle('locked', isLocked);
      card.disabled = isLocked;
      card.setAttribute('aria-disabled', String(isLocked));
      card.tabIndex = isLocked ? -1 : 0;
    });
  });
}

function saveProgress() {
  const state = JSON.stringify({ version: PROGRESS_VERSION, unlocked: unlockedChapters, page: currentPage });
  try { localStorage.setItem(PROGRESS_KEY, state); } catch (error) {}
  if (window.SCORM && typeof SCORM.set === 'function') {
    try {
      SCORM.set('cmi.suspend_data', state);
      const status = SCORM.get?.('cmi.core.lesson_status');
      if (!status || status === 'not attempted' || status === 'unknown') SCORM.set('cmi.core.lesson_status', 'incomplete');
      SCORM.commit?.();
    } catch (error) {}
  }
}

function loadProgress() {
  unlockedChapters = 1;
  applyHomeLocks();
}

function answerChoice(button, isCorrect, feedbackId) {
  const feedback = document.getElementById(feedbackId);
  const group = button.closest('.choice-grid, .choice-list');
  if (!feedback || !group || group.dataset.solved === 'true') return;
  group.dataset.answered = 'true';

  const caseFeedback = {
    'case-feedback-1': {
      correct: '<strong>Верно.</strong> 250 − 95 = 155 порций — это остаток цели для вечерней смены.',
      incorrect: '<strong>Посчитай остаток.</strong> Из общей цели 250 вычти 95 порций, которые уже продали утром.'
    },
    'case-feedback-2': {
      correct: '<strong>Верно.</strong> 350 000 − 148 000 = 202 000 рублей — столько нужно заработать вечером.',
      incorrect: '<strong>Посчитай остаток.</strong> Из общей цели по товарообороту вычти утренний результат.'
    },
    'case-feedback-3': {
      correct: '<strong>Верно.</strong> Нулевая цель по негативным отзывам сохраняется на протяжении всей смены.',
      incorrect: '<strong>Вспомни общую цель.</strong> Если утром негативных отзывов не было, вечерняя смена должна сохранить этот результат.'
    }
  };
  const copy = caseFeedback[feedbackId];

  if (isCorrect) {
    button.classList.add('correct');
    group.dataset.solved = 'true';
    group.querySelectorAll('button').forEach(item => item.disabled = true);
    feedback.className = 'feedback-box show correct';
    feedback.innerHTML = copy?.correct || (feedbackId === 'calc-feedback'
      ? '<strong>Верно.</strong> 150 000 × 20 / 100 = 30 000 рублей за смену.'
      : '<strong>Верно.</strong> Сначала проверь понимание цели и найди причину отклонения. Только после этого выбирай действие, которое поможет кассиру вернуться к плану.');
  } else {
    button.classList.add('wrong');
    feedback.className = 'feedback-box show incorrect';
    feedback.innerHTML = copy?.incorrect || (feedbackId === 'calc-feedback'
      ? '<strong>Пока нет.</strong> Найди 20% от 150 000: умножь сумму на 20 и раздели на 100.'
      : '<strong>Попробуй ещё раз.</strong> Задача контроля — вовремя помочь, а не наказать или отложить проблему до конца смены.');
    setTimeout(() => button.classList.remove('wrong'), 650);
  }
}

const SMART_DETAILS = [
  ['S · Specific', 'Цель называет конкретный результат и не оставляет места разным трактовкам.'],
  ['M · Measurable', 'У результата есть число или другой показатель, по которому можно проверить выполнение.'],
  ['A · Achievable', 'Цель амбициозна, но учитывает опыт и реальные возможности конкретного сотрудника.'],
  ['R · Relevant', 'Индивидуальная цель сотрудника помогает выполнить общую цель ресторана.'],
  ['T · Time-bound', 'У цели есть понятный срок или временной интервал.']
];

function selectSmart(button, index) {
  document.querySelectorAll('.smart-card').forEach(card => card.classList.remove('active'));
  button.classList.add('active');
  const [title, text] = SMART_DETAILS[index];
  document.getElementById('smart-detail').innerHTML = `<span>${title}</span><p>${text}</p>`;
}

function toggleSmartBreakdown() {
  const panel = document.getElementById('smart-breakdown');
  const button = document.querySelector('.smart-reveal-btn');
  if (!panel || !button) return;
  const isOpen = panel.classList.toggle('smart-breakdown-open');
  panel.classList.toggle('visible', isOpen);
  button.classList.toggle('active', isOpen);
  button.innerHTML = isOpen ? 'Скрыть разбор SMART <span>−</span>' : 'Разобрать эту цель по SMART <span>＋</span>';
  if (isOpen) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function shuffleInPlace(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function shuffleSmartMatching() {
  const container = document.getElementById('smart-matching');
  if (!container) return;

  const rows = shuffleInPlace([...container.children]);
  rows.forEach(row => {
    const select = row.querySelector('select');
    const placeholder = select?.querySelector('option[value=""]');
    if (!select || !placeholder) return;

    const criteria = shuffleInPlace([...select.options].filter(option => option.value));
    select.replaceChildren(placeholder, ...criteria);
  });
  container.replaceChildren(...rows);
}

function resetSmartMatching() {
  const selects = [...document.querySelectorAll('#smart-matching select')];
  const feedback = document.getElementById('smart-feedback');

  selects.forEach(select => {
    select.value = '';
    select.selectedIndex = 0;
    select.disabled = false;
    select.classList.remove('correct', 'wrong');
  });
  if (feedback) {
    feedback.className = 'feedback-box';
    feedback.textContent = '';
  }
}

function checkSmartMatching() {

  const selects = [...document.querySelectorAll('#smart-matching select')];
  const feedback = document.getElementById('smart-feedback');
  const unanswered = selects.filter(select => !select.value);

  selects.forEach(select => {
    select.classList.remove('correct', 'wrong');
    if (select.value) select.classList.add(select.value === select.dataset.answer ? 'correct' : 'wrong');
  });

  if (unanswered.length) {
    feedback.className = 'feedback-box show incorrect';
    feedback.innerHTML = `<strong>Выбери критерий для каждого примера.</strong> Осталось: ${unanswered.length}.`;
    unanswered[0].focus();
    return;
  }

  const wrong = selects.filter(select => select.value !== select.dataset.answer);
  if (wrong.length) {
    feedback.className = 'feedback-box show incorrect';
    feedback.innerHTML = `<strong>Пока не всё совпало.</strong> Проверь выделенные соответствия: ${wrong.length}. Подумай, что именно показывает каждый пример — результат, число, достижимость, связь с общей целью или срок.`;
    wrong[0].focus();
    return;
  }

  selects.forEach(select => select.disabled = true);
  feedback.className = 'feedback-box show correct';
  feedback.innerHTML = '<strong>Верно: все пять частей цели на своих местах.</strong> Вместе они образуют понятную SMART-цель: что продаём, сколько, почему результат достижим, зачем он нужен ресторану и к какому сроку.';
}

function toggleReason(button) {
  const card = button.closest('.reason-card');
  const isOpen = card.classList.toggle('open');
  button.setAttribute('aria-expanded', String(isOpen));
}

function answerReflection(answer) {
  const feedback = document.getElementById('reflection-feedback');
  feedback.classList.add('show');
  feedback.innerHTML = answer === 'no'
    ? '<strong>Именно так мыслит тот, кто управляет сменой и результатом.</strong><br>А теперь представь, что ты скажешь: «Если моя команда не достигла целей — значит, я где-то недодал обратную связь, не скорректировал работу вовремя или плохо поставил задачу».'
    : '<strong>Ответственность сотрудника важна, но тот, кто управляет сменой, влияет на условия выполнения.</strong><br>А теперь представь, что ты скажешь: «Если моя команда не достигла целей — значит, я где-то недодал обратную связь, не скорректировал работу вовремя или плохо поставил задачу».';
}

function initMadinaAudio() {
  const audio = document.getElementById('madina-audio');
  const button = document.getElementById('madina-audio-toggle');
  if (!audio || !button) return;

  const resetButton = () => {
    button.textContent = '▶ Прослушать пример';
    button.setAttribute('aria-pressed', 'false');
  };

  button.addEventListener('click', () => {
    if (!audio.paused) {
      audio.pause();
      resetButton();
      return;
    }

    audio.play().then(() => {
      button.textContent = '❚❚ Остановить аудио';
      button.setAttribute('aria-pressed', 'true');
    }).catch(resetButton);
  });

  audio.addEventListener('ended', resetButton);
}

function printChecklist() {
  const previousPage = currentPage;
  navigateTo('understanding');
  setTimeout(() => {
    window.print();
    if (previousPage !== 'understanding') navigateTo(previousPage);
  }, 150);
}

function requestCourseWindowClose() {
  const closeMessage = { type: 'scorm-course-completed', action: 'close', completed: true };
  const possibleHosts = [window.opener, window.parent, window.top];

  possibleHosts.forEach(host => {
    if (!host || host === window) return;
    try { host.postMessage(closeMessage, '*'); } catch (error) {}
    try {
      ['closeCourse', 'closeWindow', 'CloseWindow', 'closeLesson', 'finishCourse'].forEach(method => {
        if (typeof host[method] === 'function') host[method]();
      });
    } catch (error) {}
  });

  try { window.close(); } catch (error) {}
}

function completeCourse() {
  unlockedChapters = CHAPTER_ORDER.length;
  saveProgress();
  try { localStorage.setItem(`${PROGRESS_KEY}_completed`, 'passed'); } catch (error) {}
  if (window.SCORM && typeof SCORM.complete === 'function') {
    try { SCORM.complete(); } catch (error) {}
  }
  applyHomeLocks();
  document.getElementById('completion-panel')?.classList.add('show');
  requestCourseWindowClose();
}

document.addEventListener('DOMContentLoaded', () => {
  shuffleSmartMatching();
  loadProgress();
  initMadinaAudio();
  navigateTo('home');
});
