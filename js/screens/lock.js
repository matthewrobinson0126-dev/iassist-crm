// Lock screen. Registered shop iPad: tap your name, enter your PIN.
// Unregistered device (cloud mode): owner signs in with email + password, then can register it.
import * as repo from '../repo.js';
import { $, $$, esc, initials, toast } from '../ui.js';

const brand = name => `<div class="brand"><img src="icons/icon.svg" alt=""><span>${esc(name)} Book-In</span></div>`;

export async function renderLock(app, onDone) {
  let state;
  try {
    state = await repo.auth.lockState();
  } catch (ex) {
    app.innerHTML = `<div class="lock"><div class="lock-card">${brand('iAssist')}
      <h1>Can’t reach the database</h1><p class="error-msg">${esc(ex.message)}</p>
      <p class="muted">Check the internet connection, then try again.</p>
      <button class="btn primary big" id="retry">Try again</button></div></div>`;
    $('#retry', app).onclick = () => renderLock(app, onDone);
    return;
  }
  if (state.setupNeeded) return renderSetup(app, onDone);
  if (!state.registered) return renderOwnerSignIn(app, onDone);
  return renderPin(app, onDone, state.staff.filter(s => s.active !== false));
}

function renderPin(app, onDone, staff) {
  app.innerHTML = `
    <div class="lock"><div class="lock-card">
      ${brand('iAssist')}
      <h1 id="lock-title">Who’s using the iPad?</h1>
      <div class="staff-grid">
        ${staff.map(s => `<button class="staff-tile" data-id="${s.id}">
          <span class="avatar">${esc(initials(s.name))}</span><span>${esc(s.name)}</span>
          <span class="role-tag">${s.role}</span></button>`).join('')}
      </div>
      <div id="pin-wrap" class="stack" hidden>
        <div class="pin-dots" id="dots"><i></i><i></i><i></i><i></i></div>
        <div class="pinpad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
          <button class="blank" tabindex="-1" aria-hidden="true"></button>
          <button data-k="0">0</button>
          <button class="del" data-k="del">Delete</button>
        </div>
      </div>
      ${repo.auth.cloud ? '<button class="btn ghost small" id="owner-email">Owner: sign in with email</button>' : ''}
    </div></div>`;

  let chosen = null, pin = '', busy = false;
  const dots = $('#dots', app);
  const drawDots = () => $$('i', dots).forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const choose = id => {
    chosen = staff.find(s => s.id === id);
    pin = ''; drawDots();
    $$('.staff-tile', app).forEach(t => t.classList.toggle('on', t.dataset.id === id));
    $('#pin-wrap', app).hidden = false;
    $('#lock-title', app).textContent = `Hi ${chosen.name.split(' ')[0]}, enter your PIN`;
  };
  $$('.staff-tile', app).forEach(t => t.onclick = () => choose(t.dataset.id));
  if (staff.length === 1) choose(staff[0].id);
  $('#owner-email', app)?.addEventListener('click', () => renderOwnerSignIn(app, onDone));

  const wrong = msg => {
    dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
    pin = ''; setTimeout(drawDots, 200);
    toast(msg || 'Wrong PIN, try again', 'error');
  };
  async function press(k) {
    if (!chosen || busy) return;
    if (k === 'del') pin = pin.slice(0, -1);
    else if (pin.length < 4) pin += k;
    drawDots();
    if (pin.length < 4) return;
    busy = true;
    try {
      const ok = await repo.auth.unlock(chosen.id, pin);
      if (ok) { document.removeEventListener('keydown', onKey); onDone(); return; }
      wrong();
    } catch (ex) { wrong(ex.message); }
    finally { busy = false; }
  }
  $$('.pinpad [data-k]', app).forEach(b => b.onclick = () => press(b.dataset.k));
  const onKey = e => {
    if (!document.body.contains(dots)) return document.removeEventListener('keydown', onKey);
    if (e.target.closest?.('input, textarea')) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  };
  document.addEventListener('keydown', onKey);
}

function renderSetup(app, onDone) {
  const cloud = repo.auth.cloud;
  app.innerHTML = `
    <div class="lock"><div class="lock-card">
      ${brand('iAssist')}
      <h1>Set up the shop</h1>
      <p class="muted">Create the owner login first. You can add staff in Settings afterwards.</p>
      <form class="card stack setup-form" id="setup">
        <label class="field">Owner name<input type="text" id="s-name" autocomplete="name" required value="Matthew Robinson"></label>
        ${cloud ? `<label class="field">Email<span class="hint">For signing in on a new device</span><input type="email" id="s-email" autocomplete="username" required></label>
        <label class="field">Password<span class="hint">At least 10 characters</span><input type="password" id="s-pass" autocomplete="new-password" minlength="10" required></label>` : ''}
        <div class="grid-2">
          <label class="field">4-digit PIN<span class="hint">For the shop iPad</span><input type="password" id="s-pin" inputmode="numeric" maxlength="4" pattern="\\d{4}" required></label>
          <label class="field">PIN again<span class="hint">&nbsp;</span><input type="password" id="s-pin2" inputmode="numeric" maxlength="4" pattern="\\d{4}" required></label>
        </div>
        <p class="error-msg" id="s-err" hidden></p>
        <button class="btn primary big" type="submit">Create owner login</button>
      </form>
    </div></div>`;
  $('#setup', app).onsubmit = async e => {
    e.preventDefault();
    const err = $('#s-err', app);
    const v = id => $(id, app)?.value ?? '';
    if (v('#s-pin') !== v('#s-pin2')) { err.textContent = 'The two PINs don’t match.'; err.hidden = false; return; }
    const btn = e.submitter; if (btn) btn.disabled = true;
    try {
      await repo.auth.setupOwner({ name: v('#s-name'), email: v('#s-email'), password: v('#s-pass'), pin: v('#s-pin') });
      toast('Owner login created');
      if (cloud) return renderRegister(app, onDone, 'Counter iPad');
      onDone();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; if (btn) btn.disabled = false; }
  };
}

