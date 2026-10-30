// Logic of the online Schengen calculator embedded on index.html (#calculator).
// Ported unchanged from the former schengen-calculator.html page, so saved trips
// (localStorage key schengen_calculator_trips) survive the move to one page.
// The landing's own setLang() translates the static markup via data-i18n and
// then calls window.calcSetLang(lang) so texts rendered here follow along.

// Standard 90/180 Schengen Calculator core ported from the Flutter reference app
class SchengenCalculator {
    static STAY_LIMIT_DAYS = 90;
    static ROLLING_WINDOW_LENGTH = 180;

    constructor(trips) {
        this.trips = trips || [];
    }

    usedDaysOn(day) {
        const target = toDateOnly(day);
        const cutoff = new Date(target);
        cutoff.setUTCDate(cutoff.getUTCDate() - (SchengenCalculator.ROLLING_WINDOW_LENGTH - 1));

        let used = 0;
        for (const trip of this.trips) {
            const start = parseInputDate(trip.start);
            const end = parseInputDate(trip.end);

            if (!start || !end) continue;

            // Skip trips completely outside the 180-day window ending on target
            if (end < cutoff || start > target) {
                continue;
            }

            // Clamp stays to rolling window boundaries
            const clampedStart = start < cutoff ? cutoff : start;
            const clampedEnd = end > target ? target : end;

            used += this._inclusiveDayCount(clampedStart, clampedEnd);
        }

        return used;
    }

    remainingDaysOn(day) {
        return SchengenCalculator.STAY_LIMIT_DAYS - this.usedDaysOn(day);
    }

    _inclusiveDayCount(start, end) {
        const diffTime = Math.abs(end - start);
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        return diffDays + 1;
    }
}

