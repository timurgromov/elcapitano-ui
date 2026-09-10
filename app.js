const STORAGE_KEY = "elcapitano.prototype.v1";
const NOTICE_KEY = "elcapitano.prototype.notice-dismissed";

const ROLE_LABELS = {
  external: "Внешний результат",
  commitment: "Обязательство",
  quality: "Качество / риск",
  personal: "Семья / здоровье",
  learning: "Обучение",
  optimization: "Оптимизация",
  unknown: "Не определено",
};

const STATUS_LABELS = {
  ready: "Готово к выбору",
  in_progress: "В работе",
  completed: "Выполнено",
  inbox: "Входящие",
  deferred: "Отложено",
  excluded: "Исключено",
  reference: "Справочное",
  idea: "Инкубатор",
};

const VIEW_TITLES = {
  today: "Курс дня",
  purgatory: "Чистилище",
  tasks: "Все задачи",
  analytics: "Аналитика",
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const demoState = () => ({
  mode: "demo",
  projects: ["Коммерческий результат", "Обязательства", "Продукт"],
  focusId: "demo-focus",
  analyticsPeriod: "week",
  tasks: [
    {
      id: "demo-focus",
      title: "Сформулировать и отправить один внешний оффер",
      project: "Коммерческий результат",
      status: "ready",
      role: "external",
      source: "Демо",
      createdAt: todayIso(),
      why: "Даёт внешнюю обратную связь раньше следующего улучшения системы.",
      isDemo: true,
    },
    {
      id: "demo-commitment",
      title: "Закрыть одно обещанное обязательство",
      project: "Обязательства",
      status: "ready",
      role: "commitment",
      source: "Демо",
      createdAt: todayIso(),
      isDemo: true,
    },
    {
      id: "demo-purgatory",
      title: "Посмотреть сохранённый ролик про автоматизацию",
      project: "Не определён",
      status: "inbox",
      role: "unknown",
      source: "Заметка · демо",
      createdAt: todayIso(),
      question: "Какое решение или действие должно измениться после просмотра?",
      isDemo: true,
    },
    {
      id: "demo-completed",
      title: "Собрать первый вариант структуры кабинета",
      project: "Продукт",
      status: "completed",
      role: "quality",
      source: "Демо",
      createdAt: todayIso(),
      completedAt: todayIso(),
      isDemo: true,
    },
  ],
});

let state = loadState();
let currentView = "today";
let toastTimer;

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.projects)) return parsed;
  } catch (_) {
    // A corrupt local draft must not block the prototype.
  }
  return demoState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusClass(status) {
  if (status === "completed") return "status-completed";
  if (status === "in_progress") return "status-progress";
  if (status === "inbox") return "status-inbox";
  if (["deferred", "excluded", "reference", "idea"].includes(status)) return "status-muted";
  return "status-ready";
}

function taskCard(task, options = {}) {
  const completed = task.status === "completed";
  return `
    <article class="task-card" data-task-id="${escapeHtml(task.id)}">
      <button class="task-check ${completed ? "is-complete" : ""}" type="button" data-toggle-complete="${escapeHtml(task.id)}" aria-label="${completed ? "Вернуть в работу" : "Отметить выполненным"}">✓</button>
      <div class="task-main">
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(task.project || "Без проекта")}${options.showRole ? ` · ${escapeHtml(ROLE_LABELS[task.role] || ROLE_LABELS.unknown)}` : ""}</small>
      </div>
      <div class="task-meta">
        <i class="role-mark ${escapeHtml(task.role || "unknown")}" title="${escapeHtml(ROLE_LABELS[task.role] || ROLE_LABELS.unknown)}"></i>
        <span class="status-chip ${statusClass(task.status)}">${escapeHtml(STATUS_LABELS[task.status] || task.status)}</span>
      </div>
    </article>`;
}

