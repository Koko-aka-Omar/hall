window.ui = {
  $(id) { return document.getElementById(id); },
  time(ms) { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); },
  async api(path, body, key) {
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(key ? { Authorization: 'Bearer ' + key } : {})
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Please try again.');
    return result;
  },
  message(element, text, kind = '') { element.textContent = text; element.className = 'message ' + kind; element.hidden = !text; }
};
