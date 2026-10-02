(() => {
  const $ = ui.$;
  $('transmit').onclick = async () => {
    $('transmit').disabled = true;
    try { ui.message($('tx-status'),'Transmitting…'); await AudioSignal.transmit($('message').value); ui.message($('tx-status'),'Sound transmitted.','success'); }
    catch(e) { ui.message($('tx-status'),e.message,'error'); }
    finally { $('transmit').disabled = false; }
  };
  $('receive').onclick = async () => {
    $('receive').disabled = true; $('cancel').hidden = false; $('received').textContent = 'Waiting for a signal';
    ui.message($('rx-status'),'Requesting microphone access…');
    try {
      const message = await AudioSignal.listen({ onReady: () => ui.message($('rx-status'),'Listening… (up to 20 seconds)') });
      $('received').textContent = message; ui.message($('rx-status'),'Message decoded. Microphone stopped.','success');
    } catch(e) { ui.message($('rx-status'),e.message,'error'); }
    finally { $('receive').disabled = false; $('cancel').hidden = true; }
  };
  $('cancel').onclick = () => AudioSignal.stopListening();
})();
