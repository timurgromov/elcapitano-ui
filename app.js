const STORAGE_KEY = "elcapitano.task-register.v2";
const LEGACY_STORAGE_KEY = "elcapitano.prototype.v1";
const NOTICE_KEY = "elcapitano.prototype.notice-dismissed";

const STATUS_LABELS = {
  todo: "Новая",
  in_progress: "В работе",
  waiting: "Ждёт",
  done: "Готово",
};

const VIEW_META = {
  tasks: ["СПИСОК", "Все задачи"],
  inbox: ["БЕЗ ПРОЕКТА", "Входящие"],
  projects: ["СПИСОК", "Проекты"],
  completed: ["АРХИВ РЕЗУЛЬТАТОВ", "Выполненные"],
  analytics: ["СВОДКА", "Аналитика"],
};

const todayIso = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
};
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random());

const demoState = () => ({
  schema: "elcapitano-task-register-v2",
  mode: "demo",
  projects: [
    { id: "project-sales", name: "Продажи", order: 0, isDemo: true },
    { id: "project-events", name: "Текущие мероприятия", order: 1, isDemo: true },
    { id: "project-elcapitano", name: "ElCapitano", order: 2, isDemo: true },
  ],
  tasks: [
    { id: "task-sales", title: "Отправить предложение новому клиенту", projectId: "project-sales", status: "todo", order: 0, source: "Демо", createdAt: todayIso(), isDemo: true },
    { id: "task-event", title: "Подготовить материалы к ближайшему мероприятию", projectId: "project-events", status: "in_progress", order: 1, source: "Демо", createdAt: todayIso(), isDemo: true },
    { id: "task-system", title: "Проверить импорт выполненных задач из Codex", projectId: "project-elcapitano", status: "todo", order: 2, source: "Демо", createdAt: todayIso(), isDemo: true },
    { id: "task-inbox", title: "Разобрать старые записи из рабочего стола", projectId: null, status: "todo", order: 3, source: "Демо", createdAt: todayIso(), isDemo: true },
  ],
});

let state = loadState();
let currentView = "tasks";
let currentProjectId = null;
let projectDialogContext = {};
let dragState = null;
let toastTimer;

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.projects)) return normalizeState(parsed);
  } catch (_) {
    // A corrupt local draft must not block the task register.
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy && Array.isArray(legacy.tasks) && Array.isArray(legacy.projects)) return migrateLegacyState(legacy);
  } catch (_) {
    // Start with generic demo data when the old prototype cannot be read.
  }

  return demoState();
}

function normalizeState(value) {
  return {
    schema: "elcapitano-task-register-v2",
    mode: value.mode || "local_only",
    projects: value.projects.map((project, index) => ({
      ...project,
      order: Number.isFinite(project.order) ? project.order : index,
    })),
    tasks: value.tasks.map((task, index) => ({
      ...task,
      projectId: task.projectId || null,
      status: STATUS_LABELS[task.status] ? task.status : "todo",
      order: Number.isFinite(task.order) ? task.order : index,
    })),
  };
}