function renderToday() {
  const focus = state.tasks.find((task) => task.id === state.focusId && task.status !== "completed")
    || state.tasks.find((task) => task.status === "ready" && task.role === "external")
    || state.tasks.find((task) => task.status === "ready");
  const focusContent = document.querySelector("#focus-content");

  if (focus) {
    state.focusId = focus.id;
    focusContent.innerHTML = `
      <div class="focus-body">
        <h2>${escapeHtml(focus.title)}</h2>
        <p>${escapeHtml(focus.why || "Сформулируй один наблюдаемый результат — это станет границей задачи.")}</p>
        <div class="focus-actions">
          <button class="button" type="button" data-toggle-complete="${escapeHtml(focus.id)}">Отметить результат</button>
          <button class="button button-secondary" type="button" data-action="change-focus">Сменить осознанно</button>
        </div>
      </div>`;
    document.querySelector("#course-project").textContent = focus.project || "Без проекта";
    document.querySelector("#course-outcome").textContent = ROLE_LABELS[focus.role] || "Нужен выбор";
  } else {
    focusContent.innerHTML = `
      <div class="focus-body">
        <h2>Главная ставка ещё не выбрана</h2>
        <p>Добавь понятную задачу или выбери одну из готовых — без неё система не будет придумывать направление.</p>
        <div class="focus-actions"><button class="button" type="button" data-open-quick-add>Добавить результат</button></div>
      </div>`;
    document.querySelector("#course-project").textContent = "Не выбран";
    document.querySelector("#course-outcome").textContent = "Нужен выбор";
  }

  const commitments = state.tasks.filter((task) => task.role === "commitment" && task.status !== "completed" && !["excluded", "deferred"].includes(task.status));
  const completed = state.tasks.filter((task) => task.status === "completed" && task.completedAt === todayIso());
  document.querySelector("#commitments-list").innerHTML = commitments.length
    ? commitments.map((task) => taskCard(task)).join("")
    : emptyState("Нет обязательных контуров", "Добавляй только реальные обещания и дедлайны.");
  document.querySelector("#completed-list").innerHTML = completed.length
    ? completed.slice(0, 6).map((task) => taskCard(task, { showRole: true })).join("")
    : emptyState("Пока нет подтверждённых результатов", "Добавь выполненное — план сам по себе не считается фактом.");
  document.querySelector("#commitments-count").textContent = `${commitments.length} ${wordForm(commitments.length, ["задача", "задачи", "задач"])}`;
  document.querySelector("#completed-count").textContent = `${completed.length} ${wordForm(completed.length, ["результат", "результата", "результатов"])}`;
}

function emptyState(title, text) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
}

function wordForm(number, forms) {
  const mod100 = number % 100;
  const mod10 = number % 10;
  if (mod100 > 10 && mod100 < 20) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 > 1 && mod10 < 5) return forms[1];
  return forms[2];
}

function renderPurgatory() {
  const inbox = state.tasks.filter((task) => task.status === "inbox");
  document.querySelector("#nav-inbox-count").textContent = inbox.length;
  document.querySelector("#purgatory-count").textContent = `${inbox.length} ${wordForm(inbox.length, ["осталась", "осталось", "осталось"])}`;
  const container = document.querySelector("#purgatory-card");
  if (!inbox.length) {
    container.innerHTML = emptyState("Чистилище пусто", "Новые и непонятные записи появятся здесь, а не в плане дня.");
    return;
  }
  const task = inbox[0];
  container.innerHTML = `
    <article class="triage-card" data-task-id="${escapeHtml(task.id)}">
      <div class="triage-source"><span>${escapeHtml(task.source || "Ручной ввод")}</span><span>не подтверждено</span></div>
      <blockquote>${escapeHtml(task.title)}</blockquote>
      <p class="triage-question">${escapeHtml(task.question || "Какой конкретный результат должен появиться после этой задачи?")}</p>
      <div class="triage-fields">
        <select id="triage-project" aria-label="Проект">${projectOptions(task.project)}</select>
        <input id="triage-next-action" maxlength="180" placeholder="Следующее действие" aria-label="Следующее действие" />
      </div>
      <div class="triage-actions">
        <button type="button" data-triage="task">Это задача</button>
        <button type="button" data-triage="idea">Идея / обучение</button>
        <button type="button" data-triage="reference">Справочное</button>
        <button type="button" data-triage="deferred">Отложить</button>
        <button type="button" data-triage="excluded">Исключить</button>
      </div>
    </article>`;
}

