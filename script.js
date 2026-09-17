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
  if (requestedChapter > currentChapter && currentChapter >= 0) {
    const unviewed = findFirstUnviewedContent(currentPage);
    if (unviewed) {
      showRequiredContentHint(currentPage, unviewed);
      return;
    }
    if (!hasAnsweredChapterTests(currentPage)) {
      showTestRequiredHint(currentPage);
      return;
    }
  }
  if (requestedChapter >= unlockedChapters) return;

  PAGES.forEach(id => document.getElementById(`page-${id}`)?.classList.remove('active'));
  target.classList.add('active');
  currentPage = pageId;
  window.scrollTo({ top: 0, behavior: 'instant' });

  const backButton = document.getElementById('course-back');
  if (backButton) {
    backButton.hidden = pageId === 'home';
    const previousPage = PAGES[PAGES.indexOf(pageId) - 1];
    backButton.setAttribute('aria-label', `Назад: ${CHAPTER_NAMES[previousPage] || 'главная страница курса'}`);
  }

  const chapterIndex = requestedChapter;
  document.getElementById('nav-chapter').textContent = CHAPTER_NAMES[pageId] || '';
  document.getElementById('nav-progress').textContent = chapterIndex >= 0 ? `${chapterIndex + 1} / ${CHAPTER_ORDER.length}` : '';
  document.getElementById('progress-bar').style.width = chapterIndex >= 0 ? `${Math.round((chapterIndex + 1) / CHAPTER_ORDER.length * 100)}%` : '0%';

  applyHomeLocks();
  setTimeout(initFadeIn, 30);
}

function goToPreviousPage() {
  const currentIndex = PAGES.indexOf(currentPage);
  if (currentIndex > 0) navigateTo(PAGES[currentIndex - 1]);
}