function migrateLegacyState(legacy) {
  const names = Array.from(new Set(
    legacy.projects.concat(legacy.tasks.map((task) => task.project))
      .filter((name) => name && !["Без проекта", "Не определён"].includes(name))
  ));
  const projects = names.map((name, index) => ({
    id: newId(),
    name,
    order: index,
    isDemo: legacy.tasks.some((task) => task.project === name && task.isDemo),
  }));
  const byName = new Map(projects.map((project) => [project.name, project.id]));
  const statusMap = { ready: "todo", inbox: "todo", deferred: "waiting", completed: "done", in_progress: "in_progress" };

  return normalizeState({
    schema: "elcapitano-task-register-v2",
    mode: legacy.mode || "local_only",
    projects,
    tasks: legacy.tasks
      .filter((task) => !["excluded", "reference", "idea"].includes(task.status))
      .map((task, index) => ({
        id: task.id || newId(),
        title: task.title,
        projectId: byName.get(task.project) || null,
        status: statusMap[task.status] || "todo",
        order: index,
        source: task.source || "Ручной ввод",
        createdAt: task.createdAt || todayIso(),
        completedAt: task.completedAt || null,
        isDemo: Boolean(task.isDemo),
      })),
  });
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

function sortedProjects() {
  return [...state.projects].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ru"));
}

function sortedTasks() {
  return [...state.tasks].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

function projectById(id) {
  return state.projects.find((project) => project.id === id);
}

function wordForm(number, forms) {
  const mod100 = number % 100;
  const mod10 = number % 10;
  if (mod100 > 10 && mod100 < 20) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 > 1 && mod10 < 5) return forms[1];
  return forms[2];
}

function projectOptions(selectedId = "", settings = {}) {
  const options = [];
  if (settings.includeAll) options.push('<option value="all">Все проекты</option>');
  const noProjectValue = settings.includeAll ? "none" : "";
  options.push('<option value="' + noProjectValue + '"' + (!selectedId ? " selected" : "") + '>Без проекта</option>');
  sortedProjects().forEach((project) => {
    options.push('<option value="' + escapeHtml(project.id) + '"' + (project.id === selectedId ? " selected" : "") + ">" + escapeHtml(project.name) + "</option>");
  });
  if (settings.includeNew !== false) options.push('<option value="__new__">＋ Создать проект</option>');
  return options.join("");
}

function statusOptions(selected) {
  return Object.entries(STATUS_LABELS)
    .map(([value, label]) => '<option value="' + value + '"' + (value === selected ? " selected" : "") + ">" + label + "</option>")
    .join("");
}

function taskRow(task, index, listId) {
  const done = task.status === "done";
  const completionDate = done
    ? '<label class="completion-date"><span>Готово</span><input type="date" value="' + escapeHtml(task.completedAt || "") + '" data-task-completed-at="' + escapeHtml(task.id) + '" aria-label="Дата выполнения задачи" /></label>'
    : "";
  return [
    '<article class="task-row' + (done ? " is-done" : "") + '" data-task-id="' + escapeHtml(task.id) + '">',
    '<div class="order-cell">',
    '<button class="drag-handle" type="button" data-drag-task="' + escapeHtml(task.id) + '" data-list-id="' + escapeHtml(listId) + '" aria-label="Изменить порядок задачи ' + (index + 1) + '" title="Перетащить или использовать стрелки">⠿</button>',
    '<span class="task-number">' + (index + 1) + "</span>",
    "</div>",
    '<button class="task-check' + (done ? " is-complete" : "") + '" type="button" data-toggle-complete="' + escapeHtml(task.id) + '" aria-label="' + (done ? "Вернуть задачу в работу" : "Отметить задачу выполненной") + '">✓</button>',
    '<div class="task-title"><strong class="editable-name" contenteditable="plaintext-only" role="textbox" aria-multiline="false" aria-label="Редактировать название задачи" spellcheck="true" data-edit-task-title="' + escapeHtml(task.id) + '">' + escapeHtml(task.title) + '</strong><div class="task-meta"><small>' + escapeHtml(task.source || "Ручной ввод") + "</small>" + completionDate + "</div></div>",
    '<label class="inline-field"><span class="sr-only">Проект задачи</span><select data-task-project="' + escapeHtml(task.id) + '">' + projectOptions(task.projectId) + "</select></label>",
    '<label class="inline-field"><span class="sr-only">Статус задачи</span><select data-task-status="' + escapeHtml(task.id) + '">' + statusOptions(task.status) + "</select></label>",
    '<button class="row-delete" type="button" data-delete-task="' + escapeHtml(task.id) + '" aria-label="Удалить задачу">×</button>',
    "</article>",
  ].join("");
}

function renderTaskList(containerId, tasks, emptyText) {
  const container = document.getElementById(containerId);
  container.innerHTML = tasks.length
    ? tasks.map((task, index) => taskRow(task, index, containerId)).join("")
    : '<div class="empty-state">' + escapeHtml(emptyText) + "</div>";
}

function filteredMainTasks() {
  const query = document.querySelector("#task-search").value.trim().toLowerCase();
  const projectId = document.querySelector("#project-filter").value;
  const status = document.querySelector("#status-filter").value;
  return sortedTasks().filter((task) => {
    const project = projectById(task.projectId);
    if (query && !(task.title + " " + (project?.name || "")).toLowerCase().includes(query)) return false;
    if (projectId === "none" && task.projectId) return false;
    if (!["all", "none"].includes(projectId) && task.projectId !== projectId) return false;
    if (status === "active" && task.status === "done") return false;
    if (!["active", "all"].includes(status) && task.status !== status) return false;
    return true;
  });
}

function renderFilters() {
  const filter = document.querySelector("#project-filter");
  const previous = filter.value || "all";
  filter.innerHTML = projectOptions("", { includeAll: true, includeNew: false });
  const allowed = ["all", "none"].concat(state.projects.map((project) => project.id));
  filter.value = allowed.includes(previous) ? previous : "all";

  document.querySelectorAll("[data-capture-project]").forEach((select) => {
    const selected = select.value;
    select.innerHTML = projectOptions(selected);
    if (state.projects.some((project) => project.id === selected)) select.value = selected;
  });
}

function renderTasks() {
  const tasks = filteredMainTasks();
  renderTaskList("all-tasks-list", tasks, "Задач по выбранным фильтрам нет.");
  document.querySelector("#task-list-count").textContent = tasks.length + " " + wordForm(tasks.length, ["задача", "задачи", "задач"]);
}

function renderInbox() {
  const tasks = sortedTasks().filter((task) => !task.projectId && task.status !== "done");
  renderTaskList("inbox-task-list", tasks, "Входящие пусты — у всех активных задач назначен проект.");
}

function renderCompleted() {
  const tasks = sortedTasks().filter((task) => task.status === "done");
  renderTaskList("completed-task-list", tasks, "Выполненных задач пока нет.");
}

function localDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function analyticsWindow() {
  const selected = document.querySelector("#analytics-period")?.value || "30";
  if (selected === "all") return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (Number(selected) - 1));
  return start;
}

