/**
 * components.js - wiederverwendbare UI-Bausteine.
 *
 * Handgeschriebener Ersatz fuer shadcn/ui: Button, Card, Input, Badge,
 * Dialog/Sheet, Toast, Fortschritt, Schalter, Segment-Auswahl.
 */
window.PG = window.PG || {};

PG.ui = (function () {
  'use strict';

  var h = PG.dom.h;

  /* ---------------------------------------------------------------- Button */

  /**
   * @param {Object} opts label, variant('primary'|'accent'|'ghost'|'danger'|''),
   *   size('sm'), icon, iconRight, block, disabled, onClick, type, silent
   */
  function button(opts) {
    opts = opts || {};
    var classes = ['btn'];
    if (opts.variant) classes.push('btn--' + opts.variant);
    if (opts.size === 'sm') classes.push('btn--sm');
    if (opts.block !== false) classes.push('btn--block');
    if (opts.class) classes.push(opts.class);

    var children = [];
    if (opts.icon) children.push(h('span', { class: 'btn__icon' }, PG.icons.el(opts.icon, opts.size === 'sm' ? 18 : 20)));
    if (opts.label) children.push(h('span', { text: opts.label }));
    if (opts.iconRight) children.push(h('span', { class: 'btn__icon' }, PG.icons.el(opts.iconRight, opts.size === 'sm' ? 18 : 20)));

    var el = h('button', {
      class: classes,
      type: opts.type || 'button',
      disabled: !!opts.disabled,
      onClick: function (ev) {
        if (el.disabled) return;
        if (!opts.silent) {
          PG.audio.click();
          PG.haptics.light();
        }
        if (opts.onClick) opts.onClick(ev);
      }
    }, children);

    return el;
  }

  /** Runder Icon-Button (Header, Listen). */
  function iconButton(opts) {
    var el = h('button', {
      class: ['icon-btn', opts.class].filter(Boolean).join(' '),
      type: 'button',
      'aria-label': opts.label || '',
      title: opts.label || '',
      onClick: function (ev) {
        if (!opts.silent) { PG.audio.click(); PG.haptics.light(); }
        if (opts.onClick) opts.onClick(ev);
      }
    }, PG.icons.el(opts.icon, opts.size || 22));
    return el;
  }

  /* ------------------------------------------------------------------ Card */

  function card(props) {
    var children = Array.prototype.slice.call(arguments, 1);
    var classes = ['card'];
    if (props && props.variant === 'flat') classes.push('card--flat');
    if (props && props.pad === 'sm') classes.push('card--pad-sm');
    if (props && props.class) classes.push(props.class);
    return h('div', { class: classes }, children);
  }

  /* ----------------------------------------------------------------- Input */

  /**
   * Textfeld mit Label, Hinweis und Fehlerslot.
   * Liefert { el, input, setError, clearError, value }.
   */
  function field(opts) {
    opts = opts || {};
    var errorEl = h('div', { class: 'field__error hidden' });

    var inputProps = {
      class: ['input', opts.inputClass].filter(Boolean).join(' '),
      type: opts.type || 'text',
      placeholder: opts.placeholder || '',
      value: opts.value === undefined ? '' : opts.value,
      autocomplete: 'off',
      autocapitalize: opts.autocapitalize || 'sentences',
      spellcheck: 'false'
    };
    if (opts.inputmode) inputProps.inputmode = opts.inputmode;
    if (opts.maxlength) inputProps.maxlength = opts.maxlength;
    if (opts.id) inputProps.id = opts.id;
    if (opts.onInput) inputProps.onInput = opts.onInput;
    if (opts.onKeydown) inputProps.onKeydown = opts.onKeydown;
    if (opts.enterkeyhint) inputProps.enterkeyhint = opts.enterkeyhint;

    var input = h('input', inputProps);

    var control = opts.unit
      ? h('div', { class: 'input-suffix' }, input, h('span', { class: 'input-suffix__unit', text: opts.unit }))
      : input;

    var el = h('div', { class: 'field' },
      opts.label ? h('label', { class: 'field__label', text: opts.label, for: opts.id || null }) : null,
      control,
      opts.hint ? h('div', { class: 'field__hint', text: opts.hint }) : null,
      errorEl
    );

    function setError(message) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
      input.classList.add('is-invalid');
      if (PG.settings.motionEnabled()) {
        input.classList.remove('shake');
        void input.offsetWidth; // Reflow erzwingen, damit die Animation neu startet
        input.classList.add('shake');
      }
    }

    function clearError() {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
      input.classList.remove('is-invalid');
    }

    input.addEventListener('input', clearError);

    return {
      el: el,
      input: input,
      setError: setError,
      clearError: clearError,
      value: function () { return input.value; },
      setValue: function (v) { input.value = v; },
      focus: function () { try { input.focus(); } catch (e) {} }
    };
  }

  /* ----------------------------------------------------------------- Badge */

  function badge(text, variant, icon) {
    return h('span', { class: ['badge', variant ? 'badge--' + variant : ''].filter(Boolean).join(' ') },
      icon ? PG.icons.el(icon, 14) : null,
      h('span', { text: text })
    );
  }

  /* ---------------------------------------------------------------- Avatar */

  /** Farbiger Initialen-Kreis; die Farbe leitet sich stabil aus dem Namen ab. */
  function avatar(name, size) {
    var palette = ['#6366f1', '#f97316', '#22c55e', '#ec4899', '#0ea5e9', '#a855f7', '#f43f5e', '#14b8a6'];
    var sum = 0;
    for (var i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    var classes = ['avatar'];
    if (size === 'lg') classes.push('avatar--lg');
    if (size === 'sm') classes.push('avatar--sm');
    return h('div', {
      class: classes,
      style: { background: palette[sum % palette.length] },
      'aria-hidden': 'true',
      text: (name.trim()[0] || '?')
    });
  }

  /* --------------------------------------------------------------- Notice */

  function notice(opts) {
    return h('div', { class: ['notice', opts.variant === 'accent' ? 'notice--accent' : ''].filter(Boolean).join(' ') },
      h('div', { class: 'notice__icon' }, PG.icons.el(opts.icon || 'info', 22)),
      h('div', { class: 'notice__body' }, opts.content || h('span', { text: opts.text || '' }))
    );
  }

  /* ------------------------------------------------------------- Progress */

  /** @param {number} value 0..1 */
  function progress(value) {
    var bar = h('div', { class: 'progress__bar', style: { width: Math.round(Math.max(0, Math.min(1, value)) * 100) + '%' } });
    var el = h('div', { class: 'progress', role: 'progressbar' }, bar);
    el.setValue = function (v) { bar.style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%'; };
    return el;
  }

  /* --------------------------------------------------------------- Switch */

  function switchRow(opts) {
    var btn = h('button', {
      class: 'switch',
      type: 'button',
      role: 'switch',
      'aria-checked': opts.checked ? 'true' : 'false',
      'aria-label': opts.title,
      onClick: function () {
        var next = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', next ? 'true' : 'false');
        PG.haptics.light();
        if (opts.onChange) opts.onChange(next);
        if (next) PG.audio.click();
      }
    });

    return h('div', { class: 'setting-row' },
      opts.icon ? h('div', { class: 'setting-row__icon' }, PG.icons.el(opts.icon, 20)) : null,
      h('div', { class: 'setting-row__text' },
        h('div', { class: 'setting-row__title', text: opts.title }),
        opts.desc ? h('div', { class: 'setting-row__desc', text: opts.desc }) : null
      ),
      btn
    );
  }

  /* ------------------------------------------------------------ Segmented */

  /** @param {{options: {value,label,icon}[], value, onChange}} opts */
  function segmented(opts) {
    var buttons = [];
    var wrap = h('div', { class: 'segmented', role: 'group' },
      opts.options.map(function (option) {
        var btn = h('button', {
          class: 'segmented__btn',
          type: 'button',
          'aria-pressed': option.value === opts.value ? 'true' : 'false',
          onClick: function () {
            buttons.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
            PG.haptics.light();
            PG.audio.click();
            if (opts.onChange) opts.onChange(option.value);
          }
        }, option.icon ? PG.icons.el(option.icon, 16) : null, h('span', { text: option.label }));
        buttons.push(btn);
        return btn;
      })
    );
    return wrap;
  }

  /* ----------------------------------------------------------------- Toast */

  function toastHost() {
    var host = document.getElementById('toast-host');
    if (!host) {
      host = h('div', { class: 'toast-host', id: 'toast-host' });
      document.body.appendChild(host);
    }
    return host;
  }

  /**
   * @param {string} message
   * @param {{variant?: 'danger'|'success', duration?: number, icon?: string}} [opts]
   */
  function toast(message, opts) {
    opts = opts || {};
    var el = h('div', { class: ['toast', opts.variant ? 'toast--' + opts.variant : ''].filter(Boolean).join(' '), role: 'status' },
      opts.icon ? PG.icons.el(opts.icon, 18) : null,
      h('span', { text: message })
    );
    toastHost().appendChild(el);

    setTimeout(function () {
      el.classList.add('is-leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
    }, opts.duration || 2600);

    return el;
  }

  /* ---------------------------------------------------------------- Dialog */

  /**
   * Bottom-Sheet-Dialog.
   * @param {{title?, content, actions?: Node[], dismissible?: boolean}} opts
   * @returns {{close: Function, el: Node}}
   */
  function dialog(opts) {
    opts = opts || {};

    var sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'sheet__grip' }),
      opts.title ? h('div', { class: 'row-between', style: { 'margin-bottom': '12px' } },
        h('h2', { class: 'title-lg', text: opts.title }),
        iconButton({ icon: 'x', label: 'Schließen', onClick: function () { close(); } })
      ) : null,
      opts.content,
      opts.actions && opts.actions.length
        ? h('div', { class: 'stack', style: { 'margin-top': '20px' } }, opts.actions)
        : null
    );

    var overlay = h('div', { class: 'overlay' }, sheet);

    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay && opts.dismissible !== false) close();
    });

    function onKey(ev) {
      if (ev.key === 'Escape' && opts.dismissible !== false) close();
    }

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('is-leaving');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (opts.onClose) opts.onClose();
      }, PG.settings.motionEnabled() ? 190 : 0);
    }

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    return { el: overlay, close: close };
  }

  /**
   * Bestaetigungsdialog mit zwei Optionen.
   * @param {{title, text, confirmLabel?, cancelLabel?, danger?, onConfirm}} opts
   */
  function confirmDialog(opts) {
    var dlg;
    dlg = dialog({
      title: opts.title,
      content: h('p', { class: 'text-muted', text: opts.text }),
      actions: [
        button({
          label: opts.confirmLabel || 'Bestätigen',
          variant: opts.danger ? 'danger' : 'primary',
          onClick: function () { dlg.close(); if (opts.onConfirm) opts.onConfirm(); }
        }),
        button({
          label: opts.cancelLabel || 'Abbrechen',
          variant: 'ghost',
          onClick: function () { dlg.close(); if (opts.onCancel) opts.onCancel(); }
        })
      ]
    });
    return dlg;
  }

  /* ------------------------------------------------------------- Leerstelle */

  function empty(opts) {
    return h('div', { class: 'empty' },
      opts.icon ? PG.icons.el(opts.icon, 28) : null,
      h('div', { class: 'text-bold', text: opts.title || '' }),
      opts.text ? h('div', { class: 'text-sm', text: opts.text }) : null
    );
  }

  return {
    button: button,
    iconButton: iconButton,
    card: card,
    field: field,
    badge: badge,
    avatar: avatar,
    notice: notice,
    progress: progress,
    switchRow: switchRow,
    segmented: segmented,
    toast: toast,
    dialog: dialog,
    confirmDialog: confirmDialog,
    empty: empty
  };
})();
