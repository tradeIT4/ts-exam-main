const $ = (id) => document.getElementById(id);
const number = new Intl.NumberFormat();
const state = { loading: false };

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function percent(value) {
  return `${Number(value || 0).toFixed(1).replace(".0", "")}%`;
}

function emptyState(message) {
  return `<div class="empty-state"><span>⌁</span><strong>No data found</strong><small>${message}</small></div>`;
}

function renderExamChart(courses) {
  if (!courses.length) {
    $("exam-chart").innerHTML = emptyState("Try clearing or changing the date filter.");
    return;
  }
  const max = Math.max(...courses.map((course) => course.total), 1);
  $("exam-chart").innerHTML = courses.map((course) => {
    const passedWidth = (course.passed / max) * 100;
    const failedWidth = (course.failed / max) * 100;
    return `<div class="bar-row">
      <div class="bar-label"><strong>${escapeHtml(course.courseCode)}</strong><span title="${escapeHtml(course.courseName)}">${escapeHtml(course.courseName)}</span></div>
      <div class="bar-track" title="${number.format(course.passed)} passed, ${number.format(course.failed)} failed">
        <span class="bar-fill passed" style="width:${passedWidth}%"></span><span class="bar-fill failed" style="width:${failedWidth}%"></span>
      </div><strong class="bar-total">${number.format(course.total)}</strong>
    </div>`;
  }).join("");
}

function renderRegistrationChart(courses) {
  if (!courses.length) {
    $("registration-chart").innerHTML = emptyState("Try clearing or changing the date filter.");
    return;
  }
  const max = Math.max(...courses.map((course) => course.registrations), 1);
  $("registration-chart").innerHTML = courses.map((course) => `<div class="bar-row">
    <div class="bar-label"><strong>${escapeHtml(course.courseCode)}</strong><span title="${escapeHtml(course.courseName)}">${escapeHtml(course.courseName)}</span></div>
    <div class="bar-track" title="${number.format(course.registrations)} registrations"><span class="bar-fill registered" style="width:${(course.registrations / max) * 100}%"></span></div>
    <strong class="bar-total">${number.format(course.registrations)}</strong>
  </div>`).join("");
}

function renderExamTable(courses) {
  $("exam-table-count").textContent = `${number.format(courses.length)} course${courses.length === 1 ? "" : "s"}`;
  $("exam-table").innerHTML = courses.length ? courses.map((course) => `<tr>
    <td><span class="course-cell"><b>${escapeHtml(course.courseCode)}</b><span>${escapeHtml(course.courseName)}</span></span></td>
    <td><strong>${number.format(course.total)}</strong></td><td class="success">${number.format(course.passed)}</td><td class="danger">${number.format(course.failed)}</td>
    <td><span class="rate"><i style="width:${Math.min(course.passRate, 100)}%"></i></span><strong>${percent(course.passRate)}</strong></td>
  </tr>`).join("") : `<tr><td colspan="5" class="no-rows">No exam records found for this period.</td></tr>`;
}

function renderRegistrationTable(courses, total) {
  $("registration-table-count").textContent = `${number.format(courses.length)} course${courses.length === 1 ? "" : "s"}`;
  $("registration-table").innerHTML = courses.length ? courses.map((course) => {
    const share = total ? (course.registrations / total) * 100 : 0;
    return `<tr><td><span class="course-cell"><b>${escapeHtml(course.courseCode)}</b><span>${escapeHtml(course.courseName)}</span></span></td>
      <td><span class="type-badge">${escapeHtml(course.courseType)}</span></td><td><strong>${number.format(course.registrations)}</strong></td><td><strong>${percent(share)}</strong></td></tr>`;
  }).join("") : `<tr><td colspan="4" class="no-rows">No registrations found for this period.</td></tr>`;
}

function render(data) {
  const exams = data.exams;
  const registrations = data.registrations;
  const totalAttempts = exams.totals.total || 0;
  const passed = exams.totals.passed || 0;
  const failed = exams.totals.failed || 0;
  $("total-attempts").textContent = number.format(totalAttempts);
  $("exam-courses").textContent = `Across ${number.format(exams.byCourse.length)} courses`;
  $("passed-students").textContent = number.format(passed);
  $("pass-rate").textContent = `${percent(exams.totals.passRate)} pass rate`;
  $("failed-students").textContent = number.format(failed);
  $("fail-rate").textContent = `${percent(totalAttempts ? (failed / totalAttempts) * 100 : 0)} fail rate`;
  $("total-registrations").textContent = number.format(registrations.totalRegistrations || 0);
  $("registered-students").textContent = `${number.format(registrations.uniqueStudents || 0)} unique students`;
  renderExamChart(exams.byCourse);
  renderRegistrationChart(registrations.byCourse);
  renderExamTable(exams.byCourse);
  renderRegistrationTable(registrations.byCourse, registrations.totalRegistrations || 0);
}

async function loadAnalytics() {
  if (state.loading) return;
  state.loading = true;
  $("error-banner").hidden = true;
  $("refresh-button").classList.add("loading");
  const params = new URLSearchParams();
  if ($("from-date").value) params.set("from", $("from-date").value);
  if ($("to-date").value) params.set("to", $("to-date").value);
  try {
    const response = await fetch(`/api/v1/dashboard?${params}`, { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || data?.message || "Unable to load analytics");
    render(data);
  } catch (error) {
    $("error-banner").textContent = `${error.message}. Please check the reporting API and try again.`;
    $("error-banner").hidden = false;
  } finally {
    state.loading = false;
    $("refresh-button").classList.remove("loading");
  }
}

$("apply-filter").addEventListener("click", loadAnalytics);
$("refresh-button").addEventListener("click", loadAnalytics);
$("clear-filter").addEventListener("click", () => {
  $("from-date").value = "";
  $("to-date").value = "";
  loadAnalytics();
});

const toggleSidebar = (open) => {
  $("sidebar").classList.toggle("open", open);
  $("sidebar-scrim").classList.toggle("visible", open);
  $("menu-button").setAttribute("aria-expanded", String(open));
};
$("menu-button").addEventListener("click", () => toggleSidebar(!$("sidebar").classList.contains("open")));
$("sidebar-scrim").addEventListener("click", () => toggleSidebar(false));
loadAnalytics();