function analyticsTasks() {
  const start = analyticsWindow();
  return state.tasks.filter((task) => {
    if (task.status !== "done") return false;
    const completedAt = localDate(task.completedAt);
    return completedAt && (!start || completedAt >= start);
  });
}

function formatTaskDate(value) {
  const date = localDate(value);
  return date ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date) : "Без даты";
}

function analyticsEmpty(message) {
  return '<div class="analytics-empty">' + escapeHtml(message) + "</div>";
}

function renderAnalytics() {
  const completed = analyticsTasks();
  const active = state.tasks.filter((task) => task.status !== "done");
  const completedWithProject = new Set(completed.map((task) => task.projectId).filter(Boolean));
  const unassigned = state.tasks.filter((task) => !task.projectId && task.status !== "done");
  const period = document.querySelector("#analytics-period")?.value || "30";
  const periodCaption = period === "all" ? "за всё время" : "за " + period + " дней";

  document.querySelector("#analytics-completed").textContent = completed.length;
  document.querySelector("#analytics-completed-caption").textContent = periodCaption;
  document.querySelector("#analytics-active").textContent = active.length;
  document.querySelector("#analytics-projects").textContent = completedWithProject.size;
  document.querySelector("#analytics-unassigned").textContent = unassigned.length;
  document.querySelector("#analytics-project-total").textContent = completed.length + " " + wordForm(completed.length, ["задача", "задачи", "задач"]);

  const byProject = new Map();
  completed.forEach((task) => {
    const name = projectById(task.projectId)?.name || "Без проекта";
    byProject.set(name, (byProject.get(name) || 0) + 1);
  });
  const projectRows = [...byProject.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  document.querySelector("#analytics-by-project").innerHTML = projectRows.length
    ? projectRows.map(([name, count]) => '<div class="analytics-row"><span>' + escapeHtml(name) + "</span><b>" + count + "</b></div>").join("")
    : analyticsEmpty("В выбранном периоде пока нет задач с датой выполнения.");

  const byDay = new Map();
  completed.forEach((task) => byDay.set(task.completedAt, (byDay.get(task.completedAt) || 0) + 1));
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const maximum = Math.max(1, ...days.map(([, count]) => count));
  document.querySelector("#analytics-by-day").innerHTML = days.length
    ? days.map(([day, count]) => '<div class="analytics-day"><span>' + formatTaskDate(day) + '</span><i><b style="width:' + Math.round((count / maximum) * 100) + '%"></b></i><strong>' + count + "</strong></div>").join("")
    : analyticsEmpty("Нет дат выполнения для построения ритма.");

  const withCompletionDate = state.tasks.filter((task) => task.status === "done" && localDate(task.completedAt)).length;
  const manual = state.tasks.filter((task) => (task.source || "Ручной ввод") === "Ручной ввод").length;
  const otherSources = state.tasks.length - manual;
  document.querySelector("#analytics-coverage").innerHTML = [
    ["Хранилище", "Только этот браузер"],
    ["Даты выполнения", withCompletionDate + " из " + state.tasks.filter((task) => task.status === "done").length],
    ["Ручной ввод", manual + " задач"],
    ["Другие источники", otherSources ? otherSources + " задач" : "не подключены"],
  ].map(([label, value]) => '<div><span>' + label + "</span><strong>" + value + "</strong></div>").join("");
}

function renderProjectDetail() {
  const project = projectById(currentProjectId);
  if (!project) return;
  const tasks = sortedTasks().filter((task) => task.projectId === project.id);
  renderTaskList("project-task-list", tasks, "В этом проекте пока нет задач.");
}

function renderProjects() {
  const projects = sortedProjects();
  document.querySelector("#project-list").innerHTML = projects.length
    ? projects.map((project, index) => {
      const tasks = state.tasks.filter((task) => task.projectId === project.id);
      const active = tasks.filter((task) => task.status !== "done").length;
      const done = tasks.length - active;
      return [
        '<article class="project-row" data-project-id="' + escapeHtml(project.id) + '">',
        '<div class="order-cell">',
        '<button class="drag-handle" type="button" data-drag-project="' + escapeHtml(project.id) + '" data-list-id="project-list" aria-label="Изменить порядок проекта ' + (index + 1) + '" title="Перетащить или использовать стрелки">⠿</button>',
        '<span class="task-number">' + (index + 1) + "</span>",
        "</div>",
        '<div class="project-title">',
        '<strong class="editable-name" contenteditable="plaintext-only" role="textbox" aria-multiline="false" aria-label="Редактировать название проекта" spellcheck="true" data-edit-project-name="' + escapeHtml(project.id) + '">' + escapeHtml(project.name) + "</strong>",
        '<button class="project-open" type="button" data-open-project="' + escapeHtml(project.id) + '"><small>' + active + " активных · " + done + " выполнено · Открыть →</small></button>",
        "</div>",
        '<span class="project-total">' + tasks.length + "</span>",
        '<button class="row-delete" type="button" data-delete-project="' + escapeHtml(project.id) + '" aria-label="Удалить проект ' + escapeHtml(project.name) + '">×</button>',
        "</article>",
      ].join("");
    }).join("")
    : '<div class="empty-state">Проектов пока нет. Создай первый проект одной кнопкой.</div>';

  document.querySelector("#sidebar-project-list").innerHTML = projects.length
    ? projects.map((project) => {
      const active = state.tasks.filter((task) => task.projectId === project.id && task.status !== "done").length;
      return '<button type="button" data-open-project="' + escapeHtml(project.id) + '"><span data-project-name-label="' + escapeHtml(project.id) + '">' + escapeHtml(project.name) + "</span><b>" + active + "</b></button>";
    }).join("")
    : '<span class="sidebar-empty">Пока пусто</span>';
}

function renderCounts() {
  const active = state.tasks.filter((task) => task.status !== "done").length;
  const inbox = state.tasks.filter((task) => !task.projectId && task.status !== "done").length;
  const completed = state.tasks.filter((task) => task.status === "done").length;
  document.querySelector("#nav-task-count").textContent = active;
  document.querySelector("#nav-inbox-count").textContent = inbox;
  document.querySelector("#nav-project-count").textContent = state.projects.length;
  document.querySelector("#nav-completed-count").textContent = completed;
}

function render() {
  renderFilters();
  renderTasks();
  renderInbox();
  renderCompleted();
  renderAnalytics();
  renderProjects();
  renderProjectDetail();
  renderCounts();
  saveState();
}

function switchView(view, projectId = null) {
  if (view === "project") currentProjectId = projectId || currentProjectId;
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
  const project = projectById(currentProjectId);
  const meta = view === "project" && project ? ["ПРОЕКТ", project.name] : VIEW_META[view];
  document.querySelector("#view-kicker").textContent = meta?.[0] || "СПИСОК";
  document.querySelector("#view-title").textContent = meta?.[1] || "Задачи";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function normalizeInputLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-•*]|\d+[.)]|[☐□])\s+/, "").trim())
    .filter(Boolean);
}