function projectOptions(selected = "") {
  const projects = [...new Set([...state.projects, selected].filter(Boolean))];
  return [`<option value="">Выбрать проект</option>`, ...projects.map((project) => `<option value="${escapeHtml(project)}" ${project === selected ? "selected" : ""}>${escapeHtml(project)}</option>`)].join("");
}

function renderTaskFilters() {
  const filter = document.querySelector("#project-filter");
  const current = filter.value || "all";
  filter.innerHTML = `<option value="all">Все проекты</option>${state.projects.map((project) => `<option value="${escapeHtml(project)}">${escapeHtml(project)}</option>`).join("")}`;
  filter.value = state.projects.includes(current) ? current : "all";
  document.querySelector("#quick-project").innerHTML = projectOptions();
}

function renderTasks() {
  const query = document.querySelector("#task-search").value.trim().toLowerCase();
  const project = document.querySelector("#project-filter").value;
  const status = document.querySelector("#status-filter").value;
  const tasks = state.tasks.filter((task) => {
    if (query && !`${task.title} ${task.project}`.toLowerCase().includes(query)) return false;
    if (project !== "all" && task.project !== project) return false;
    if (status !== "all" && task.status !== status) return false;
    return !["excluded"].includes(task.status);
  });
  document.querySelector("#all-tasks-list").innerHTML = tasks.length
    ? tasks.map((task) => `
      <article class="task-row" data-task-id="${escapeHtml(task.id)}">
        <div><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(ROLE_LABELS[task.role] || ROLE_LABELS.unknown)}</small></div>
        <span>${escapeHtml(task.project || "Без проекта")}</span>
        <span class="status-chip ${statusClass(task.status)}">${escapeHtml(STATUS_LABELS[task.status] || task.status)}</span>
        <span class="source-label">${escapeHtml(task.source || "Ручной ввод")}</span>
      </article>`).join("")
    : emptyState("Ничего не найдено", "Измени фильтры или добавь новую запись.");
}

function periodDays(period) {
  return period === "day" ? 1 : period === "month" ? 30 : 7;
}

function inPeriod(task, period) {
  const date = new Date(`${task.completedAt || task.createdAt}T12:00:00`);
  const threshold = new Date();
  threshold.setHours(0, 0, 0, 0);
  threshold.setDate(threshold.getDate() - periodDays(period) + 1);
  return date >= threshold;
}

