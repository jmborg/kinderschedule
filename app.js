const STORAGE_KEY = "kindergarten-week-schedule";
const BREAK_MINUTES = 30;
const EARLY_MONDAY_BREAK_MINUTES = 60;
const EARLY_MONDAY_THRESHOLD_MINUTES = 7 * 60 + 30;
const WEEKS_TO_SHOW = 18;

const DAYS = [
  { key: "monday", label: "Måndag" },
  { key: "tuesday", label: "Tisdag" },
  { key: "wednesday", label: "Onsdag" },
  { key: "thursday", label: "Torsdag" },
  { key: "friday", label: "Fredag" },
];

const emptyDay = () => ({ start: "", end: "" });
const emptyWeek = () => ({ days: Object.fromEntries(DAYS.map((day) => [day.key, emptyDay()])) });

const createEducator = (name) => ({
  id: crypto.randomUUID(),
  name,
  weeks: {},
});

const createDefaultPeriod = (startWeek) => {
  const weeks = createWeekOptions(startWeek, WEEKS_TO_SHOW);
  return {
    startWeek,
    endWeek: weeks[weeks.length - 1],
    excludedWeeks: [],
  };
};

let state = {
  selectedEducatorId: "",
  period: createDefaultPeriod(getCurrentWeekValue()),
  weeks: createWeekOptions(getCurrentWeekValue(), WEEKS_TO_SHOW),
  educators: [],
};

let modalExcludedWeeksDraft = new Set();
let modalResizeAnimation = null;

const elements = {
  periodButton: document.querySelector("#periodButton"),
  selectedPeriodLabel: document.querySelector("#selectedPeriodLabel"),
  periodModal: document.querySelector("#periodModal"),
  periodForm: document.querySelector("#periodForm"),
  periodStartInput: document.querySelector("#periodStartInput"),
  periodEndInput: document.querySelector("#periodEndInput"),
  periodWeekCount: document.querySelector("#periodWeekCount"),
  excludedWeeksPanel: document.querySelector(".excluded-weeks-panel"),
  excludedWeeksList: document.querySelector("#excludedWeeksList"),
  closePeriodModalButton: document.querySelector("#closePeriodModalButton"),
  cancelPeriodButton: document.querySelector("#cancelPeriodButton"),
  printButton: document.querySelector("#printButton"),
  printAllButton: document.querySelector("#printAllButton"),
  saveFileButton: document.querySelector("#saveFileButton"),
  openFileInput: document.querySelector("#openFileInput"),
  addEducatorForm: document.querySelector("#addEducatorForm"),
  educatorNameInput: document.querySelector("#educatorNameInput"),
  educatorList: document.querySelector("#educatorList"),
  educatorEmptyState: document.querySelector("#educatorEmptyState"),
  educatorCount: document.querySelector("#educatorCount"),
  focusEducatorInputButton: document.querySelector("#focusEducatorInputButton"),
  selectedEducatorName: document.querySelector("#selectedEducatorName"),
  planningRangeLabel: document.querySelector("#planningRangeLabel"),
  selectedTotal: document.querySelector("#selectedTotal"),
  emptyState: document.querySelector("#emptyState"),
  scheduleGrid: document.querySelector("#scheduleGrid"),
  educatorTemplate: document.querySelector("#educatorTemplate"),
  printAllOutput: document.querySelector("#printAllOutput"),
};

function init() {
  const savedState = loadFromBrowser();
  if (savedState) {
    state = savedState;
  }

  if (!state.selectedEducatorId && state.educators.length > 0) {
    state.selectedEducatorId = state.educators[0].id;
  }

  bindEvents();
  render();
}

function bindEvents() {
  elements.periodButton.addEventListener("click", openPeriodModal);
  elements.closePeriodModalButton.addEventListener("click", closePeriodModal);
  elements.cancelPeriodButton.addEventListener("click", closePeriodModal);
  elements.periodModal.addEventListener("click", (event) => {
    if (event.target === elements.periodModal) {
      closePeriodModal();
    }
  });

  bindPeriodInput(elements.periodStartInput);
  bindPeriodInput(elements.periodEndInput);
  elements.periodForm.addEventListener("submit", applyPeriodFromModal);

  elements.printButton.addEventListener("click", printSelectedSchedule);

  elements.printAllButton.addEventListener("click", printAllSchedules);

  elements.saveFileButton.addEventListener("click", saveScheduleFile);
  elements.openFileInput.addEventListener("change", openScheduleFile);
  elements.focusEducatorInputButton.addEventListener("click", () => {
    elements.educatorNameInput.focus();
  });

  elements.addEducatorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = elements.educatorNameInput.value.trim();
    if (!name) return;

    const educator = createEducator(name);
    state.educators.push(educator);
    state.selectedEducatorId = educator.id;
    elements.educatorNameInput.value = "";
    persist();
    render();
  });
}

