/* ggwave 0.4.0, locally bundled. Float32 PCM stays in this browser. */
window.AudioSignal = (() => {
  let modulePromise, playbackContext, playbackSource, cancelListening;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  function codec() {
    if (!modulePromise) modulePromise = Promise.resolve().then(() => {
      if (typeof ggwave_factory !== 'function') throw new Error('The audio codec could not load. Refresh the page.');
      return ggwave_factory({ print: () => {}, printErr: () => {} });
    });
    return modulePromise;
  }
  function instance(module, sampleRate) {
    const parameters = module.getDefaultParameters();
    parameters.sampleRateInp = sampleRate;
    parameters.sampleRateOut = sampleRate;
    parameters.sampleFormatInp = module.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    parameters.sampleFormatOut = module.SampleFormat.GGWAVE_SAMPLE_FORMAT_F32;
    const handle = module.init(parameters);
    if (handle < 0) throw new Error('Unable to initialize the audio codec.');
    return handle;
  }
  async function prepare() {
    if (!AudioContextClass) throw new Error('This browser does not support Web Audio. Try another browser.');
    if (!playbackContext || playbackContext.state === 'closed') playbackContext = new AudioContextClass();
    await playbackContext.resume();
    await codec();
  }
  function stopPlayback() {
    if (playbackSource) { try { playbackSource.stop(); } catch {} playbackSource = null; }
  }
  async function transmit(message) {
    if (!message || new TextEncoder().encode(message).length > 64) throw new Error('Use a short message of 1–64 bytes.');
    await prepare(); stopPlayback();
    const module = await codec();
    const handle = instance(module, playbackContext.sampleRate);
    let waveform;
    try { waveform = module.encode(handle,message,module.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST,25); }
    finally { module.free(handle); }
    if (!waveform?.length) throw new Error('The audio signal could not be generated.');
    const samples = new Float32Array(waveform.buffer.slice(waveform.byteOffset,waveform.byteOffset + waveform.byteLength));
    const buffer = playbackContext.createBuffer(1,samples.length,playbackContext.sampleRate);
    buffer.copyToChannel(samples,0);
    const source = playbackContext.createBufferSource(); source.buffer = buffer; source.connect(playbackContext.destination); playbackSource = source;
    return new Promise((resolve,reject) => {
      let timer;
      source.onended = () => { clearTimeout(timer); source.disconnect(); if (playbackSource === source) playbackSource = null; resolve(); };
      timer = setTimeout(() => { try { source.stop(); } catch {} reject(new Error('Audio playback was interrupted. Broadcast again.')); },buffer.duration * 1000 + 5000);
      source.start();
    });
  }
  function microphoneError(error) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return new Error('Microphone permission is required to detect the attendance signal.');
    if (error.name === 'NotFoundError') return new Error('No microphone was found. Ask your lecturer to mark you present manually.');
    if (error.name === 'NotReadableError') return new Error('The microphone is unavailable or in use. Close other microphone apps and try again.');
    return error;
  }
  function listen({ timeout = 20000, onReady = () => {} } = {}) {
    if (cancelListening) return Promise.reject(new Error('Already listening.'));
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error('Microphone access requires HTTPS on phones, or localhost on this computer.'));
    if (!AudioContextClass) return Promise.reject(new Error('This browser does not support Web Audio.'));
    // Created during the button click so mobile browsers can unlock audio.
    const context = new AudioContextClass();
    const resume = context.resume();
    return new Promise((resolve,reject) => {
      let done = false, stream, source, recorder, module, handle, timer;
      function finish(error, decoded) {
        if (done) return; done = true; clearTimeout(timer); cancelListening = null;
        // Release hardware before validation or updating success UI.
        stream?.getTracks().forEach(track => track.stop());
        if (recorder) { recorder.onaudioprocess = null; recorder.disconnect(); }
        source?.disconnect();
        if (handle !== undefined) module.free(handle);
        context.close().catch(() => {});
        if (error) reject(error); else resolve(decoded);
      }
      cancelListening = () => finish(new Error('Listening stopped. You can try again.'));
      timer = setTimeout(() => finish(new Error('No attendance signal detected. Try again.')),timeout);
      (async () => {
        try {
          await resume; module = await codec(); if (done) return;
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:false, autoGainControl:false, noiseSuppression:false, channelCount:1 }, video:false });
          // A delayed permission response must never reopen an expired attempt.
          if (done) { stream.getTracks().forEach(track => track.stop()); return; }
          handle = instance(module,context.sampleRate);
          source = context.createMediaStreamSource(stream);
          // 4096 frames also supports ggwave 0.4.0 resampling at 44.1 kHz.
          recorder = context.createScriptProcessor(4096,1,1);
          recorder.onaudioprocess = event => {
            if (done) return;
            event.outputBuffer.getChannelData(0).fill(0);
            try {
              const samples = event.inputBuffer.getChannelData(0);
              const decoded = module.decode(handle,new Int8Array(samples.buffer,samples.byteOffset,samples.byteLength));
              if (decoded?.length) finish(null,new TextDecoder().decode(decoded));
            } catch (e) { finish(e); }
          };
          source.connect(recorder); recorder.connect(context.destination); onReady();
        } catch (e) { finish(microphoneError(e)); }
      })();
    });
  }
  function stopListening() { cancelListening?.(); }
  window.addEventListener('pagehide', () => { stopListening(); stopPlayback(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopListening(); });
  return { prepare, transmit, listen, stopListening, stopPlayback };
})();