function renderAnalytics() {
  const period = state.analyticsPeriod || "week";
  document.querySelectorAll("[data-period]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.period === period);
  });
  const tasks = state.tasks.filter((task) => task.status === "completed" && inPeriod(task, period));
  const outcomeCount = tasks.filter((task) => task.role === "external").length;
  const commitmentCount = tasks.filter((task) => task.role === "commitment").length;
  const learningCount = tasks.filter((task) => ["learning", "optimization"].includes(task.role)).length;
  const projectCount = new Set(tasks.map((task) => task.project).filter(Boolean)).size;
  const metrics = [
    ["Внешние результаты", outcomeCount, "деньги, рынок, опубликованный результат"],
    ["Закрытые обязательства", commitmentCount, "обещания и реальные сроки"],
    ["Обучение + оптимизация", learningCount, "не штраф, а сигнал для сравнения"],
    ["Проекты с движением", projectCount, "по подтверждённым действиям"],
  ];
  document.querySelector("#metric-grid").innerHTML = metrics.map(([label, value, note]) => `<article class="metric-card"><small>${label}</small><strong>${value}</strong><em>${note}</em></article>`).join("");
  document.querySelector("#analytics-period-label").textContent = `${periodDays(period)} ${wordForm(periodDays(period), ["день", "дня", "дней"])}`;

  const counts = Object.keys(ROLE_LABELS).filter((key) => key !== "unknown").map((role) => ({
    role,
    label: ROLE_LABELS[role],
    count: tasks.filter((task) => task.role === role).length,
  }));
  const max = Math.max(1, ...counts.map((item) => item.count));
  document.querySelector("#direction-bars").innerHTML = counts.map((item) => {
    const level = Math.round((item.count / max) * 10);
    return `<div class="bar-item"><span>${escapeHtml(item.label)}</span><div class="bar-track"><div class="bar-fill ${escapeHtml(item.role)} level-${level}"></div></div><strong>${item.count}</strong></div>`;
  }).join("");

  const projects = [...new Set(tasks.map((task) => task.project).filter(Boolean))];
  document.querySelector("#project-movement").innerHTML = projects.length
    ? projects.map((project) => {
      const projectTasks = tasks.filter((task) => task.project === project);
      const external = projectTasks.filter((task) => task.role === "external").length;
      return `<div class="movement-row"><strong>${escapeHtml(project)}</strong><span>${projectTasks.length}</span><small>${external ? `${external} внешних результатов` : "внешний результат пока не отмечен"}</small></div>`;
    }).join("")
    : emptyState("Пока нет движения", "Добавь выполненные результаты — аналитика не строится из планов.");
}