function render() {
  ensureStateShape();
  elements.educatorCount.textContent = state.educators.length;
  elements.selectedPeriodLabel.textContent = formatPeriodSummary();
  renderEducators();
  renderSchedule();
  refreshTotals();
}

function openPeriodModal() {
  elements.periodStartInput.value = formatWeekInputValue(state.period.startWeek);
  elements.periodEndInput.value = formatWeekInputValue(state.period.endWeek, state.period.startWeek);
  modalExcludedWeeksDraft = new Set(state.period.excludedWeeks);
  elements.periodModal.hidden = false;
  renderExcludedWeeksOptions({ animate: false });
  elements.periodStartInput.focus();
}

function closePeriodModal() {
  elements.periodModal.hidden = true;
}

function bindPeriodInput(input) {
  input.addEventListener("input", renderExcludedWeeksOptions);
  input.addEventListener("change", renderExcludedWeeksOptions);
}

function renderExcludedWeeksOptions(options = {}) {
  const shouldAnimate = options.animate !== false && !elements.periodModal.hidden;
  if (shouldAnimate) {
    animateModalResize(renderExcludedWeeksOptionsContent);
    return;
  }

  renderExcludedWeeksOptionsContent();
}

function renderExcludedWeeksOptionsContent() {
  const periodInput = resolvePeriodInputs();
  const startWeek = periodInput?.startWeek;
  const endWeek = periodInput?.endWeek;
  const weeks = getPeriodWeekRange(startWeek, endWeek);

  elements.excludedWeeksList.replaceChildren();
  elements.periodWeekCount.textContent = `${weeks.length - [...modalExcludedWeeksDraft].filter((week) => weeks.includes(week)).length} veckor valda`;

  if (weeks.length === 0) {
    elements.excludedWeeksList.append(createGridCell("p", "empty-week-options", "Välj en giltig start- och slutvecka."));
    return;
  }

  weeks.forEach((week) => {
    const label = document.createElement("label");
    label.className = "excluded-week-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = week;
    checkbox.checked = modalExcludedWeeksDraft.has(week);
    checkbox.addEventListener("change", updatePeriodWeekCountPreview);

    label.append(checkbox, document.createTextNode(`Vecka ${formatWeekButtonLabel(week)}`));
    elements.excludedWeeksList.append(label);
  });
}