function renderOwnerSignIn(app, onDone) {
  app.innerHTML = `
    <div class="lock"><div class="lock-card">
      ${brand('iAssist')}
      <h1>Owner sign-in</h1>
      <p class="muted">This device isn’t registered as a shop iPad yet. Sign in with the owner’s email and password.</p>
      <form class="card stack setup-form" id="signin">
        <label class="field">Email<input type="email" id="o-email" autocomplete="username" required></label>
        <label class="field">Password<input type="password" id="o-pass" autocomplete="current-password" required></label>
        <p class="error-msg" id="o-err" hidden></p>
        <button class="btn primary big" type="submit">Sign in</button>
        <button class="btn ghost small" type="button" id="o-forgot">Forgot password?</button>
      </form>
    </div></div>`;
  $('#o-forgot', app).onclick = () => renderForgot(app, onDone, $('#o-email', app).value);
  $('#signin', app).onsubmit = async e => {
    e.preventDefault();
    const err = $('#o-err', app);
    try {
      await repo.auth.passwordLogin($('#o-email', app).value, $('#o-pass', app).value);
      if (repo.auth.isOwner() && !repo.auth.deviceRegistered()) return renderRegister(app, onDone, 'Counter iPad');
      onDone();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  };
}

function renderForgot(app, onDone, email = '') {
  app.innerHTML = `
    <div class="lock"><div class="lock-card">
      ${brand('iAssist')}
      <h1>Reset your password</h1>
      <p class="muted">Enter your login email. We’ll email you a link to choose a new password.</p>
      <form class="card stack setup-form" id="forgot">
        <label class="field">Email<input type="email" id="f-email" autocomplete="username" required value="${esc(email)}"></label>
        <p class="muted" id="f-msg" hidden></p>
        <div class="row"><button class="btn big" type="button" id="f-back">Back</button><span class="spacer"></span>
          <button class="btn primary big" type="submit">Email me a reset link</button></div>
      </form>
    </div></div>`;
  $('#f-back', app).onclick = () => renderOwnerSignIn(app, onDone);
  $('#forgot', app).onsubmit = async e => {
    e.preventDefault();
    const msg = $('#f-msg', app), btn = e.submitter;
    if (btn) btn.disabled = true;
    try {
      const r = await repo.auth.requestReset($('#f-email', app).value.trim());
      msg.textContent = `${r.message || 'Check your email.'} Open the link on this device.`;
    } catch (ex) { msg.textContent = ex.message; }
    msg.hidden = false;
    if (btn) btn.disabled = false;
  };
}

export function renderSetPassword(app, linkWorked, onDone) {
  if (!linkWorked) {
    app.innerHTML = `<div class="lock"><div class="lock-card">${brand('iAssist')}
      <h1>That link has expired</h1><p class="muted">Reset links work once and last an hour. Ask for a new one.</p>
      <button class="btn primary big" id="again">Back to sign-in</button></div></div>`;
    $('#again', app).onclick = onDone;
    return;
  }
  app.innerHTML = `
    <div class="lock"><div class="lock-card">
      ${brand('iAssist')}
      <h1>Choose a new password</h1>
      <form class="card stack setup-form" id="newpw">
        <label class="field">New password<span class="hint">At least 10 characters. Save it in your password manager.</span>
          <input type="password" id="n-pass" autocomplete="new-password" minlength="10" required></label>
        <label class="field">New password again<input type="password" id="n-pass2" autocomplete="new-password" minlength="10" required></label>
        <p class="error-msg" id="n-err" hidden></p>
        <button class="btn primary big" type="submit">Save new password</button>
      </form>
    </div></div>`;
  $('#newpw', app).onsubmit = async e => {
    e.preventDefault();
    const err = $('#n-err', app);
    if ($('#n-pass', app).value !== $('#n-pass2', app).value) { err.textContent = 'The two passwords don’t match.'; err.hidden = false; return; }
    try {
      await repo.auth.setNewPassword($('#n-pass', app).value);
      toast('Password changed. You’re signed in.');
      if (repo.auth.isOwner() && !repo.auth.deviceRegistered()) return renderRegister(app, onDone, 'Counter iPad');
      onDone();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  };
}

function renderRegister(app, onDone, defaultName) {
  app.innerHTML = `
    <div class="lock"><div class="lock-card">
      ${brand('iAssist')}
      <h1>Make this a shop iPad?</h1>
      <p class="muted">A shop iPad shows the staff list, and each person signs in with their 4-digit PIN.
        Skip this on your own phone or computer: you’ll sign in with email and password there instead.</p>
      <form class="card stack setup-form" id="reg">
        <label class="field">Name for this device<input type="text" id="r-name" value="${esc(defaultName)}" required></label>
        <p class="error-msg" id="r-err" hidden></p>
        <div class="row"><button class="btn big" type="button" id="r-skip">Not now</button><span class="spacer"></span>
          <button class="btn primary big" type="submit">Register as shop iPad</button></div>
      </form>
    </div></div>`;
  $('#r-skip', app).onclick = onDone;
  $('#reg', app).onsubmit = async e => {
    e.preventDefault();
    try {
      await repo.auth.registerDevice($('#r-name', app).value);
      toast('Registered: staff can now sign in here with their PIN');
      onDone();
    } catch (ex) { const err = $('#r-err', app); err.textContent = ex.message; err.hidden = false; }
  };
}
