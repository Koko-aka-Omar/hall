const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Attendance } = require('../server/attendance');
const { createApp } = require('../server/server');
const factory = require('../public/vendor/ggwave');

test('attendance workflow and token boundary through the HTTP API', async () => {
  let now = 1000000;
  const attendance = new Attendance(() => now);
  const { handler } = createApp({ attendance, lecturerKey:'test-lecturer', demoMode:true });
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(route, body, lecturer = false) {
    const response = await fetch(base + route, { method:body === undefined ? 'GET' : 'POST', headers:{
      ...(body === undefined ? {} : { 'Content-Type':'application/json' }),
      ...(lecturer ? { Authorization:'Bearer test-lecturer' } : {})
    }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
    return { status:response.status, data:await response.json() };
  }
  try {
    assert.equal((await request('/api/lecturer/state')).status,401);
    assert.equal((await request('/api/lecturer/start',{ courseId:'ELEC210' })).status,401);
    assert.equal((await request('/api/developer/token',{})).status,401);
    const started = await request('/api/lecturer/start',{ courseId:'ELEC210' },true);
    assert.equal(started.status,200);
    const s = started.data.session;
    assert.match(s.token,/^AT-[a-f0-9]{24}$/);
    assert.equal(s.expiresAt - s.tokenCreatedAt,30000);
    const publicState = await request('/api/public');
    assert.equal(JSON.stringify(publicState).includes(s.token),false);
    assert.equal(Object.hasOwn(publicState.data.session,'token'),false);
    const submission = { studentId:'20260001',courseId:'ELEC210',sessionId:s.id,token:s.token };
    assert.equal((await request('/api/check-in',{ ...submission,studentId:'outsider' })).status,403);
    assert.equal((await request('/api/check-in',{ ...submission,sessionId:'wrong' })).status,400);
    assert.equal((await request('/api/check-in',{ ...submission,token:'AT-invalid' })).status,403);
    const omar = await request('/api/check-in',submission);
    assert.equal(omar.status,200); assert.equal(omar.data.record.name,'Omar'); assert.equal(omar.data.record.method,'sound');
    assert.equal((await request('/api/check-in',submission)).status,409);
    assert.equal((await request('/api/check-in',{ ...submission,studentId:'20260002' })).status,200);
    assert.equal((await request('/api/lecturer/state',undefined,true)).data.session.records.length,2);
    const rotated = (await request('/api/lecturer/rotate',{},true)).data.session;
    assert.notEqual(rotated.token,s.token); assert.equal(rotated.id,s.id);
    assert.equal((await request('/api/check-in',{ ...submission,studentId:'20260003' })).status,403);
    now = rotated.expiresAt;
    const expired = await request('/api/check-in',{ ...submission,studentId:'20260003',token:rotated.token });
    assert.equal(expired.status,410); assert.match(expired.data.error,/expired/);
    const manual = await request('/api/lecturer/manual',{ ...submission,studentId:'20260004' },true);
    assert.equal(manual.status,200); assert.equal(manual.data.record.method,'manual');
    assert.equal((await request('/api/lecturer/manual',{ ...submission,studentId:'20260004' },true)).status,409);
    const fresh = (await request('/api/lecturer/rotate',{},true)).data.session;
    assert.equal((await request('/api/developer/token',{},true)).data.token,fresh.token);
    assert.equal((await request('/api/lecturer/stop',{},true)).status,200);
    assert.equal((await request('/api/check-in',{ ...submission,studentId:'20260003',token:fresh.token })).status,409);
    assert.equal((await request('/api/lecturer/manual',{ ...submission,studentId:'20260005' },true)).status,409);
    const next = (await request('/api/lecturer/start',{ courseId:'ELEC210' },true)).data.session;
    assert.notEqual(next.id,s.id); assert.equal(next.records.length,0);
    assert.equal((await request('/api/check-in',{ ...submission,token:next.token })).status,400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('developer token endpoint is unavailable in normal mode', async () => {
  const { handler } = createApp({ lecturerKey:'test-lecturer' });
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/developer/token',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-lecturer'},body:'{}'
    });
    assert.equal(response.status,404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('real ggwave encode/decode in microphone-sized PCM chunks at 44.1 and 48 kHz', async () => {
  const module = await factory({ print:()=>{},printErr:()=>{} });
  for (const rate of [44100,48000]) {
    const parameters = module.getDefaultParameters();
    parameters.sampleRateInp = rate; parameters.sampleRateOut = rate;
    parameters.sampleFormatInp = module.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    parameters.sampleFormatOut = module.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    const tx = module.init(parameters), rx = module.init(parameters);
    const token = 'AT-0123456789abcdef01234567';
    try {
      const waveform = module.encode(tx,token,module.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST,25);
      const padded = new Uint8Array(waveform.byteLength + rate * 4); padded.set(new Uint8Array(waveform.buffer,waveform.byteOffset,waveform.byteLength),8192);
      let decoded;
      for (let i = 0; i < padded.length; i += 16384) {
        const chunk = padded.subarray(i,Math.min(i + 16384,padded.length));
        const result = module.decode(rx,new Int8Array(chunk.buffer,chunk.byteOffset,chunk.byteLength));
        if (result?.length) decoded = new TextDecoder().decode(result);
      }
      assert.equal(decoded,token,'round trip at ' + rate + ' Hz');
    } finally { module.free(tx); module.free(rx); }
  }
});