function animateModalResize(updateContent) {
  const panel = elements.excludedWeeksPanel;
  if (!panel || !("animate" in panel)) {
    updateContent();
    return;
  }

  modalResizeAnimation?.cancel();

  const startHeight = panel.getBoundingClientRect().height;
  panel.style.height = `${startHeight}px`;
  panel.style.overflow = "hidden";

  updateContent();

  panel.style.height = "auto";
  const endHeight = Math.min(panel.getBoundingClientRect().height, getMaxExcludedWeeksPanelHeight());
  panel.style.height = `${startHeight}px`;
  panel.offsetHeight;

  if (Math.abs(endHeight - startHeight) < 1) {
    panel.style.height = "";
    panel.style.overflow = "";
    return;
  }

  modalResizeAnimation = panel.animate(
    [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
    { duration: 1000, easing: "ease-in-out" },
  );

  modalResizeAnimation.onfinish = () => {
    panel.style.height = "";
    panel.style.overflow = "";
    modalResizeAnimation = null;
  };

  modalResizeAnimation.oncancel = () => {
    panel.style.height = "";
    panel.style.overflow = "";
  };
}

function getMaxExcludedWeeksPanelHeight() {
  return Math.min(420, window.innerHeight - 260);
}

function updatePeriodWeekCountPreview() {
  modalExcludedWeeksDraft = new Set(getCheckedExcludedWeeks());
  const totalWeeks = elements.excludedWeeksList.querySelectorAll("input").length;
  const excludedWeeks = elements.excludedWeeksList.querySelectorAll("input:checked").length;
  elements.periodWeekCount.textContent = `${totalWeeks - excludedWeeks} veckor valda`;
}

function getCheckedExcludedWeeks() {
  return [...elements.excludedWeeksList.querySelectorAll("input:checked")].map((input) => input.value);
}

function applyPeriodFromModal(event) {
  event.preventDefault();

  const periodInput = resolvePeriodInputs();
  const startWeek = periodInput?.startWeek;
  const endWeek = periodInput?.endWeek;
  const periodWeeks = getPeriodWeekRange(startWeek, endWeek);

  if (periodWeeks.length === 0) {
    window.alert("Välj en giltig period där slutveckan är samma eller senare än startveckan.");
    return;
  }

  const excludedWeeks = getCheckedExcludedWeeks();
  const includedWeeks = periodWeeks.filter((week) => !excludedWeeks.includes(week));

  if (includedWeeks.length === 0) {
    window.alert("Perioden behöver innehålla minst en vecka.");
    return;
  }

  state.period = { startWeek, endWeek, excludedWeeks };
  state.weeks = includedWeeks;
  persist();
  closePeriodModal();
  render();
}

function renderEducators() {
  elements.educatorList.replaceChildren();
  elements.educatorEmptyState.hidden = state.educators.length > 0;

  state.educators.forEach((educator) => {
    const row = elements.educatorTemplate.content.firstElementChild.cloneNode(true);
    const selectButton = row.querySelector(".educator-select");
    const removeButton = row.querySelector(".remove-educator");
    const total = row.querySelector(".educator-total");

    row.querySelector(".educator-name").textContent = educator.name;
    total.dataset.educatorId = educator.id;
    total.textContent = formatHours(getEducatorVisibleMinutes(educator));
    selectButton.setAttribute("aria-pressed", String(educator.id === state.selectedEducatorId));

    selectButton.addEventListener("click", () => {
      state.selectedEducatorId = educator.id;
      persist();
      render();
    });

    removeButton.addEventListener("click", () => {
      const shouldRemove = window.confirm(`Ta bort ${educator.name} från schemat?`);
      if (!shouldRemove) return;

      state.educators = state.educators.filter((item) => item.id !== educator.id);
      if (state.selectedEducatorId === educator.id) {
        state.selectedEducatorId = state.educators[0]?.id ?? "";
      }
      persist();
      render();
    });

    elements.educatorList.append(row);
  });
}

function renderSchedule() {
  const selectedEducator = getSelectedEducator();
  elements.scheduleGrid.replaceChildren();

  if (!selectedEducator) {
    elements.selectedEducatorName.textContent = "Ingen pedagog vald";
    elements.planningRangeLabel.textContent = formatPlanningRangeLabel();
    elements.emptyState.hidden = false;
    elements.scheduleGrid.hidden = true;
    return;
  }

  elements.selectedEducatorName.textContent = selectedEducator.name;
  elements.planningRangeLabel.textContent = formatPlanningRangeLabel();
  elements.emptyState.hidden = true;
  elements.scheduleGrid.hidden = false;

  const table = document.createElement("div");
  table.className = "week-table";
  table.setAttribute("role", "group");
  table.setAttribute("aria-label", `Schema för ${selectedEducator.name}, ${state.weeks.length} veckor`);

  table.append(createGridCell("div", "week-heading", ""));
  DAYS.forEach((day) => {
    table.append(createGridCell("div", "day-heading", day.label));
  });
  table.append(createGridCell("div", "sum-heading", "Summa"));

  state.weeks.forEach((weekKey) => {
    appendWeekRow(table, selectedEducator, weekKey);
  });

  elements.scheduleGrid.append(table);
}

function appendWeekRow(table, educator, weekKey) {
  const week = getEducatorWeek(educator, weekKey);
  const weekCell = createGridCell("div", "week-cell", formatWeekButtonLabel(weekKey));
  table.append(weekCell);

  DAYS.forEach((day) => {
    const cell = document.createElement("div");
    cell.className = "time-cell";
    cell.append(
      createTimeField(weekKey, day.key, "start", week.days[day.key]?.start ?? ""),
      createTimeField(weekKey, day.key, "end", week.days[day.key]?.end ?? ""),
    );
    table.append(cell);
  });

  const educatorTotal = createGridCell("div", "week-total educator-week-total", formatHours(getEducatorMinutes(educator, weekKey)));
  educatorTotal.dataset.weekKey = weekKey;
  table.append(educatorTotal);
}

function createTimeField(weekKey, dayKey, field, value) {
  const label = document.createElement("label");
  label.className = "time-field";

  const input = document.createElement("input");
  input.className = "time-input";
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.placeholder = field === "start" ? "08:00" : "16:30";
  input.value = value;
  input.setAttribute("aria-label", `${field === "start" ? "Start" : "Slut"} ${formatWeekLabel(weekKey)} ${getDayLabel(dayKey)}`);

  input.addEventListener("focus", () => {
    input.select();
  });

  input.addEventListener("change", () => {
    commitTimeInput(input, weekKey, dayKey, field);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (commitTimeInput(input, weekKey, dayKey, field)) {
      focusNextTimeInput(input);
    }
  });

  label.append(input);
  return label;
}

function commitTimeInput(input, weekKey, dayKey, field) {
  const normalizedTime = normalizeTimeInput(input.value);

  if (normalizedTime === null) {
    input.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");
    return false;
  }

  input.classList.remove("invalid");
  input.removeAttribute("aria-invalid");
  input.value = normalizedTime;
  updateDay(weekKey, dayKey, { [field]: normalizedTime });
  return true;
}

function focusNextTimeInput(currentInput) {
  const inputs = [...document.querySelectorAll(".time-input")];
  const currentIndex = inputs.indexOf(currentInput);
  const nextInput = inputs[currentIndex + 1];
  if (nextInput) {
    nextInput.focus();
  }
}

function updateDay(weekKey, dayKey, patch) {
  const selectedEducator = getSelectedEducator();
  if (!selectedEducator) return;

  const week = getEducatorWeek(selectedEducator, weekKey);
  week.days[dayKey] = {
    ...(week.days[dayKey] ?? emptyDay()),
    ...patch,
  };

  persist();
  refreshTotals();
}

function printSelectedSchedule() {
  const selectedEducator = getSelectedEducator();
  const educatorName = selectedEducator?.name ?? "schema";
  printWithTemporaryTitle(`Solstickan Förskola - ${educatorName} - ${formatPlanningRangeLabel()}`);
}

function printAllSchedules() {
  printWithTemporaryTitle(
    `Solstickan Förskola - alla pedagoger - ${formatPlanningRangeLabel()}`,
    () => {
      renderPrintAllOutput();
      document.body.classList.add("printing-all");
    },
    () => {
      document.body.classList.remove("printing-all");
      elements.printAllOutput.replaceChildren();
    },
  );
}

function printWithTemporaryTitle(title, beforePrint, afterPrint) {
  const previousTitle = document.title;
  document.title = sanitizeFileTitle(title);
  beforePrint?.();

  const cleanup = () => {
    afterPrint?.();
    document.title = previousTitle;
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  window.print();
}

function sanitizeFileTitle(title) {
  return title
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function renderPrintAllOutput() {
  elements.printAllOutput.replaceChildren();

  const heading = document.createElement("header");
  heading.className = "print-all-header";
  heading.append(
    createGridCell("p", "eyebrow", "Solstickan Förskola"),
    createGridCell("p", "planning-range", formatPlanningRangeLabel()),
  );
  elements.printAllOutput.append(heading);

  state.educators.forEach((educator) => {
    const section = document.createElement("section");
    section.className = "print-educator-section";

    const header = document.createElement("div");
    header.className = "print-educator-header";
    header.append(
      createGridCell("h2", "", educator.name),
      createGridCell("strong", "", formatHours(getEducatorVisibleMinutes(educator))),
    );

    section.append(header, createStaticWeekTable(educator));
    elements.printAllOutput.append(section);
  });
}

function createStaticWeekTable(educator) {
  const table = document.createElement("div");
  table.className = "week-table print-week-table";

  table.append(createGridCell("div", "week-heading", ""));
  DAYS.forEach((day) => {
    table.append(createGridCell("div", "day-heading", day.label));
  });
  table.append(createGridCell("div", "sum-heading", "Summa"));

  state.weeks.forEach((weekKey) => {
    const week = getEducatorWeek(educator, weekKey);
    table.append(createGridCell("div", "week-cell", formatWeekButtonLabel(weekKey)));

    DAYS.forEach((day) => {
      const dayValue = week.days[day.key] ?? emptyDay();
      const value = dayValue.start || dayValue.end ? `${dayValue.start || "--:--"} - ${dayValue.end || "--:--"}` : "";
      table.append(createGridCell("div", "static-time-cell", value));
    });

    table.append(createGridCell("div", "week-total", formatHours(getEducatorMinutes(educator, weekKey))));
  });

  return table;
}

async function saveScheduleFile() {
  const lastWeek = state.weeks[state.weeks.length - 1] || "";
  const fileName = `veckoschema-${state.weeks[0] || "utan-vecka"}-${lastWeek}.json`;
  const snapshot = createScheduleSnapshot();
  const content = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([content], { type: "application/json" });

  if ("showSaveFilePicker" in window) {
    try {
      const handle = await window.showSaveFilePicker({
        id: "kindergarten-schedules",
        suggestedName: fileName,
        types: [
          {
            description: "Schemafil",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  window.alert("Din webbläsare tillåter inte att appen väljer plats direkt. Filen laddas ner till webbläsarens standardmapp.");
  downloadScheduleSnapshot(fileName, snapshot);
}

function openScheduleFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const importedState = normalizeState(JSON.parse(reader.result));
      if (!importedState) {
        window.alert("Filen verkar inte vara en giltig schemafil.");
        return;
      }
      state = importedState;
      persist();
      render();
    } catch {
      window.alert("Filen kunde inte läsas.");
    } finally {
      elements.openFileInput.value = "";
    }
  });
  reader.readAsText(file);
}

function createScheduleSnapshot() {
  return { version: 3, ...state };
}

function downloadScheduleSnapshot(fileName, snapshot) {
  const link = document.createElement("a");
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function refreshTotals() {
  const selectedEducator = getSelectedEducator();

  elements.selectedTotal.textContent = selectedEducator
    ? formatHours(getEducatorVisibleMinutes(selectedEducator))
    : "0 h";

  document.querySelectorAll(".educator-total[data-educator-id]").forEach((total) => {
    const educator = state.educators.find((item) => item.id === total.dataset.educatorId);
    total.textContent = educator ? formatHours(getEducatorVisibleMinutes(educator)) : "0 h";
  });

  document.querySelectorAll(".educator-week-total[data-week-key]").forEach((total) => {
    total.textContent = selectedEducator
      ? formatHours(getEducatorMinutes(selectedEducator, total.dataset.weekKey))
      : "0 h";
  });
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadFromBrowser() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return null;
  }
}

function normalizeState(value) {
  if (!value || !Array.isArray(value.educators)) return null;

  const importedWeeks = Array.isArray(value.weeks)
    ? value.weeks.filter((week) => typeof week === "string" && isWeekValue(week))
    : [];
  const baseWeek = typeof value.period?.startWeek === "string" && isWeekValue(value.period.startWeek)
    ? value.period.startWeek
    : importedWeeks[0] || (typeof value.week === "string" && isWeekValue(value.week) ? value.week : getCurrentWeekValue());
  const period = normalizePeriod(value.period, importedWeeks, baseWeek);
  const weeks = getIncludedPeriodWeeks(period);

  const educators = value.educators
    .filter((educator) => educator && typeof educator.name === "string")
    .map((educator) => normalizeEducator(educator, baseWeek));

  const selectedEducatorId = educators.some((educator) => educator.id === value.selectedEducatorId)
    ? value.selectedEducatorId
    : educators[0]?.id ?? "";

  return {
    selectedEducatorId,
    period,
    weeks,
    educators,
  };
}

function normalizeEducator(educator, baseWeek) {
  const weeks = {};

  if (educator.weeks && typeof educator.weeks === "object") {
    Object.entries(educator.weeks).forEach(([weekKey, week]) => {
      weeks[weekKey] = normalizeWeek(week);
    });
  }

  if (educator.days && typeof educator.days === "object") {
    weeks[baseWeek] = normalizeWeek({ days: educator.days });
  }

  return {
    id: educator.id || crypto.randomUUID(),
    name: educator.name.trim() || "Namnlös pedagog",
    weeks,
  };
}

function normalizeWeek(week) {
  return {
    days: Object.fromEntries(
      DAYS.map((day) => {
        const importedDay = week?.days?.[day.key] ?? {};
        return [
          day.key,
          {
            start: normalizeTimeInput(importedDay.start) ?? "",
            end: normalizeTimeInput(importedDay.end) ?? "",
          },
        ];
      }),
    ),
  };
}

function normalizePeriod(period, importedWeeks, baseWeek) {
  if (period && isWeekValue(period.startWeek) && isWeekValue(period.endWeek)) {
    const range = getPeriodWeekRange(period.startWeek, period.endWeek);
    if (range.length === 0) {
      return createDefaultPeriod(baseWeek || getCurrentWeekValue());
    }

    const excludedWeeks = Array.isArray(period.excludedWeeks)
      ? period.excludedWeeks.filter((week) => range.includes(week))
      : [];

    return ensurePeriodHasIncludedWeek({
      startWeek: period.startWeek,
      endWeek: period.endWeek,
      excludedWeeks,
    });
  }

  if (importedWeeks.length > 0) {
    const sortedWeeks = [...new Set(importedWeeks)].sort(compareWeekValues);
    const startWeek = sortedWeeks[0];
    const endWeek = sortedWeeks[sortedWeeks.length - 1];
    const range = getPeriodWeekRange(startWeek, endWeek);
    return ensurePeriodHasIncludedWeek({
      startWeek,
      endWeek,
      excludedWeeks: range.filter((week) => !sortedWeeks.includes(week)),
    });
  }

  return createDefaultPeriod(baseWeek || getCurrentWeekValue());
}

function ensurePeriodHasIncludedWeek(period) {
  return getIncludedPeriodWeeks(period).length > 0
    ? period
    : { ...period, excludedWeeks: [] };
}

function getIncludedPeriodWeeks(period) {
  const excludedWeeks = new Set(period.excludedWeeks || []);
  return getPeriodWeekRange(period.startWeek, period.endWeek).filter((week) => !excludedWeeks.has(week));
}

function ensureStateShape() {
  state.period = normalizePeriod(state.period, state.weeks, state.period?.startWeek || state.weeks[0] || getCurrentWeekValue());
  state.weeks = getIncludedPeriodWeeks(state.period);

  state.educators.forEach((educator) => {
    state.weeks.forEach((week) => {
      getEducatorWeek(educator, week);
    });
  });
}

function getSelectedEducator() {
  return state.educators.find((educator) => educator.id === state.selectedEducatorId);
}

function getEducatorWeek(educator, weekKey) {
  if (!educator.weeks) {
    educator.weeks = {};
  }

  if (!educator.weeks[weekKey]) {
    educator.weeks[weekKey] = emptyWeek();
  }

  return educator.weeks[weekKey];
}

function getEducatorMinutes(educator, weekKey) {
  const week = getEducatorWeek(educator, weekKey);
  return DAYS.reduce((sum, day) => sum + getDayMinutes(week.days[day.key], day.key), 0);
}

function getEducatorVisibleMinutes(educator) {
  return state.weeks.reduce((sum, weekKey) => sum + getEducatorMinutes(educator, weekKey), 0);
}

function getDayMinutes(day, dayKey) {
  if (!day?.start || !day?.end) return 0;

  const start = parseTime(day.start);
  const end = parseTime(day.end);
  if (start === null || end === null || end <= start) return 0;

  return Math.max(0, end - start - getBreakMinutes(dayKey, start));
}

function getBreakMinutes(dayKey, startMinutes) {
  if (dayKey === "monday" && startMinutes < EARLY_MONDAY_THRESHOLD_MINUTES) {
    return EARLY_MONDAY_BREAK_MINUTES;
  }

  return BREAK_MINUTES;
}

function normalizeTimeInput(value) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") value = String(value);
  const trimmed = value.trim();
  if (!trimmed) return "";

  let hours;
  let minutes;

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length !== 2) return null;
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
  } else {
    const digits = trimmed.replace(/\D/g, "");
    if (!digits || digits.length > 4) return null;

    if (digits.length <= 2) {
      hours = Number(digits);
      minutes = 0;
    } else {
      hours = Number(digits.slice(0, -2));
      minutes = Number(digits.slice(-2));
    }
  }

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function formatHours(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function formatWeekButtonLabel(weekValue) {
  return weekValue.slice(-2);
}

function formatWeekInputValue(weekValue, referenceWeek) {
  if (!referenceWeek || weekValue.slice(0, 4) === referenceWeek.slice(0, 4)) {
    return String(Number(weekValue.slice(-2)));
  }

  return weekValue;
}

function resolvePeriodInputs() {
  const baseYear = Number((state.period?.startWeek || getCurrentWeekValue()).slice(0, 4));
  const startWeek = parseWeekInput(elements.periodStartInput.value, baseYear);
  if (!startWeek) return null;

  const explicitEndYear = hasExplicitWeekYear(elements.periodEndInput.value);
  let endWeek = parseWeekInput(elements.periodEndInput.value, Number(startWeek.slice(0, 4)));
  if (!endWeek) return null;

  if (!explicitEndYear && compareWeekValues(startWeek, endWeek) > 0) {
    endWeek = parseWeekInput(elements.periodEndInput.value, Number(startWeek.slice(0, 4)) + 1);
  }

  return { startWeek, endWeek };
}

function parseWeekInput(value, fallbackYear) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) return null;

  const fullMatch = /^(\d{4})\s*(?:-?w|v\.?|vecka)?\s*(\d{1,2})$/.exec(trimmed);
  const weekOnlyMatch = /^(?:w|v\.?|vecka)?\s*(\d{1,2})$/.exec(trimmed);
  const year = fullMatch ? Number(fullMatch[1]) : fallbackYear;
  const week = Number(fullMatch ? fullMatch[2] : weekOnlyMatch?.[1]);

  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
    return null;
  }

  return `${year}-W${String(week).padStart(2, "0")}`;
}

function hasExplicitWeekYear(value) {
  return /^\s*\d{4}/.test(String(value || ""));
}

function formatPeriodSummary() {
  const includedWeeks = state.weeks.length;
  const excludedWeeks = state.period.excludedWeeks.length;
  const excludedText = excludedWeeks > 0 ? `, ${excludedWeeks} exkl.` : "";
  return `v.${formatWeekButtonLabel(state.period.startWeek)}-v.${formatWeekButtonLabel(state.period.endWeek)} · ${includedWeeks} veckor${excludedText}`;
}

function formatPlanningRangeLabel() {
  return `vecka ${formatWeekButtonLabel(state.period.startWeek)} till vecka ${formatWeekButtonLabel(state.period.endWeek)}`;
}

function getDayLabel(dayKey) {
  return DAYS.find((day) => day.key === dayKey)?.label ?? dayKey;
}

function formatWeekLabel(weekValue) {
  return weekValue ? `Vecka ${weekValue.slice(-2)}, ${weekValue.slice(0, 4)}` : "Ingen vecka vald";
}

function createGridCell(tagName, className, textContent) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = textContent;
  return element;
}