function addTasks(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector("[data-capture-input]");
  const lines = normalizeInputLines(input.value);
  if (!lines.length) {
    showToast("Напиши хотя бы одну задачу.");
    input.focus();
    return;
  }
  const projectId = form.dataset.captureForm === "project"
    ? currentProjectId
    : form.querySelector("[data-capture-project]")?.value || null;
  let order = Math.max(-1, ...state.tasks.map((task) => task.order)) + 1;
  lines.forEach((title) => {
    state.tasks.push({ id: newId(), title, projectId, status: "todo", order: order++, source: "Ручной ввод", createdAt: todayIso(), completedAt: null, isDemo: false });
  });
  state.mode = "local_only";
  input.value = "";
  render();
  showToast("Добавлено: " + lines.length + ".");
}

function toggleComplete(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const completed = task.status === "done";
  task.status = completed ? "todo" : "done";
  task.completedAt = completed ? null : todayIso();
  state.mode = "local_only";
  render();
  showToast(completed ? "Задача возвращена в общий список." : "Задача перенесена в выполненные.");
}

function setCompletedAt(id, value) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || task.status !== "done") return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    task.completedAt = task.completedAt || todayIso();
    render();
    showToast("Для выполненной задачи нужна дата.");
    return;
  }
  task.completedAt = value;
  state.mode = "local_only";
  render();
  showToast("Дата выполнения сохранена.");
}