// Timezone-safe UTC date helpers
function toDateOnly(date) {
    const d = new Date(date);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function parseInputDate(str) {
    if (!str) return null;
    const parts = str.split('-');
    if (parts.length !== 3) return null;
    return new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
}

function formatToInputDate(date) {
    if (!date) return "";
    const d = new Date(date);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatDisplayDate(dateStr, lang) {
    const d = parseInputDate(dateStr);
    if (!d) return "";
    const options = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
    return d.toLocaleDateString(lang === 'ua' ? 'uk-UA' : 'en-US', options);
}

// Application state
let trips = [];
let currentLang = 'en';

function loadTripsFromStorage() {
    const stored = localStorage.getItem('schengen_calculator_trips');
    if (stored) {
        try {
            trips = JSON.parse(stored);
        } catch(e) {
            trips = [];
        }
    } else {
        trips = [];
    }
}

function saveTripsToStorage() {
    localStorage.setItem('schengen_calculator_trips', JSON.stringify(trips));
}

function resetFormToAddMode() {
    document.getElementById('edit-trip-id').value = "";
    document.getElementById('trip-form').reset();

    const titleEl = document.getElementById('form-title');
    if (titleEl) {
        titleEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 22px; height: 22px; color: var(--secondary);"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> ${currentLang === 'ua' ? 'Додати нову поїздку' : 'Add a New Stay'}`;
    }

    const submitBtn = document.getElementById('form-submit-btn');
    if (submitBtn) {
        submitBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> ${currentLang === 'ua' ? 'Додати' : 'Add Stay'}`;
    }

    document.getElementById('form-cancel-btn').style.display = "none";
    document.getElementById('form-alert').style.display = "none";
}

// Toggle the visibility of the add/edit stay form embedded in the checklist
function toggleAddStayForm(forceShow) {
    const formCard = document.getElementById('form-card');
    const toggleBtn = document.getElementById('toggle-add-stay-btn');
    if (!formCard || !toggleBtn) return;

    const isShowing = formCard.style.display !== 'none';
    const shouldShow = forceShow !== undefined ? forceShow : !isShowing;

    if (shouldShow) {
        formCard.style.display = 'block';
        toggleBtn.className = "cbtn cbtn-sm cbtn-secondary";
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> <span class="btn-text">${currentLang === 'ua' ? 'Закрити' : 'Close'}</span>`;
    } else {
        formCard.style.display = 'none';
        toggleBtn.className = "cbtn cbtn-sm cbtn-primary";
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> <span class="btn-text">${currentLang === 'ua' ? 'Додати' : 'Add Stay'}</span>`;

        // Reset form state to add mode on collapse if it was in edit mode
        const editId = document.getElementById('edit-trip-id').value;
        if (editId) {
            resetFormToAddMode();
        }
    }
}

// SVG circular progress
let _circle = null;
let _circumference = 0;

function setCircleProgress(usedDays) {
    if (!_circle) {
        _circle = document.querySelector('#calculator .progress-ring__circle');
        if (!_circle) return;
        const radius = _circle.r.baseVal.value;
        _circumference = radius * 2 * Math.PI;
        _circle.style.strokeDasharray = `${_circumference} ${_circumference}`;
        _circle.style.strokeDashoffset = _circumference;
    }
    const limit = SchengenCalculator.STAY_LIMIT_DAYS;
    const percent = Math.min(100, Math.max(0, (usedDays / limit) * 100));
    const offset = _circumference - (percent / 100 * _circumference);
    _circle.style.strokeDashoffset = offset;

    if (usedDays > limit) {
        _circle.style.stroke = 'var(--secondary)'; // Danger red
    } else if (usedDays >= 75) {
        _circle.style.stroke = 'var(--color-warning)'; // Warning amber
    } else {
        _circle.style.stroke = 'var(--color-safe)'; // Safe green
    }
}

// Recalculate statistics and redraw UI
function recalculateDashboard() {
    const dateInput = document.getElementById('inspect-date');
    let inspectorDate = parseInputDate(dateInput.value);
    if (!inspectorDate) {
        inspectorDate = toDateOnly(new Date());
        dateInput.value = formatToInputDate(inspectorDate);
    }

    const calc = new SchengenCalculator(trips);
    const usedDays = calc.usedDaysOn(inspectorDate);
    const remaining = calc.remainingDaysOn(inspectorDate);

    document.getElementById('days-left-val').textContent = remaining >= 0 ? remaining : 0;
    document.getElementById('days-used-val').textContent = usedDays;

    setCircleProgress(usedDays);

    // Rolling window boundaries
    const cutoffDate = new Date(inspectorDate);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 179);

    const startStr = formatDisplayDate(formatToInputDate(cutoffDate), currentLang);
    const endStr = formatDisplayDate(formatToInputDate(inspectorDate), currentLang);

    const windowPrefix = currentLang === 'ua' ? 'Плаваюче вікно' : 'Rolling window';
    document.getElementById('rolling-period-dates').textContent = `${windowPrefix}: ${startStr} – ${endStr}`;

    // Status text and banner
    const statusTextVal = document.getElementById('status-text-val');
    const banner = document.getElementById('status-banner-card');
    const bannerIcon = document.getElementById('status-banner-icon');
    const bannerText = document.getElementById('status-banner-text');

    if (usedDays > SchengenCalculator.STAY_LIMIT_DAYS) {
        statusTextVal.textContent = currentLang === 'ua' ? "Перевищено ліміт!" : "Limit Exceeded!";
        statusTextVal.style.color = 'var(--secondary)';

        banner.className = "status-banner danger";
        bannerText.textContent = currentLang === 'ua'
            ? "Порушення ліміту перебування! Ви перевищили дозволені 90 днів у цьому плаваючому вікні!"
            : "Visa Overstay! You have exceeded the 90-day allowance in this rolling window!";
        bannerIcon.innerHTML = `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>`;
    } else if (usedDays >= 75) {
        statusTextVal.textContent = currentLang === 'ua' ? "Увага" : "Warning";
        statusTextVal.style.color = 'var(--color-warning)';

        banner.className = "status-banner warning";
        bannerText.textContent = currentLang === 'ua'
            ? "Ви наближаєтеся до ліміту в 90 днів у Шенгенській зоні!"
            : "You are approaching your 90-day limit in the Schengen zone!";
        bannerIcon.innerHTML = `<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>`;
    } else {
        statusTextVal.textContent = currentLang === 'ua' ? "Безпечно" : "Safe";
        statusTextVal.style.color = 'var(--color-safe)';

        banner.className = "status-banner safe";
        bannerText.textContent = currentLang === 'ua'
            ? "У вас достатньо днів для подорожей."
            : "You have plenty of days left for your travels.";
        bannerIcon.innerHTML = `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>`;
    }

    if (typeof renderCalendar === 'function') {
        renderCalendar();
    }
}

// Render the checklist of stays
function renderTimelineList() {
    const listContainer = document.getElementById('trip-timeline-list');
    const tripCountBadge = document.getElementById('trip-count');

    const textPart = currentLang === 'ua' ? 'поїзд.' : `trip${trips.length === 1 ? '' : 's'}`;
    tripCountBadge.innerHTML = `<span class="count-num">${trips.length}</span><span class="count-text"> ${textPart}</span>`;

    if (trips.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <h4>${currentLang === 'ua' ? 'Немає поїздок' : 'No trips added yet'}</h4>
                <p>${currentLang === 'ua' ? 'Додайте свою першу поїздку, щоб розпочати відстеження.' : 'Add your first stay to start tracking.'}</p>
            </div>
        `;
        toggleAddStayForm(true);
        return;
    }

    // Sort trips by start date descending
    const sortedTrips = [...trips].sort((a, b) => {
        return new Date(b.start) - new Date(a.start);
    });

    listContainer.innerHTML = "";

    sortedTrips.forEach(trip => {
        const s = parseInputDate(trip.start);
        const e = parseInputDate(trip.end);
        const diffDays = s && e ? Math.round(Math.abs(e - s) / (1000 * 60 * 60 * 24)) + 1 : 0;

        const card = document.createElement('div');
        card.className = "trip-card";

        const titleStr = trip.name ? trip.name : (currentLang === 'ua' ? `Подорож` : `Trip`);
        const datesRangeStr = `${formatDisplayDate(trip.start, currentLang)} – ${formatDisplayDate(trip.end, currentLang)}`;
        const durationLabel = currentLang === 'ua' ? `${diffDays} дн.` : `${diffDays} day${diffDays === 1 ? '' : 's'}`;

        card.innerHTML = `
            <div class="trip-card-details">
                <span class="trip-card-name">${escapeCalcHTML(titleStr)}</span>
                <div class="trip-card-dates">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <span>${datesRangeStr}</span>
                </div>
                <div>
                    <span class="trip-duration-badge">${durationLabel}</span>
                </div>
            </div>
            <div class="trip-card-actions">
                <button type="button" class="action-icon-btn edit-btn" onclick="startEditingTrip('${trip.id}')" title="${currentLang === 'ua' ? 'Редагувати' : 'Edit stay'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button type="button" class="action-icon-btn delete-btn" onclick="deleteTrip('${trip.id}')" title="${currentLang === 'ua' ? 'Видалити' : 'Delete stay'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

// Escape HTML to prevent injection
function escapeCalcHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Form operations
function handleFormSubmit(event) {
    event.preventDefault();
    const alertDiv = document.getElementById('form-alert');
    const alertText = document.getElementById('form-alert-text');
    alertDiv.style.display = "none";

    const nameInput = document.getElementById('trip-name').value.trim();
    const startInput = document.getElementById('trip-start').value;
    const endInput = document.getElementById('trip-end').value;
    const editId = document.getElementById('edit-trip-id').value;

    if (!startInput || !endInput) {
        alertText.textContent = currentLang === 'ua' ? "Обидві дати обов'язкові!" : "Both dates are required!";
        alertDiv.style.display = "flex";
        return;
    }

    const start = parseInputDate(startInput);
    const end = parseInputDate(endInput);

    if (end < start) {
        alertText.textContent = currentLang === 'ua'
            ? "Дата виїзду не може бути раніше дати в'їзду!"
            : "Exit date cannot be before entry date!";
        alertDiv.style.display = "flex";
        return;
    }

    if (editId) {
        const index = trips.findIndex(t => t.id === editId);
        if (index !== -1) {
            trips[index].name = nameInput;
            trips[index].start = startInput;
            trips[index].end = endInput;
        }
    } else {
        const newTrip = {
            id: String(Date.now()),
            name: nameInput,
            start: startInput,
            end: endInput
        };
        trips.push(newTrip);
    }

    saveTripsToStorage();
    resetFormToAddMode(); // Clean data for adding a new stay, but keep the form open

    recalculateDashboard();
    renderTimelineList();
}

function startEditingTrip(id) {
    const trip = trips.find(t => t.id === id);
    if (!trip) return;

    document.getElementById('edit-trip-id').value = trip.id;
    document.getElementById('trip-name').value = trip.name || "";
    document.getElementById('trip-start').value = trip.start;
    document.getElementById('trip-end').value = trip.end;

    toggleAddStayForm(true);

    const titleEl = document.getElementById('form-title');
    titleEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 22px; height: 22px; color: var(--secondary);"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> ${currentLang === 'ua' ? 'Редагувати поїздку' : 'Edit Stay'}`;

    const submitBtn = document.getElementById('form-submit-btn');
    submitBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> ${currentLang === 'ua' ? 'Зберегти' : 'Save Changes'}`;

    document.getElementById('form-cancel-btn').style.display = "inline-flex";

    const checklistCard = document.getElementById('checklist-card');
    if (checklistCard) {
        checklistCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function cancelEditing() {
    resetFormToAddMode();

    if (trips.length === 0) {
        toggleAddStayForm(true);
    } else {
        toggleAddStayForm(false);
    }
}

function deleteTrip(id) {
    const confirmMsg = currentLang === 'ua'
        ? "Ви впевнені, що хочете видалити цей період перебування?"
        : "Are you sure you want to delete this period of stay?";
    if (confirm(confirmMsg)) {
        trips = trips.filter(t => t.id !== id);
        saveTripsToStorage();

        if (document.getElementById('edit-trip-id').value === id) {
            cancelEditing();
        }

        recalculateDashboard();
        renderTimelineList();
    }
}

// Called by the landing's setLang() after it has applied data-i18n texts.
window.calcSetLang = function(lang) {
    currentLang = lang;

    recalculateDashboard();
    renderTimelineList();

    // Keep dynamic form texts in step with the edit state
    const editId = document.getElementById('edit-trip-id').value;
    if (editId) {
        startEditingTrip(editId);
    } else if (document.getElementById('form-card').style.display !== 'none') {
        resetFormToAddMode();
        toggleAddStayForm(true);
    }
};

// Calendar state and rendering
let calendarViewDate = new Date();

function changeCalendarMonth(offset) {
    calendarViewDate.setUTCMonth(calendarViewDate.getUTCMonth() + offset);
    renderCalendar();
}

function renderCalendar() {
    const weekdaysContainer = document.getElementById('calendar-weekdays-container');
    const daysContainer = document.getElementById('calendar-days-container');
    const monthYearLabel = document.getElementById('calendar-month-year-label');
    const inspectDateInput = document.getElementById('inspect-date');

    if (!weekdaysContainer || !daysContainer || !monthYearLabel || !inspectDateInput) return;

    let selectedDateStr = inspectDateInput.value;

    const year = calendarViewDate.getUTCFullYear();
    const month = calendarViewDate.getUTCMonth();

    const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNamesUa = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    const monthNames = currentLang === 'ua' ? monthNamesUa : monthNamesEn;

    monthYearLabel.textContent = `${monthNames[month]} ${year}`;

    const weekdaysEn = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const weekdaysUa = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
    const weekdaysList = currentLang === 'ua' ? weekdaysUa : weekdaysEn;

    weekdaysContainer.innerHTML = weekdaysList.map(day => `<div>${day}</div>`).join('');

    // Which day of the week the 1st of the month is (Monday = 0, Sunday = 6)
    const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
    let startDayOfWeek = firstDayOfMonth.getUTCDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const totalDaysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    daysContainer.innerHTML = '';

    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day-cell empty';
        daysContainer.appendChild(emptyCell);
    }

    const calc = new SchengenCalculator(trips);

    for (let day = 1; day <= totalDaysInMonth; day++) {
        const cellDate = new Date(Date.UTC(year, month, day));
        const cellDateStr = formatToInputDate(cellDate);

        const cell = document.createElement('div');
        cell.className = 'calendar-day-cell';

        if (cellDateStr === selectedDateStr) {
            cell.classList.add('selected');
        }

        const isTripDay = trips.some(t => {
            const start = parseInputDate(t.start);
            const end = parseInputDate(t.end);
            return start && end && cellDate >= start && cellDate <= end;
        });
        if (isTripDay) {
            cell.classList.add('trip-day');
        }

        const remaining = calc.remainingDaysOn(cellDate);

        let badgeClass = 'safe';
        if (remaining < 0) {
            badgeClass = 'danger';
        }

        cell.innerHTML = `
            <span class="day-number">${day}</span>
            <span class="remaining-count ${badgeClass}" title="${currentLang === 'ua' ? 'Залишилось днів: ' : 'Remaining days: '}${remaining}">${remaining}</span>
        `;

        cell.addEventListener('click', () => {
            inspectDateInput.value = cellDateStr;
            recalculateDashboard();
        });

        daysContainer.appendChild(cell);
    }
}

// Initialize the calculator
window.addEventListener('DOMContentLoaded', () => {
    loadTripsFromStorage();

    currentLang = localStorage.getItem('lang') || ((navigator.language && (navigator.language.startsWith('uk') || navigator.language.startsWith('ua'))) ? 'ua' : 'en');

    const today = toDateOnly(new Date());
    document.getElementById('inspect-date').value = formatToInputDate(today);
    calendarViewDate = new Date(today);

    recalculateDashboard();
    renderTimelineList();
});
