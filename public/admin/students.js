const $ = (id) => document.getElementById(id);
let key = "";
let editingId = null;
let page = 1;
let totalPages = 1;
const form = $("student-form");
async function api(path, method = "GET", body) {
  const response = await fetch(`/api/v1/${path}`, {
    method, headers: { "X-API-Key": key, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Request failed");
  return result;
}
function reset() {
  editingId = null;
  form.reset();
  $("form-title").textContent = "Add student";
  $("save").textContent = "Add student";
  $("cancel").hidden = true;
}
async function load() {
  const result = await api(`registrations?page=${page}&limit=25`);
  totalPages = Math.max(1, result.pagination.pages);
  $("rows").replaceChildren();
  for (const student of result.data) {
    const row = document.createElement("tr");
    for (const value of [student.studentId, student.studentName, student.email, student.courseName]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    const cell = document.createElement("td");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.onclick = () => {
      editingId = student.id;
      for (const field of ["studentId", "studentName", "email", "phone", "courseId"]) form.elements.namedItem(field).value = student[field] || "";
      $("form-title").textContent = "Edit student";
      $("save").textContent = "Save changes";
      $("cancel").hidden = false;
      form.elements.namedItem("studentName").focus();
    };
    cell.append(edit); row.append(cell); $("rows").append(row);
  }
  $("page").textContent = `Page ${page} of ${totalPages}`;
  $("previous").disabled = page <= 1;
  $("next").disabled = page >= totalPages;
}
$("login").onsubmit = async (event) => {
  event.preventDefault();
  key = $("key").value.trim();
  $("management").hidden = true;
  try {
    const courses = await api("courses");
    $("course").replaceChildren();
    for (const course of courses.data) {
      const option = document.createElement("option"); option.value = course.id; option.textContent = course.name; $("course").append(option);
    }
    page = 1; reset(); await load(); $("management").hidden = false; $("message").textContent = "";
  } catch (error) { $("message").textContent = error.message; }
};
form.onsubmit = async (event) => {
  event.preventDefault(); $("save").disabled = true;
  try {
    const editing = Boolean(editingId);
    await api(editing ? `registrations/${encodeURIComponent(editingId)}` : "registrations", editing ? "PATCH" : "POST", Object.fromEntries(new FormData(form)));
    reset(); await load(); $("message").textContent = editing ? "Student updated." : "Student added.";
  } catch (error) { $("message").textContent = error.message; }
  finally { $("save").disabled = false; }
};
$("cancel").onclick = reset;
for (const [id, offset] of [["previous", -1], ["next", 1]]) $(id).onclick = async () => {
  const previousPage = page; page += offset;
  try { await load(); } catch (error) { page = previousPage; $("message").textContent = error.message; }
};