function render() {
  renderTaskFilters();
  renderToday();
  renderPurgatory();
  renderTasks();
  renderAnalytics();
  saveState();
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll("[data-view]").forEach((section) => {
    const active = section.dataset.view === view;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    const active = button.dataset.viewTarget === view;
    button.classList.toggle("is-active", active);
    if (button.closest(".primary-nav")) active ? button.setAttribute("aria-current", "page") : button.removeAttribute("aria-current");
  });
  document.querySelector("#view-title").textContent = VIEW_TITLES[view];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggleComplete(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const wasComplete = task.status === "completed";
  task.status = wasComplete ? "ready" : "completed";
  task.completedAt = wasComplete ? null : todayIso();
  if (!wasComplete) showToast("Результат отмечен. В runtime он ещё потребует подтверждения.");
  render();
}

function triageTask(decision) {
  const task = state.tasks.find((item) => item.status === "inbox");
  if (!task) return;
  const project = document.querySelector("#triage-project")?.value;
  const nextAction = document.querySelector("#triage-next-action")?.value.trim();
  if (decision === "task" && !project) {
    showToast("Сначала выбери проект — иначе задача снова потеряется.");
    return;
  }
  if (project) task.project = project;
  if (nextAction) task.title = nextAction;
  if (decision === "task") task.status = "ready";
  if (["idea", "reference", "deferred", "excluded"].includes(decision)) task.status = decision;
  if (decision === "idea") task.role = "learning";
  showToast(decision === "task" ? "Запись готова к выбору." : "Запись убрана из активного потока.");
  render();
}

function changeFocus() {
  const ready = state.tasks.filter((task) => task.status === "ready" && task.id !== state.focusId);
  if (!ready.length) {
    showToast("Других готовых задач нет. Сначала разбери входящие.");
    return;
  }
  state.focusId = ready[0].id;
  showToast("Фокус изменён осознанно. Причину можно будет хранить в runtime.");
  render();
}

function addCompleted(event) {
  event.preventDefault();
  const title = document.querySelector("#quick-title").value.trim();
  const newProject = document.querySelector("#quick-new-project").value.trim();
  const selectedProject = document.querySelector("#quick-project").value;
  const project = newProject || selectedProject || "Без проекта";
  const role = document.querySelector("#quick-role").value;
  if (!title) return;
  if (newProject && !state.projects.includes(newProject)) state.projects.push(newProject);
  state.tasks.push({
    id: newId(), title, project, role, status: "completed", source: "Ручной ввод",
    createdAt: todayIso(), completedAt: todayIso(), isDemo: false,
  });
  state.mode = "local_only";
  event.currentTarget.reset();
  document.querySelector("#quick-add-dialog").close();
  showToast("Сохранено только в этом браузере.");
  render();
}

function showSourceBoundary(source) {
  document.querySelector("#info-dialog").dataset.state = "provider_not_connected";
  document.querySelector("#info-title").textContent = `${source}: пока не подключён`;
  document.querySelector("#info-text").textContent = source === "Codex"
    ? "Прототип показывает будущий flow, но не читает чаты и не создаёт ложный импорт. Защищённый adapter позже передаст только короткие task metadata в PostgreSQL."
    : "Статическая страница не получает доступ к Google Doc и токенам. Read-only adapter будет работать на backend, сравнивать revision и передавать только новые или изменённые строки.";
  document.querySelector("#info-dialog").showModal();
}

function exportJson() {
  const safe = {
    exportedAt: new Date().toISOString(),
    schema: "elcapitano-prototype-v1",
    projects: state.projects,
    tasks: state.tasks.filter((task) => !task.isDemo),
  };
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `elcapitano-export-${todayIso()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast(safe.tasks.length ? "JSON export создан." : "Экспорт создан без demo-записей.");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-target]");
  if (viewButton) switchView(viewButton.dataset.viewTarget);

  const completeButton = event.target.closest("[data-toggle-complete]");
  if (completeButton) toggleComplete(completeButton.dataset.toggleComplete);

  if (event.target.closest("[data-open-quick-add]")) document.querySelector("#quick-add-dialog").showModal();
  if (event.target.closest("[data-close-dialog]")) document.querySelector("#quick-add-dialog").close();
  if (event.target.closest("[data-close-info]")) document.querySelector("#info-dialog").close();

  const sourceButton = event.target.closest("[data-source]");
  if (sourceButton) showSourceBoundary(sourceButton.dataset.source);

  const triageButton = event.target.closest("[data-triage]");
  if (triageButton) triageTask(triageButton.dataset.triage);

  if (event.target.closest("[data-action='change-focus']")) changeFocus();
});

document.querySelector("#quick-add-form").addEventListener("submit", addCompleted);
document.querySelector("#export-button").addEventListener("click", exportJson);
document.querySelector("#task-search").addEventListener("input", renderTasks);
document.querySelector("#project-filter").addEventListener("change", renderTasks);
document.querySelector("#status-filter").addEventListener("change", renderTasks);
document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => {
  state.analyticsPeriod = button.dataset.period;
  document.querySelectorAll("[data-period]").forEach((item) => item.classList.toggle("is-active", item === button));
  renderAnalytics();
  saveState();
}));
document.querySelector("#dismiss-notice").addEventListener("click", () => {
  document.querySelector("#prototype-notice").hidden = true;
  localStorage.setItem(NOTICE_KEY, "1");
});
document.querySelector("#remove-demo").addEventListener("click", () => {
  state.tasks = state.tasks.filter((task) => !task.isDemo);
  state.projects = [...new Set(state.tasks.map((task) => task.project).filter((project) => project && project !== "Без проекта"))];
  state.focusId = null;
  state.mode = "local_only";
  document.querySelector("#prototype-notice").hidden = true;
  localStorage.setItem(NOTICE_KEY, "1");
  showToast("Демо убрано. Теперь здесь только твои записи.");
  render();
});

document.querySelector("#date-kicker").textContent = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
if (localStorage.getItem(NOTICE_KEY)) document.querySelector("#prototype-notice").hidden = true;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
render();