function openProjectDialog(context = {}) {
  projectDialogContext = context;
  const dialog = document.querySelector("#project-dialog");
  const input = document.querySelector("#project-name");
  document.querySelector("#project-form-error").hidden = true;
  input.value = "";
  dialog.showModal();
  setTimeout(() => input.focus(), 0);
}

function closeProjectDialog() {
  document.querySelector("#project-dialog").close();
  projectDialogContext = {};
}

function createProject(event) {
  event.preventDefault();
  const name = document.querySelector("#project-name").value.trim();
  const error = document.querySelector("#project-form-error");
  if (!name) return;
  if (state.projects.some((project) => project.name.toLowerCase() === name.toLowerCase())) {
    error.textContent = "Проект с таким названием уже есть.";
    error.hidden = false;
    return;
  }
  const project = {
    id: newId(),
    name,
    order: Math.max(-1, ...state.projects.map((item) => item.order)) + 1,
    isDemo: false,
  };
  state.projects.push(project);
  if (projectDialogContext.taskId) {
    const task = state.tasks.find((item) => item.id === projectDialogContext.taskId);
    if (task) task.projectId = project.id;
  }
  state.mode = "local_only";
  document.querySelector("#project-dialog").close();
  const captureForm = projectDialogContext.captureForm;
  projectDialogContext = {};
  render();
  if (captureForm) {
    const select = captureForm.querySelector("[data-capture-project]");
    if (select) select.value = project.id;
  }
  showToast("Проект создан.");
}

