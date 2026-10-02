(() => {
  const $ = ui.$;
  let state, listening = false, confirmedSession = null;
  const message = (text, kind) => ui.message($('student-message'),text,kind);
  function render(data) {
    state = data;
    const course = data.courses.find(c => c.id === data.session?.courseId) || data.courses[0];
    if (!$('student').dataset.ready) { $('student').replaceChildren(...course.students.map(s => new Option(s.name + ' — ' + s.id,s.id))); $('student').dataset.ready = '1'; }
    $('course-code').textContent = course.code; $('course-detail').textContent = course.name + ' · Room ' + course.room;
    $('session-status').textContent = data.session?.active ? 'ACTIVE' : 'CLOSED';
    $('session-status').className = 'badge ' + (data.session?.active ? 'active' : 'closed');
    $('listen').disabled = listening || !data.session?.active || confirmedSession === data.session?.id;
    $('student').disabled = listening;
    $('developer').hidden = !data.demoMode;
    $('simulate').disabled = listening || !data.session?.active;
    if (confirmedSession && confirmedSession !== data.session?.id) { confirmedSession = null; $('confirmed').hidden = true; }
  }
  async function refresh() { render(await ui.api('/api/public')); }
  function selection() {
    if (!state?.session?.active) throw new Error('Attendance for this class is currently closed.');
    return { studentId: $('student').value, courseId: state.session.courseId, sessionId: state.session.id };
  }
  async function submit(token, selected, simulated = false) {
    const result = await ui.api('/api/check-in', { ...selected, token });
    confirmedSession = result.sessionId;
    $('confirmed').hidden = false;
    $('confirmed-detail').textContent = result.course + ' · ' + ui.time(result.record.checkedInAt);
    $('confirmed-method').textContent = simulated ? 'Developer simulation — audio was bypassed.' : 'Checked in through classroom sound.';
    message('Your attendance has been recorded.', 'success');
  }
  $('listen').onclick = async () => {
    if (listening) return;
    let selected;
    try { selected = selection(); } catch (e) { message(e.message,'error'); return; }
    listening = true; render(state); $('cancel').hidden = false; $('confirmed').hidden = true;
    message('Requesting microphone access…');
    try {
      const token = await AudioSignal.listen({ timeout: 20000, onReady: () => message('Listening for classroom signal… (up to 20 seconds)') });
      message('Signal detected. Checking attendance…');
      await submit(token, selected);
    } catch (e) { message(e.message,'error'); }
    finally { listening = false; $('cancel').hidden = true; $('listen').textContent = 'Listen for Attendance Signal'; if (state) render(state); }
  };
  $('cancel').onclick = () => AudioSignal.stopListening();
  $('student').onchange = () => { confirmedSession = null; $('confirmed').hidden = true; message(''); render(state); };
  $('simulate').onclick = async () => {
    try {
      const selected = selection(); $('simulate').disabled = true;
      const { token } = await ui.api('/api/developer/token', {}, $('developer-key').value.trim());
      await submit(token, selected, true); render(state);
    } catch (e) { message(e.message,'error'); }
    finally { $('simulate').disabled = false; }
  };
  refresh().catch(e => message(e.message,'error'));
  setInterval(() => { if (!listening) refresh().catch(e => message(e.message,'error')); },2000);
})();
