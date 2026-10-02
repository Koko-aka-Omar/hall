# Sound Attendance prototype

## Running locally

Requires Node.js 20+. No dependency installation or build step.

```sh
node server/server.js
```

Open http://localhost:3000 and enter the lecturer key printed in the terminal. Attendance is in memory and resets on restart. Demo students are in `server/attendance.js`.

For developer simulation in PowerShell:

```powershell
$env:DEMO_MODE='1'
node server/server.js
```

The student page then exposes **DEVELOPER TEST ONLY**, requiring the lecturer key. Normal operation never sends the active token to the student API.

For phones, use the same server through **trusted HTTPS** (an HTTPS reverse proxy, or set `TLS_CERT` and `TLS_KEY` to PEM certificate/key paths). Plain HTTP at a LAN IP cannot access phone microphones. `PORT`, `HOST`, and `LECTURER_KEY` are optional environment settings. Keep the lecturer key private.

## Pages

- `/lecturer.html` — start ELEC 210, broadcast/replay signals, stop, view the live register, mark students present manually.
- `/student.html` — select Omar or another demo student and listen before the lecturer broadcasts.
- `/audio-test.html` — send HELLO123 between two devices to check audio compatibility.

## How the prototype works

Speaker → sound token → microphone → local ggwave decode → server validation → attendance recorded. Tokens contain 96 random bits, expire after 30 seconds, and rotate on each fresh broadcast. One signal accepts many students; each student checks in once per session. Mic capture stops on decode, cancellation, timeout, or leaving/hiding the page.

`node --test test/*.test.js` runs the focused server and codec checks. ggwave 0.4.0 is bundled locally under its MIT license; no CDN is needed at runtime. Source: https://github.com/ggerganov/ggwave.

## Limitations

Microphone/browser compatibility and classroom acoustics need testing on actual devices. A live decoded token can theoretically be forwarded. Demo identity selection and a shared lecturer key are not production university authentication. Restarting the server clears attendance. Use the manual fallback when a phone fails.