function deleteProject(id) {
  const project = projectById(id);
  if (!project) return;
  if (!window.confirm("Удалить проект «" + project.name + "»? Задачи останутся во входящих.")) return;
  state.tasks.forEach((task) => {
    if (task.projectId === id) task.projectId = null;
  });
  state.projects = state.projects.filter((item) => item.id !== id);
  state.mode = "local_only";
  if (currentProjectId === id) switchView("projects");
  else render();
  showToast("Проект удалён. Его задачи перенесены во входящие.");
}

function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || !window.confirm("Удалить задачу «" + task.title + "»?")) return;
  state.tasks = state.tasks.filter((item) => item.id !== id);
  state.mode = "local_only";
  render();
  showToast("Задача удалена.");
}

function editableRecord(target) {
  const taskId = target.dataset.editTaskTitle;
  if (taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    return task ? { type: "task", record: task, field: "title", maxLength: 500 } : null;
  }
  const projectId = target.dataset.editProjectName;
  if (projectId) {
    const project = projectById(projectId);
    return project ? { type: "project", record: project, field: "name", maxLength: 100 } : null;
  }
  return null;
}

function normalizeEditableText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function syncEditedName(type, id, value) {
  const dataKey = type === "task" ? "editTaskTitle" : "editProjectName";
  document.querySelectorAll(type === "task" ? "[data-edit-task-title]" : "[data-edit-project-name]").forEach((element) => {
    if (element.dataset[dataKey] === id) element.textContent = value;
  });
  if (type !== "project") return;
  document.querySelectorAll("[data-project-name-label]").forEach((element) => {
    if (element.dataset.projectNameLabel === id) element.textContent = value;
  });
  document.querySelectorAll("option").forEach((option) => {
    if (option.value === id) option.textContent = value;
  });
  if (currentView === "project" && currentProjectId === id) {
    document.querySelector("#view-title").textContent = value;
  }
}

function finishInlineEdit(target) {
  const editable = editableRecord(target);
  if (!editable) return;
  const original = target.dataset.originalValue ?? editable.record[editable.field];
  if (target.dataset.cancelEdit === "true") {
    syncEditedName(editable.type, editable.record.id, original);
    return;
  }

  const value = normalizeEditableText(target.textContent);
  if (!value) {
    syncEditedName(editable.type, editable.record.id, original);
    showToast(editable.type === "task" ? "Название задачи не может быть пустым." : "Название проекта не может быть пустым.");
    return;
  }
  if (value.length > editable.maxLength) {
    syncEditedName(editable.type, editable.record.id, original);
    showToast("Название слишком длинное.");
    return;
  }
  if (editable.type === "project" && state.projects.some((project) => (
    project.id !== editable.record.id && project.name.toLowerCase() === value.toLowerCase()
  ))) {
    syncEditedName(editable.type, editable.record.id, original);
    showToast("Проект с таким названием уже есть.");
    return;
  }

  if (value === editable.record[editable.field]) {
    syncEditedName(editable.type, editable.record.id, value);
    return;
  }
  editable.record[editable.field] = value;
  editable.record.updatedAt = new Date().toISOString();
  state.mode = "local_only";
  saveState();
  syncEditedName(editable.type, editable.record.id, value);
  showToast(editable.type === "task" ? "Название задачи сохранено." : "Название проекта сохранено.");
}

function applyVisibleOrder(type, listId) {
  const container = document.getElementById(listId);
  if (!container) return;
  const selector = type === "task" ? "[data-task-id]" : "[data-project-id]";
  const ids = [...container.querySelectorAll(":scope > " + selector)].map((item) => (
    type === "task" ? item.dataset.taskId : item.dataset.projectId
  ));
  const collection = type === "task" ? state.tasks : state.projects;
  const slots = ids
    .map((id) => collection.find((item) => item.id === id)?.order)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  ids.forEach((id, index) => {
    const item = collection.find((entry) => entry.id === id);
    if (item) item.order = slots[index] ?? index;
  });
  state.mode = "local_only";
  render();
}