function resetCourseInteractions() {
  document.querySelectorAll('.choice-grid, .choice-list').forEach(group => {
    delete group.dataset.answered;
    delete group.dataset.solved;
    delete group.dataset.wrongAttempts;
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
    delete card.dataset.viewed;
    card.querySelector('button')?.setAttribute('aria-expanded', 'false');
  });
  document.querySelectorAll('.question-guidance').forEach(details => {
    details.open = false;
    delete details.dataset.viewed;
  });
  document.querySelectorAll('.smart-card').forEach((card, index) => {
    card.classList.toggle('active', index === 0);
    if (index === 0) card.dataset.viewed = 'true';
    else delete card.dataset.viewed;
  });
  const smartBreakdown = document.getElementById('smart-breakdown');
  if (smartBreakdown) {
    smartBreakdown.classList.remove('smart-breakdown-open', 'visible');
    delete smartBreakdown.dataset.viewed;
  }
  const smartRevealButton = document.querySelector('.smart-reveal-btn');
  if (smartRevealButton) {
    smartRevealButton.classList.remove('active');
    smartRevealButton.innerHTML = 'Разобрать эту цель по SMART <span>＋</span>';
  }
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
  const unviewed = findFirstUnviewedContent(completedPageId);
  if (unviewed) {
    showRequiredContentHint(completedPageId, unviewed);
    return;
  }
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
  if (choiceGroups.some(group => group.dataset.solved !== 'true')) return false;

  const smartMatching = page.querySelector('#smart-matching');
  return !smartMatching || smartMatching.dataset.solved === 'true';
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

const CHOICE_FEEDBACK = {
  'case-feedback-1': {
    correct: '155 порций. Это остаток цели: 250 − 95 = 155.',
    wrong: {
      '125 порций': '125 получится, если разделить дневную цель пополам, но утром продали не половину, а 95 порций.',
      '250 порций': '250 — цель на весь день. Утренний результат нужно вычесть.'
    }
  },
  'case-feedback-2': {
    correct: '202 000 ₽. Это остаток плана: 350 000 − 148 000 = 202 000.',
    wrong: {
      '175 000 ₽': '175 000 ₽ — половина дневного плана, но утром заработали не половину, а 148 000 ₽.',
      '350 000 ₽': '350 000 ₽ — план на весь день. Утренний результат нужно вычесть.'
    }
  },
  'case-feedback-3': {
    correct: 'Завершить смену с 0 негативных отзывов. Этот ориентир действует весь день и относится ко всем зонам.',
    wrong: {
      'Удержать долю негативных отзывов не выше 1%': 'Цель задана абсолютным значением — 0 негативных отзывов. Заменять её процентом нельзя.',
      'Снизить число негативных отзывов к прошлой неделе': 'Сравнение с прошлой неделей не отвечает цели текущей смены — завершить её без негативных отзывов.'
    }
  },
  'calc-feedback': {
    correct: '30 000 ₽. Это 20% от 150 000 ₽: 150 000 × 20 / 100 = 30 000.',
    wrong: {
      '24 000 ₽': '24 000 ₽ — это 16% от выручки, а по условию доля кассира составляет 20%.',
      '36 000 ₽': '36 000 ₽ — это 24% от выручки, поэтому результат выше заданной доли.'
    }
  },
  'control-feedback': {
    correct: 'Уточнить понимание цели, выяснить причину отставания и вместе выбрать действие. Так помощь отвечает реальной причине.',
    wrong: {
      'Повторить план продаж, предложить чаще рекомендовать новинки и через час сверить результат': 'Действие выбрано до выяснения причины. Возможно, кассир уже предлагает новинки, а проблема в другом.',
      'Передать часть плана опытному кассиру, снизить цель отстающему и через час сверить результат': 'Перераспределение без выяснения причины может скрыть проблему и сделать общую цель недостижимой.'
    }
  }
};

function answerChoice(button, isCorrect, feedbackId) {
  const feedback = document.getElementById(feedbackId);
  const group = button.closest('.choice-grid, .choice-list');
  const copy = CHOICE_FEEDBACK[feedbackId];
  if (!feedback || !group || !copy || group.dataset.solved === 'true') return;
  group.dataset.answered = 'true';

  if (isCorrect) {
    button.classList.add('correct');
    group.dataset.solved = 'true';
    group.querySelectorAll('button').forEach(item => { item.disabled = true; });
    feedback.className = 'feedback-box show correct';
    feedback.innerHTML = `<strong>Верно.</strong> ${copy.correct}`;
    return;
  }

  const wrongAttempts = Number(group.dataset.wrongAttempts || 0) + 1;
  group.dataset.wrongAttempts = String(wrongAttempts);
  const reason = copy.wrong[button.textContent.trim()];
  button.classList.add('wrong');
  feedback.className = 'feedback-box show incorrect';

  if (wrongAttempts < 2) {
    feedback.innerHTML = `<strong>Пока неверно.</strong> ${reason} Осталась одна попытка.`;
    setTimeout(() => button.classList.remove('wrong'), 650);
    return;
  }

  const correctButton = [...group.querySelectorAll('button')].find(item => item.getAttribute('onclick')?.includes(', true,'));
  correctButton?.classList.add('correct');
  group.dataset.solved = 'true';
  group.querySelectorAll('button').forEach(item => { item.disabled = true; });
  feedback.innerHTML = `<strong>Вторая попытка неверная.</strong> ${reason}<br><strong>Правильный ответ:</strong> ${copy.correct}`;
}

function findFirstUnviewedContent(pageId) {
  const page = document.getElementById(`page-${pageId}`);
  if (!page) return null;
  return page.querySelector([
    '.question-guidance:not([data-viewed="true"])',
    '.smart-card:not([data-viewed="true"])',
    '#smart-breakdown:not([data-viewed="true"])',
    '.reason-card:not([data-viewed="true"])'
  ].join(', '));
}

function showRequiredContentHint(pageId, element) {
  const page = document.getElementById(`page-${pageId}`);
  const nextRow = page?.querySelector('.next-row');
  if (nextRow) {
    let hint = nextRow.querySelector('.course-gate-hint');
    if (!hint) {
      hint = document.createElement('p');
      hint.className = 'course-gate-hint';
      hint.setAttribute('role', 'status');
      nextRow.prepend(hint);
    }
    hint.textContent = 'Сначала открой все пояснения выше.';
    hint.classList.add('show');
  }

  const target = element.id === 'smart-breakdown' ? document.querySelector('.smart-reveal-btn') : element;
  target?.classList.add('required-attention');
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => target?.classList.remove('required-attention'), 1800);
}