function createWeekOptions(startWeek, count) {
  const startDate = getDateFromWeekValue(startWeek);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + index * 7);
    return getWeekValueFromDate(date);
  });
}

function getPeriodWeekRange(startWeek, endWeek) {
  if (!isWeekValue(startWeek) || !isWeekValue(endWeek)) return [];
  if (compareWeekValues(startWeek, endWeek) > 0) return [];

  const weeks = [];
  const endDate = getDateFromWeekValue(endWeek);
  const date = getDateFromWeekValue(startWeek);

  while (date <= endDate && weeks.length < 104) {
    weeks.push(getWeekValueFromDate(date));
    date.setUTCDate(date.getUTCDate() + 7);
  }

  return weeks;
}

function compareWeekValues(firstWeek, secondWeek) {
  return getDateFromWeekValue(firstWeek) - getDateFromWeekValue(secondWeek);
}

function isWeekValue(value) {
  return typeof value === "string" && /^\d{4}-W\d{2}$/.test(value);
}

function getCurrentWeekValue() {
  return getWeekValueFromDate(new Date());
}

function getWeekValueFromDate(sourceDate) {
  const date = new Date(Date.UTC(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getDateFromWeekValue(weekValue) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekValue);
  if (!match) return new Date();

  const year = Number(match[1]);
  const week = Number(match[2]);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  simple.setUTCDate(simple.getUTCDate() + 1 - day);
  return simple;
}

init();
