(() => {
  const $ = ui.$;
  let key = sessionStorage.getItem('lecturerKey') || '', state, busy = false, offset = 0;
  const message = (text, kind) => ui.message($('lecturer-message'), text, kind);
  function render(data) {
    state = data; offset = data.serverTime - Date.now();
    if (!$('course').options.length) data.courses.forEach(c => $('course').add(new Option(c.code + ' — ' + c.name, c.id)));
    const session = data.session;
    if (session) $('course').value = session.courseId;
    const course = data.courses.find(c => c.id === $('course').value);
    $('course-code').textContent = course.code;
    $('course-detail').textContent = course.name + ' · Room ' + course.room;
    $('session-status').textContent = session?.active ? 'ACTIVE' : session ? 'CLOSED' : 'READY';
    $('session-status').className = 'badge ' + (session?.active ? 'active' : session ? 'closed' : '');
    $('start').hidden = !!session?.active;
    $('active-controls').hidden = !session?.active;
    $('course').disabled = !!session?.active;
    const records = session?.courseId === course.id ? session.records : [];
    $('present-count').textContent = records.length;
    $('total-count').textContent = '/ ' + course.students.length + ' present';
    $('progress').style.width = (records.length / course.students.length * 100) + '%';
    $('roster').replaceChildren();
    course.students.forEach(student => {
      const record = records.find(r => r.studentId === student.id);
      const tr = document.createElement('tr');
      const name = document.createElement('td'); name.textContent = student.name;
      const id = document.createElement('small'); id.textContent = student.id; name.append(id);
      const status = document.createElement('td'); status.textContent = record ? '✓ Present' : '○ Awaiting'; status.className = record ? 'present' : 'muted';
      const time = document.createElement('td'); time.textContent = record ? ui.time(record.checkedInAt) : '—';
      if (record) { const method = document.createElement('small'); method.textContent = record.method; time.append(method); }
      const action = document.createElement('td');
      if (!record) { const button = document.createElement('button'); button.textContent = 'Mark present'; button.className = 'secondary'; button.disabled = busy || !session?.active; button.onclick = () => run(async () => {
        await ui.api('/api/lecturer/manual', { studentId: student.id, courseId: course.id, sessionId: session.id }, key);
        message(student.name + ' marked present manually.', 'success');
      }); action.append(button); }
      tr.append(name,status,time,action); $('roster').append(tr);
    });
    countdown();
  }
  function countdown() {
    const s = state?.session; const remaining = s ? Math.max(0, Math.ceil((s.expiresAt - Date.now() - offset) / 1000)) : 0;
    $('countdown').textContent = remaining ? remaining + ' seconds' : 'Expired — broadcast again';
    $('replay').disabled = busy || !remaining || !s?.active;
  }
  async function refresh() { render(await ui.api('/api/lecturer/state', undefined, key)); }
  async function run(action) {
    if (busy) return; busy = true;
    ['start','broadcast','replay','stop'].forEach(id => $(id).disabled = true);
    try { await action(); await refresh(); } catch (e) { message(e.message, 'error'); }
    finally { busy = false; ['start','broadcast','stop'].forEach(id => $(id).disabled = false); if (state) render(state); }
  }
  $('unlock').onsubmit = async e => {
    e.preventDefault(); key = $('key').value.trim();
    try { await refresh(); sessionStorage.setItem('lecturerKey',key); $('access').hidden = true; $('dashboard').hidden = false; $('key').value = ''; }
    catch (e) { ui.message($('access-message'),e.message,'error'); }
  };
  $('course').onchange = () => render({ ...state, session: state.session });
  $('start').onclick = () => run(async () => { render(await ui.api('/api/lecturer/start', { courseId: $('course').value }, key)); message('Session started. Ask students to listen, then broadcast.'); });
  async function broadcast(fresh) {
    await AudioSignal.prepare();
    if (fresh) render(await ui.api('/api/lecturer/rotate', {}, key));
    if (!state?.session?.active) throw new Error('Attendance is closed.');
    message('Broadcasting attendance signal…');
    await AudioSignal.transmit(state.session.token);
    message('Signal broadcast. Students can check in until it expires.', 'success');
  }
  $('broadcast').onclick = () => run(() => broadcast(true));
  $('replay').onclick = () => run(() => broadcast(false));
  $('stop').onclick = () => run(async () => { AudioSignal.stopPlayback(); render(await ui.api('/api/lecturer/stop', {}, key)); message('Attendance closed.'); });
  setInterval(countdown, 250);
  setInterval(() => { if (!$('dashboard').hidden && !busy) refresh().catch(e => message(e.message,'error')); }, 2000);
  if (key) refresh().then(() => { $('access').hidden = true; $('dashboard').hidden = false; }).catch(() => { key = ''; sessionStorage.removeItem('lecturerKey'); });
})();