const SMART_DETAILS = [
  ['S · Specific', 'Назови конкретный результат. Например: продать пирожки с вишней, предлагая их к горячим напиткам.'],
  ['M · Measurable', 'Укажи число, с которым сравнишь результат. Например: 15 пирожков.'],
  ['A · Achievable', 'Сопоставь цель с возможностями сотрудника. Например: обычно он продаёт 10 пирожков за эти два часа; запас и поток Гостей позволяют продать ещё 5.'],
  ['R · Relevant', 'Объясни вклад в общий результат. Например: продажа пирожков к напиткам помогает увеличить средний чек ресторана.'],
  ['T · Time-bound', 'Назови срок. Например: с 9:00 до 11:00. В 11:00 вместе подведите итог.']
];

function selectSmart(button, index) {
  document.querySelectorAll('.smart-card').forEach(card => card.classList.remove('active'));
  button.classList.add('active');
  button.dataset.viewed = 'true';
  button.classList.remove('required-attention');
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
  if (isOpen) {
    panel.dataset.viewed = 'true';
    button.classList.remove('required-attention');
  }
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
  const container = document.getElementById('smart-matching');

  if (container) {
    delete container.dataset.attempts;
    delete container.dataset.solved;
  }

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
  const container = document.getElementById('smart-matching');
  if (!feedback || !container || container.dataset.solved === 'true') return;
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
    const attempts = Number(container.dataset.attempts || 0) + 1;
    container.dataset.attempts = String(attempts);
    feedback.className = 'feedback-box show incorrect';
    if (attempts < 2) {
      feedback.innerHTML = `<strong>Пока не всё совпало.</strong> Неверных соответствий: ${wrong.length}. Подумай, где указан результат, число, достижимость, связь с общей целью и срок. Осталась одна попытка.`;
      wrong[0].focus();
      return;
    }

    const criterionMeaning = {
      S: 'конкретный результат',
      M: 'измеримое количество',
      A: 'достижимость относительно обычного результата',
      R: 'связь с общей целью ресторана',
      T: 'срок выполнения'
    };
    const details = wrong.map(select => {
      const example = select.closest('label')?.querySelector('span')?.textContent || '';
      const selectedText = select.options[select.selectedIndex]?.textContent || select.value;
      const correctText = select.querySelector(`option[value="${select.dataset.answer}"]`)?.textContent || select.dataset.answer;
      return `<b>«${example}»:</b> выбран вариант «${selectedText}», но он описывает ${criterionMeaning[select.value]}. Здесь показан ${criterionMeaning[select.dataset.answer]}, поэтому верно «${correctText}».`;
    }).join('<br>');
    selects.forEach(select => {
      select.value = select.dataset.answer;
      select.classList.remove('wrong');
      select.classList.add('correct');
      select.disabled = true;
    });
    container.dataset.solved = 'true';
    feedback.innerHTML = `<strong>Вторая попытка завершена. Правильные соответствия:</strong><br>${details}`;
    return;
  }

  selects.forEach(select => select.disabled = true);
  container.dataset.solved = 'true';
  feedback.className = 'feedback-box show correct';
  feedback.innerHTML = '<strong>Верно: все пять частей цели на своих местах.</strong> Вместе они образуют понятную SMART-цель: что продаём, сколько, почему результат достижим, зачем он нужен ресторану и к какому сроку.';
}

function toggleReason(button) {
  const card = button.closest('.reason-card');
  const isOpen = card.classList.toggle('open');
  if (isOpen) {
    card.dataset.viewed = 'true';
    card.classList.remove('required-attention');
  }
  button.setAttribute('aria-expanded', String(isOpen));
}

function initRequiredContentTracking() {
  document.querySelectorAll('.question-guidance').forEach(details => {
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      details.dataset.viewed = 'true';
      details.classList.remove('required-attention');
    });
  });
  const firstSmartCard = document.querySelector('.smart-card');
  if (firstSmartCard) firstSmartCard.dataset.viewed = 'true';
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
  initRequiredContentTracking();
  navigateTo('home');
});
