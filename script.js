(function () {
  'use strict';

  // =====================================================================
  // API layer - wraps google.script.run (see Router.gs / apiGet / apiPost)
  // in Promises so the rest of the app can use async/await.
  // =====================================================================

    const API_URL =
    "https://script.google.com/macros/s/AKfycbze7C7WxxlUDtvvTTBICTRUcWIHSfj5lyIS2zYrPbCjJxWrq_997a9v8SEaWrG49vXF/exec";

    async function callApi(mode, action, params = {}) {

        const query = new URLSearchParams({
            action,
            ...params
        });

        const response = await fetch(API_URL + "?" + query);

        const json = await response.json();

        if (!json.success) {
            throw new Error(json.error || "Unknown error");
        }

        return json.data;
    }

  const Api = {
    dashboard: function (refresh) { return callApi('get', 'dashboard', { refresh: refresh ? 'true' : 'false' }); },
    statistics: function () { return callApi('get', 'statistics', {}); },
    search: function (params) { return callApi('get', 'search', params); },
    details: function (rowNumber) { return callApi('get', 'details', { rowNumber: rowNumber }); },
    reminders: function () { return callApi('get', 'reminders', {}); },
    settings: function () { return callApi('get', 'settings', {}); },
    health: function () { return callApi('get', 'health', {}); },
    updateStatus: function (rowNumber, status) {
        return callApi('get', 'updateStatus', {
            rowNumber,
            status
        });
    },

    triggerImport: function () {
        return callApi('get', 'import', {});
    },

    sendReminders: function () {
        return callApi('get', 'sendReminders', {});
    },

    upsertSetting: function (key, value) {
        return callApi('get', 'saveSetting', {
            key,
            value
        });
    }
  };

  // =====================================================================
  // Small helpers
  // =====================================================================

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'class') node.className = attrs[key];
        else if (key === 'html') node.innerHTML = attrs[key];
        else if (key.indexOf('on') === 0 && typeof attrs[key] === 'function') node.addEventListener(key.slice(2), attrs[key]);
        else node.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  const STATUS_BADGE_CLASS = {
    'Nové': 'badge-new',
    'Čaká na odpoveď': 'badge-awaiting',
    'Potvrdené': 'badge-confirmed',
    'Zamietnuté': 'badge-declined',
    'Po termíne': 'badge-expired',
    'Uzavreté': 'badge-closed'
  };

  function statusBadge(status) {
    const cls = STATUS_BADGE_CLASS[status] || 'badge-closed';
    return '<span class="badge ' + cls + '">' + escapeHtml(status || '\u2014') + '</span>';
  }

  /**
   * Renders a countdown chip from a millisecond epoch deadline. Positive
   * "T-04" means 4 days remaining; "T+02" means 2 days overdue.
   */
  function countdownChip(deadlineMs, label) {
    if (!deadlineMs) return '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((deadlineMs - today.getTime()) / 86400000);
    let cls = 'ok';
    if (diffDays < 0) cls = 'due';
    else if (diffDays <= 3) cls = 'soon';
    const sign = diffDays >= 0 ? '-' : '+';
    const text = 'T' + sign + String(Math.abs(diffDays)).padStart(2, '0');
    return '<span class="chip-countdown ' + cls + '" title="' + escapeHtml(label || '') + '">' + text + '</span>';
  }

  function reminderChip(daysSinceLastTouch, dueNow) {
    if (daysSinceLastTouch === null || daysSinceLastTouch === undefined) return '<span class="chip-countdown">\u2014</span>';
    const cls = dueNow ? 'due' : (daysSinceLastTouch >= 1 ? 'soon' : 'ok');
    return '<span class="chip-countdown ' + cls + '">+' + daysSinceLastTouch + 'd</span>';
  }

  function facultyTags(codes) {
    if (!codes || codes.length === 0) return '<span class="rl-sub">no faculty matched</span>';
    return codes.map(function (c) { return '<span class="fac-tag">' + escapeHtml(c) + '</span>'; }).join(' ');
  }

  function debounce(fn, wait) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  // =====================================================================
  // Toasts
  // =====================================================================

  const Toast = {
    stack: null,
    init: function () { this.stack = qs('#toast-stack'); },
    show: function (message, type) {
      const node = el('div', { class: 'toast' + (type ? ' ' + type : '') }, [message]);
      this.stack.appendChild(node);
      setTimeout(function () {
        node.style.opacity = '0';
        node.style.transition = 'opacity .2s ease';
        setTimeout(function () { node.remove(); }, 220);
      }, 3200);
    }
  };

  // =====================================================================
  // Button loading state helper
  // =====================================================================

  function withButtonLoading(button, fn) {
    return function () {
      if (button.classList.contains('loading')) return;
      button.classList.add('loading');
      button.disabled = true;
      Promise.resolve(fn.apply(null, arguments)).finally(function () {
        button.classList.remove('loading');
        button.disabled = false;
      });
    };
  }

  // =====================================================================
  // Drawer (BIP detail)
  // =====================================================================

  const Drawer = {
    overlay: null, panel: null, currentRow: null,
    init: function () {
      this.overlay = qs('#drawer-overlay');
      this.panel = qs('#drawer');
      this.overlay.addEventListener('click', this.close.bind(this));
      qs('#drawer-close').addEventListener('click', this.close.bind(this));
      document.addEventListener('keydown', (function (e) {
        if (e.key === 'Escape') this.close();
      }).bind(this));
    },
    open: function (rowNumber) {
      this.currentRow = rowNumber;
      this.overlay.classList.add('open');
      this.panel.classList.add('open');
      this.load();
    },
    close: function () {
      this.overlay.classList.remove('open');
      this.panel.classList.remove('open');
    },
    load: function () {
      const body = qs('#drawer-body');
      body.innerHTML = '<div class="skeleton" style="height:18px;width:70%;margin-bottom:10px;"></div>' +
        '<div class="skeleton" style="height:12px;width:40%;margin-bottom:22px;"></div>' +
        '<div class="skeleton" style="height:100px;width:100%;"></div>';
      const row = this.currentRow;
      Api.details(row).then((function (detail) {
        if (this.currentRow !== row) return;
        this.render(detail);
      }).bind(this)).catch((function (err) {
        body.innerHTML = '<div class="empty-state">Could not load this BIP: ' + escapeHtml(err.message) + '</div>';
      }));
    },
    render: function (d) {
      qs('#drawer-title').textContent = d.bipName || '(untitled BIP)';
      qs('#drawer-sub').textContent = d.university || 'Unknown university';

      const body = qs('#drawer-body');
      body.innerHTML = '';

      const overview = el('div', { class: 'detail-section' }, [
        el('div', { class: 'detail-grid' }, [
          detailItem('Level', d.level || '\u2014'),
          detailItem('Students', d.studentCount || '\u2014'),
          detailItem('Start', d.startDate || '\u2014', 'mono'),
          detailItem('End', d.endDate || '\u2014', 'mono'),
          detailItem('Deadline', d.deadline || '\u2014', 'mono'),
          detailItem('Application method', d.applicationMethod || '\u2014')
        ])
      ]);
      body.appendChild(overview);

      const statusSection = el('div', { class: 'detail-section' }, [
        el('h4', {}, ['Status']),
        buildStatusSelect(d)
      ]);
      body.appendChild(statusSection);

      const facSection = el('div', { class: 'detail-section' }, [
        el('h4', {}, ['Invited faculties']),
        el('div', { class: 'fac-grid', html: facultyTags(d.faculties) })
      ]);
      body.appendChild(facSection);

      if (d.requirements) body.appendChild(textSection('Requirements', d.requirements));
      if (d.details) body.appendChild(textSection('Details', d.details));
      if (d.notes) body.appendChild(textSection('Notes', d.notes));

      if (d.metadata) {
        const meta = el('div', { class: 'detail-section' }, [
          el('h4', {}, ['Import record']),
          el('div', { class: 'detail-grid' }, [
            detailItem('Imported', d.metadata.importedAt || '\u2014', 'mono'),
            detailItem('Last touched', d.metadata.updatedAt || '\u2014', 'mono'),
            detailItem('Reminders sent', String(d.metadata.reminderCount), 'mono')
          ]),
          buildLinkRow(d)
        ]);
        body.appendChild(meta);
      }
    }
  };

  function detailItem(label, value, mono) {
    return el('div', { class: 'detail-item' }, [
      el('div', { class: 'di-label' }, [label]),
      el('div', { class: 'di-value' + (mono ? ' mono' : '') }, [value])
    ]);
  }

  function textSection(title, text) {
    return el('div', { class: 'detail-section' }, [
      el('h4', {}, [title]),
      el('div', { class: 'detail-text' }, [text])
    ]);
  }

  function buildLinkRow(d) {
    const links = [];
    if (d.metadata.gmailUrl) links.push(el('a', { href: d.metadata.gmailUrl, target: '_blank', rel: 'noopener' }, ['Open e-mail \u2197']));
    if (d.metadata.driveFolderUrl) links.push(el('a', { href: d.metadata.driveFolderUrl, target: '_blank', rel: 'noopener' }, ['Open Drive folder \u2197']));
    if (d.fileUrl && d.fileUrl !== d.metadata.driveFolderUrl) links.push(el('a', { href: d.fileUrl, target: '_blank', rel: 'noopener' }, ['Attachments \u2197']));
    return el('div', { class: 'link-row' }, links);
  }

  function buildStatusSelect(d) {
    const select = el('select', { class: 'status-select' }, STATUS_LIST.map(function (s) {
      const opt = el('option', { value: s }, [s]);
      if (s === d.status) opt.setAttribute('selected', 'selected');
      return opt;
    }));
    select.addEventListener('change', function () {
      const newStatus = select.value;
      select.disabled = true;
      Api.updateStatus(d.rowNumber, newStatus).then(function () {
        Toast.show('Status updated to "' + newStatus + '".', 'ok');
        select.disabled = false;
        Views.dashboard.dirty = true;
        Views.search.dirty = true;
      }).catch(function (err) {
        Toast.show('Could not update status: ' + err.message, 'err');
        select.value = d.status;
        select.disabled = false;
      });
    });
    return select;
  }

  let STATUS_LIST = [];

  // =====================================================================
  // View: Dashboard
  // =====================================================================

  const Views = {};

  Views.dashboard = {
    dirty: true,
    async render(root) {
      root.innerHTML = viewTitleRow('Dashboard', 'Live status of every Blended Intensive Programme invitation.', importButtonHtml());
      bindImportButton(root);

      const grid = el('div', { class: 'kpi-grid' }, [
        kpiSkeleton(), kpiSkeleton(), kpiSkeleton(), kpiSkeleton(), kpiSkeleton()
      ]);
      root.appendChild(grid);

      const panels = el('div', { class: 'panel-grid' });
      root.appendChild(panels);

      try {
        const data = await Api.dashboard(this.dirty);
        this.dirty = false;
        STATUS_LIST = Object.keys(data.statusSummary);
        renderKpis(grid, data);
        renderDashboardPanels(panels, data);
      } catch (err) {
        panels.innerHTML = '<div class="empty-state">Could not load the dashboard: ' + escapeHtml(err.message) + '</div>';
      }
    }
  };

  function kpiSkeleton() {
    return el('div', { class: 'kpi-card' }, [
      el('div', { class: 'skeleton', style: 'height:11px;width:60%;' }),
      el('div', { class: 'skeleton', style: 'height:26px;width:40%;margin-top:10px;' })
    ]);
  }

  function importButtonHtml() {
    return '<button class="btn btn-primary" id="btn-import"><span class="spinner"></span><span class="btn-label">Import now</span></button>';
  }

  function bindImportButton(root) {
    const btn = qs('#btn-import', root);
    if (!btn) return;
    btn.addEventListener('click', withButtonLoading(btn, async function () {
      try {
        const result = await Api.triggerImport();
        Toast.show('Import finished: ' + result.imported + ' imported, ' + result.failed + ' failed (of ' + result.total + ' new e-mails).', result.failed > 0 ? 'err' : 'ok');
        Views.dashboard.dirty = true;
        Views.search.dirty = true;
        if (Router.current === 'dashboard') Router.render();
      } catch (err) {
        Toast.show('Import failed to run: ' + err.message, 'err');
      }
    }));
  }

  function renderKpis(grid, data) {
    grid.innerHTML = '';
    const t = data.totals;
    const items = [
      { label: 'Total BIPs', value: t.totalBips, cls: '' },
      { label: 'Active', value: t.activeBips, cls: 'accent' },
      { label: 'Confirmed', value: t.confirmedBips, cls: 'good' },
      { label: 'Expired', value: t.expiredBips, cls: 'bad' },
      { label: 'Universities', value: t.totalUniversities, cls: '' }
    ];
    items.forEach(function (item) {
      grid.appendChild(el('div', { class: 'kpi-card ' + item.cls }, [
        el('div', { class: 'kpi-label' }, [item.label]),
        el('div', { class: 'kpi-value' }, [String(item.value)])
      ]));
    });
  }

  function renderDashboardPanels(panels, data) {
    panels.innerHTML = '';

    const left = el('div', {});
    const right = el('div', {});
    panels.appendChild(left);
    panels.appendChild(right);

    // Recent BIPs
    left.appendChild(buildListPanel('Recently imported', data.recentBips, function (b) {
      return listRowHtml(b, b.importedAt ? 'Imported ' + b.importedAt : '');
    }, 'No BIPs imported yet.'));

    // Faculty statistics
    const maxInvited = Math.max(1, Math.max.apply(null, data.facultyStatistics.map(function (f) { return f.invited; })));
    const facPanel = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [el('h2', {}, ['Faculty statistics']), el('span', { class: 'hint' }, ['invitations'])]),
      el('div', { class: 'panel-body' }, data.facultyStatistics.map(function (f) {
        const pct = Math.round((f.invited / maxInvited) * 100);
        return el('div', { class: 'bar-row' }, [
          el('span', { class: 'bar-name' }, [f.code]),
          el('div', { class: 'bar-track' }, [el('div', { class: 'bar-fill', style: 'width:' + pct + '%' })]),
          el('span', { class: 'bar-count' }, [String(f.invited)])
        ]);
      }))
    ]);
    left.appendChild(facPanel);

    // Upcoming deadlines
    right.appendChild(buildListPanel('Upcoming deadlines', data.upcomingDeadlines, function (b) {
      return listRowHtml(b, b.university, countdownChip(b.deadlineRaw, 'Deadline'));
    }, 'No deadlines in the next 14 days.'));

    // Upcoming reminders
    right.appendChild(buildListPanel('Needs a reminder', data.upcomingReminders, function (b) {
      return listRowHtml(b, b.university, reminderChip(b.daysSinceLastTouch, b.dueNow));
    }, 'Nothing is currently overdue for a reminder.'));
  }

  function buildListPanel(title, rows, rowHtmlFn, emptyText) {
    const body = el('div', { class: 'row-list' });
    if (!rows || rows.length === 0) {
      body.appendChild(el('div', { class: 'empty-state' }, [emptyText]));
    } else {
      rows.forEach(function (row) {
        const node = el('div', { class: 'list-row', html: rowHtmlFn(row) });
        node.addEventListener('click', function () { Drawer.open(row.rowNumber); });
        body.appendChild(node);
      });
    }
    return el('div', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [el('h2', {}, [title])]),
      body
    ]);
  }

  function listRowHtml(b, subLine, chipHtml) {
    return '<div class="rl-main">' +
      '<div class="rl-title">' + escapeHtml(b.bipName || '(untitled)') + '</div>' +
      '<div class="rl-sub">' + escapeHtml(subLine || '') + '</div>' +
      '</div>' + statusBadge(b.status) + (chipHtml || '');
  }

  // =====================================================================
  // View: Search
  // =====================================================================

  Views.search = {
    dirty: true,
    filters: { query: '', status: '', faculty: '', university: '', deadlineFrom: '', deadlineTo: '' },
    offset: 0,
    limit: 25,
    async render(root) {
      root.innerHTML = viewTitleRow('Search BIPs', 'Filter and search every programme on file.', '');
      const filterBar = el('div', { class: 'filter-bar' });
      root.appendChild(filterBar);

      const panel = el('div', { class: 'panel' }, [
        el('div', { class: 'table-wrap' }, [buildSkeletonTable()]),
      ]);
      root.appendChild(panel);

      try {
        const facets = await DataCache.getFacets();
        renderFilterBar(filterBar, facets, this);
        await this.runSearch(panel);
      } catch (err) {
        panel.innerHTML = '<div class="empty-state">Could not load search: ' + escapeHtml(err.message) + '</div>';
      }
    },
    async runSearch(panel) {
      const wrap = qs('.table-wrap', panel) || panel;
      wrap.innerHTML = '';
      wrap.appendChild(buildSkeletonTable());
      const params = Object.assign({}, this.filters, { limit: this.limit, offset: this.offset });
      const result = await Api.search(params);
      renderResultsTable(panel, result, this);
    }
  };

  function buildSkeletonTable() {
    const rows = [];
    for (let i = 0; i < 5; i++) rows.push(el('div', { class: 'skeleton', style: 'height:34px;margin:10px 14px;' }));
    return el('div', {}, rows);
  }

  function renderFilterBar(bar, facets, view) {
    bar.innerHTML = '';
    const search = el('div', { class: 'filter-field grow' }, [
      el('span', { class: 'field-label' }, ['Search']),
      el('div', { class: 'search-box' }, [
        el('input', { type: 'search', placeholder: 'BIP name, university, details\u2026', value: view.filters.query }),
      ])
    ]);
    const input = qs('input', search);
    input.addEventListener('input', debounce(function () {
      view.filters.query = input.value;
      view.offset = 0;
      view.runSearch(qs('#view'));
    }, 300));
    bar.appendChild(search);

    bar.appendChild(buildSelectField('Status', ['', ].concat(facets.statuses), view.filters.status, function (v) {
      view.filters.status = v; view.offset = 0; view.runSearch(qs('#view'));
    }));
    bar.appendChild(buildSelectField('Faculty', [''].concat(facets.faculties.map(function (f) { return f.code; })), view.filters.faculty, function (v) {
      view.filters.faculty = v; view.offset = 0; view.runSearch(qs('#view'));
    }));
    bar.appendChild(buildSelectField('University', [''].concat(facets.universities), view.filters.university, function (v) {
      view.filters.university = v; view.offset = 0; view.runSearch(qs('#view'));
    }));

    const from = buildDateField('Deadline from', view.filters.deadlineFrom, function (v) {
      view.filters.deadlineFrom = v; view.offset = 0; view.runSearch(qs('#view'));
    });
    const to = buildDateField('Deadline to', view.filters.deadlineTo, function (v) {
      view.filters.deadlineTo = v; view.offset = 0; view.runSearch(qs('#view'));
    });
    bar.appendChild(from);
    bar.appendChild(to);
  }

  function buildSelectField(label, options, value, onChange) {
    const select = el('select', {}, options.map(function (opt) {
      const o = el('option', { value: opt }, [opt === '' ? 'All' : opt]);
      if (opt === value) o.setAttribute('selected', 'selected');
      return o;
    }));
    select.addEventListener('change', function () { onChange(select.value); });
    return el('div', { class: 'filter-field' }, [el('span', { class: 'field-label' }, [label]), select]);
  }

  function buildDateField(label, value, onChange) {
    const input = el('input', { type: 'date', value: value || '' });
    input.addEventListener('change', function () { onChange(input.value); });
    return el('div', { class: 'filter-field' }, [el('span', { class: 'field-label' }, [label]), input]);
  }

  function renderResultsTable(panel, result, view) {
    panel.innerHTML = '';
    if (result.results.length === 0) {
      panel.appendChild(el('div', { class: 'empty-state' }, ['No BIPs match these filters.']));
      panel.appendChild(paginationRow(result, view));
      return;
    }

    const table = el('table', { class: 'data-table' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', {}, ['BIP']), el('th', {}, ['University']), el('th', {}, ['Faculties']),
        el('th', {}, ['Deadline']), el('th', {}, ['Status'])
      ])]),
      el('tbody', {}, result.results.map(function (b) {
        const tr = el('tr', {}, [
          el('td', { class: 'cell-name' }, [b.bipName || '(untitled)']),
          el('td', {}, [b.university || '\u2014']),
          el('td', { html: facultyTags(b.faculties) }),
          el('td', { class: 'cell-mono' }, [b.deadline || '\u2014']),
          el('td', { html: statusBadge(b.status) })
        ]);
        tr.addEventListener('click', function () { Drawer.open(b.rowNumber); });
        return tr;
      }))
    ]);
    panel.appendChild(el('div', { class: 'table-wrap' }, [table]));
    panel.appendChild(paginationRow(result, view));
  }

  function paginationRow(result, view) {
    const from = result.total === 0 ? 0 : view.offset + 1;
    const to = Math.min(view.offset + view.limit, result.total);
    const row = el('div', { class: 'pagination' }, [
      el('span', {}, ['Showing ' + from + '\u2013' + to + ' of ' + result.total]),
      el('div', {}, [
        pagBtn('\u2190 Prev', view.offset <= 0, function () { view.offset = Math.max(0, view.offset - view.limit); view.runSearch(qs('#view')); }),
        pagBtn('Next \u2192', view.offset + view.limit >= result.total, function () { view.offset += view.limit; view.runSearch(qs('#view')); })
      ])
    ]);
    return row;
  }

  function pagBtn(label, disabled, onClick) {
    const btn = el('button', { class: 'btn btn-sm btn-ghost' }, [label]);
    if (disabled) btn.disabled = true;
    else btn.addEventListener('click', onClick);
    return btn;
  }

  // =====================================================================
  // View: Reminders
  // =====================================================================

  Views.reminders = {
    async render(root) {
      root.innerHTML = viewTitleRow('Reminders', 'BIPs with no faculty response yet.', reminderButtonHtml());
      const btn = qs('#btn-send-reminders', root);
      const panel = el('div', { class: 'panel' }, [el('div', { class: 'row-list' }, [buildSkeletonTable()])]);
      root.appendChild(panel);

      btn.addEventListener('click', withButtonLoading(btn, async function () {
        try {
          const result = await Api.sendReminders();
          Toast.show('Reminder run finished: ' + result.sent + ' sent, ' + result.skipped + ' skipped (of ' + result.checked + ' checked).', 'ok');
          Views.dashboard.dirty = true;
          load();
        } catch (err) {
          Toast.show('Could not send reminders: ' + err.message, 'err');
        }
      }));

      await load();

      async function load() {
        try {
          const rows = await Api.reminders();
          const body = el('div', { class: 'row-list' });
          if (rows.length === 0) {
            body.appendChild(el('div', { class: 'empty-state' }, ['Nothing is currently eligible for a reminder.']));
          } else {
            rows.forEach(function (b) {
              const node = el('div', { class: 'list-row', html: listRowHtml(b, b.university, reminderChip(b.daysSinceLastTouch, b.dueNow)) });
              node.addEventListener('click', function () { Drawer.open(b.rowNumber); });
              body.appendChild(node);
            });
          }
          panel.innerHTML = '';
          panel.appendChild(body);
        } catch (err) {
          panel.innerHTML = '<div class="empty-state">Could not load reminders: ' + escapeHtml(err.message) + '</div>';
        }
      }
    }
  };

  function reminderButtonHtml() {
    return '<button class="btn btn-primary" id="btn-send-reminders"><span class="spinner"></span><span class="btn-label">Send reminders now</span></button>';
  }

  // =====================================================================
  // View: Settings
  // =====================================================================

  Views.settings = {
    async render(root) {
      root.innerHTML = viewTitleRow('Settings', 'Key/value configuration stored on the Settings sheet.', '');
      const panel = el('div', { class: 'panel' }, [el('div', {}, [buildSkeletonTable()])]);
      root.appendChild(panel);

      const addForm = el('div', { class: 'panel' }, [
        el('div', { class: 'panel-head' }, [el('h2', {}, ['Add / update a setting'])]),
        el('div', { class: 'panel-body padded' })
      ]);
      root.appendChild(addForm);
      buildAddForm(qs('.panel-body', addForm), reload);

      await reload();

      async function reload() {
        try {
          const rows = await Api.settings();
          renderSettingsTable(panel, rows, reload);
        } catch (err) {
          panel.innerHTML = '<div class="empty-state">Could not load settings: ' + escapeHtml(err.message) + '</div>';
        }
      }
    }
  };

  function renderSettingsTable(panel, rows, onSaved) {
    panel.innerHTML = '';
    if (rows.length === 0) {
      panel.appendChild(el('div', { class: 'empty-state' }, ['No settings configured yet.']));
      return;
    }
    rows.forEach(function (row) {
      const key = row['Key'], desc = row['Description'];
      const valueInput = el('input', { type: 'text', value: row['Value'] || '' });
      const saveBtn = el('button', { class: 'btn btn-sm' }, ['Save']);
      saveBtn.addEventListener('click', withButtonLoading(saveBtn, async function () {
        try {
          await Api.upsertSetting(key, valueInput.value);
          Toast.show('Saved "' + key + '".', 'ok');
        } catch (err) {
          Toast.show('Could not save: ' + err.message, 'err');
        }
      }));
      panel.appendChild(el('div', { class: 'settings-row' }, [
        el('div', {}, [
          el('div', { class: 'setting-key' }, [key]),
          desc ? el('div', { class: 'setting-desc' }, [desc]) : null
        ]),
        valueInput,
        saveBtn
      ]));
    });
  }

  function buildAddForm(container, onSaved) {
    const keyInput = el('input', { type: 'text', placeholder: 'e.g. NOTIFY_ON_IMPORT' });
    const valueInput = el('input', { type: 'text', placeholder: 'value' });
    const saveBtn = el('button', { class: 'btn btn-primary btn-sm' }, ['Save setting']);
    saveBtn.addEventListener('click', withButtonLoading(saveBtn, async function () {
      if (!keyInput.value.trim()) { Toast.show('A key is required.', 'err'); return; }
      try {
        await Api.upsertSetting(keyInput.value.trim(), valueInput.value);
        Toast.show('Saved "' + keyInput.value.trim() + '".', 'ok');
        keyInput.value = ''; valueInput.value = '';
        onSaved();
      } catch (err) {
        Toast.show('Could not save: ' + err.message, 'err');
      }
    }));
    container.appendChild(el('div', { class: 'filter-bar' }, [
      el('div', { class: 'filter-field' }, [el('span', { class: 'field-label' }, ['Key']), keyInput]),
      el('div', { class: 'filter-field grow' }, [el('span', { class: 'field-label' }, ['Value']), valueInput]),
      saveBtn
    ]));
  }

  // =====================================================================
  // Shared view chrome
  // =====================================================================

  function viewTitleRow(title, lede, actionsHtml) {
    return '<div class="view-title-row">' +
      '<div><h1>' + escapeHtml(title) + '</h1><div class="lede">' + escapeHtml(lede) + '</div></div>' +
      '<div class="topbar-actions">' + (actionsHtml || '') + '</div>' +
      '</div>';
  }

  const DataCache = {
    facets: null,
    async getFacets() {
      if (!this.facets) this.facets = await Api.statistics().then(function (s) {
        return { statuses: s.statusSummary ? Object.keys(s.statusSummary) : [], faculties: s.facultyStatistics.map(function (f) { return { code: f.code }; }), universities: s.universities.map(function (u) { return u.university; }) };
      });
      return this.facets;
    }
  };

  // =====================================================================
  // Hash router
  // =====================================================================

  const Router = {
    current: 'dashboard',
    render() {
      const hash = (location.hash || '#/dashboard').replace('#/', '');
      const view = Views[hash] ? hash : 'dashboard';
      this.current = view;
      qsa('.nav-link').forEach(function (link) {
        link.classList.toggle('active', link.getAttribute('data-view') === view);
      });
      const root = qs('#view');
      Views[view].render(root);
    },
    init() {
      window.addEventListener('hashchange', this.render.bind(this));
      qsa('.nav-link').forEach((function (link) {
        link.addEventListener('click', function () { location.hash = '#/' + link.getAttribute('data-view'); });
      }));
      this.render();
    }
  };

  // =====================================================================
  // Health indicator
  // =====================================================================

  function pollHealth() {
    const pill = qs('#health-pill');
    Api.health().then(function () {
      pill.classList.remove('bad'); pill.classList.add('ok');
      qs('#health-text', pill).textContent = 'Connected';
    }).catch(function () {
      pill.classList.remove('ok'); pill.classList.add('bad');
      qs('#health-text', pill).textContent = 'Unreachable';
    });
  }

  // =====================================================================
  // Boot
  // =====================================================================

  document.addEventListener('DOMContentLoaded', function () {
    Toast.init();
    Drawer.init();
    Router.init();
    pollHealth();
    setInterval(pollHealth, 60000);
  });
})();