function beginDrag(event, type, id, listId) {
  const rowSelector = type === "task" ? ".task-row" : ".project-row";
  const row = event.target.closest(rowSelector);
  if (!row) return;
  event.preventDefault();
  dragState = { type, id, listId, row, rowSelector };
  row.classList.add("is-dragging");
  document.body.classList.add("is-reordering");
}

function moveDrag(event) {
  if (!dragState) return;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(dragState.rowSelector);
  if (!target || target === dragState.row || target.parentElement?.id !== dragState.listId) return;
  const rect = target.getBoundingClientRect();
  if (event.clientY < rect.top + rect.height / 2) target.before(dragState.row);
  else target.after(dragState.row);
}

function endDrag() {
  if (!dragState) return;
  const type = dragState.type;
  const listId = dragState.listId;
  dragState.row.classList.remove("is-dragging");
  document.body.classList.remove("is-reordering");
  dragState = null;
  applyVisibleOrder(type, listId);
  showToast(type === "task" ? "Порядок задач сохранён." : "Порядок проектов сохранён.");
}

function moveByKeyboard(type, id, listId, direction) {
  const container = document.getElementById(listId);
  if (!container) return;
  const selector = type === "task" ? "[data-task-id]" : "[data-project-id]";
  const rows = [...container.querySelectorAll(":scope > " + selector)];
  const index = rows.findIndex((row) => (
    type === "task" ? row.dataset.taskId : row.dataset.projectId
  ) === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= rows.length) return;
  if (direction < 0) rows[next].before(rows[index]);
  else rows[next].after(rows[index]);
  applyVisibleOrder(type, listId);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function exportData() {
  const payload = {
    schema: "elcapitano-task-register-v2",
    exportedAt: new Date().toISOString(),
    projects: state.projects,
    tasks: state.tasks,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "elcapitano-tasks-" + todayIso() + ".json";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("JSON экспортирован.");
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-target]");
  if (viewButton) switchView(viewButton.dataset.viewTarget);

  const projectButton = event.target.closest("[data-open-project]");
  if (projectButton) switchView("project", projectButton.dataset.openProject);

  const completeButton = event.target.closest("[data-toggle-complete]");
  if (completeButton) toggleComplete(completeButton.dataset.toggleComplete);

  const deleteTaskButton = event.target.closest("[data-delete-task]");
  if (deleteTaskButton) deleteTask(deleteTaskButton.dataset.deleteTask);

  const deleteProjectButton = event.target.closest("[data-delete-project]");
  if (deleteProjectButton) deleteProject(deleteProjectButton.dataset.deleteProject);

  if (event.target.closest("[data-open-project-dialog]")) openProjectDialog();
  if (event.target.closest("[data-close-project-dialog]")) closeProjectDialog();
  if (event.target.closest("[data-focus-capture]")) {
    if (currentView !== "tasks") switchView("tasks");
    setTimeout(() => document.querySelector("#task-capture").focus(), 0);
  }
});

document.addEventListener("change", (event) => {
  const projectSelect = event.target.closest("[data-task-project]");
  if (projectSelect) {
    const task = state.tasks.find((item) => item.id === projectSelect.dataset.taskProject);
    if (!task) return;
    if (projectSelect.value === "__new__") {
      projectSelect.value = task.projectId || "";
      openProjectDialog({ taskId: task.id });
    } else {
      task.projectId = projectSelect.value || null;
      state.mode = "local_only";
      render();
    }
  }

  const statusSelect = event.target.closest("[data-task-status]");
  if (statusSelect) {
    const task = state.tasks.find((item) => item.id === statusSelect.dataset.taskStatus);
    if (!task) return;
    task.status = statusSelect.value;
    task.completedAt = task.status === "done" ? task.completedAt || todayIso() : null;
    state.mode = "local_only";
    render();
  }

  const completionDate = event.target.closest("[data-task-completed-at]");
  if (completionDate) setCompletedAt(completionDate.dataset.taskCompletedAt, completionDate.value);

  const captureProject = event.target.closest("[data-capture-project]");
  if (captureProject?.value === "__new__") {
    captureProject.value = "";
    openProjectDialog({ captureForm: captureProject.closest("form") });
  }
});

document.addEventListener("pointerdown", (event) => {
  const taskHandle = event.target.closest("[data-drag-task]");
  if (taskHandle) beginDrag(event, "task", taskHandle.dataset.dragTask, taskHandle.dataset.listId);
  const projectHandle = event.target.closest("[data-drag-project]");
  if (projectHandle) beginDrag(event, "project", projectHandle.dataset.dragProject, projectHandle.dataset.listId);
});

document.addEventListener("pointermove", moveDrag);
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

document.addEventListener("keydown", (event) => {
  const editableName = event.target.closest("[data-edit-task-title], [data-edit-project-name]");
  if (editableName && ["Enter", "Escape"].includes(event.key)) {
    event.preventDefault();
    if (event.key === "Escape") editableName.dataset.cancelEdit = "true";
    editableName.blur();
    return;
  }

  const taskHandle = event.target.closest("[data-drag-task]");
  const projectHandle = event.target.closest("[data-drag-project]");
  const handle = taskHandle || projectHandle;
  if (!handle || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  moveByKeyboard(
    taskHandle ? "task" : "project",
    taskHandle?.dataset.dragTask || projectHandle.dataset.dragProject,
    handle.dataset.listId,
    event.key === "ArrowUp" ? -1 : 1
  );
});

document.addEventListener("focusin", (event) => {
  const editableName = event.target.closest("[data-edit-task-title], [data-edit-project-name]");
  if (!editableName) return;
  const editable = editableRecord(editableName);
  if (!editable) return;
  editableName.dataset.originalValue = editable.record[editable.field];
  delete editableName.dataset.cancelEdit;
});

document.addEventListener("focusout", (event) => {
  const editableName = event.target.closest("[data-edit-task-title], [data-edit-project-name]");
  if (editableName) finishInlineEdit(editableName);
});

document.addEventListener("paste", (event) => {
  const editableName = event.target.closest("[data-edit-task-title], [data-edit-project-name]");
  if (!editableName) return;
  event.preventDefault();
  const text = normalizeEditableText(event.clipboardData?.getData("text/plain"));
  document.execCommand("insertText", false, text);
});

document.querySelectorAll("[data-capture-form]").forEach((form) => form.addEventListener("submit", addTasks));
document.querySelector("#project-form").addEventListener("submit", createProject);
document.querySelector("#task-search").addEventListener("input", renderTasks);
document.querySelector("#project-filter").addEventListener("change", renderTasks);
document.querySelector("#status-filter").addEventListener("change", renderTasks);
document.querySelector("#analytics-period").addEventListener("change", renderAnalytics);
document.querySelector("#delete-project-button").addEventListener("click", () => deleteProject(currentProjectId));
document.querySelector("#export-button").addEventListener("click", exportData);
document.querySelector("#dismiss-notice").addEventListener("click", () => {
  document.querySelector("#prototype-notice").hidden = true;
  localStorage.setItem(NOTICE_KEY, "1");
});
document.querySelector("#remove-demo").addEventListener("click", () => {
  const demoProjectIds = new Set(state.projects.filter((project) => project.isDemo).map((project) => project.id));
  state.tasks = state.tasks.filter((task) => !task.isDemo);
  state.projects = state.projects.filter((project) => !demoProjectIds.has(project.id) || state.tasks.some((task) => task.projectId === project.id));
  state.mode = "local_only";
  document.querySelector("#prototype-notice").hidden = true;
  localStorage.setItem(NOTICE_KEY, "1");
  render();
  showToast("Демо удалено. Можно заносить свои задачи.");
});

if (localStorage.getItem(NOTICE_KEY)) document.querySelector("#prototype-notice").hidden = true;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
render();
