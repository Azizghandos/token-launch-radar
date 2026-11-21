// Token Radar's export helpers: CSV / JSON download of the ranked board, a plain-text
// summary of the board, and a copy-link action. The dashboard's app.js calls these
// through window.TokenRadarExport; nothing here reaches the network or any outside
// source — every value comes from the rows the caller passes in.
//
// A row is one ranked protocol:
//   { rank, name, slug, category, chains, tvl_usd, change_7d, age_days,
//     implied_value_usd, on_watchlist }
// where chains is an array of chain names, change_7d and age_days may be null,
// and on_watchlist is a boolean.
(function () {
  'use strict';

  var DEFAULT_CSV_NAME = 'token-radar-board.csv';
  var DEFAULT_JSON_NAME = 'token-radar-board.json';

  // The board's columns, in order — the header row of every CSV export, and the
  // field names of every JSON export.
  var FIELDS = [
    'Rank',
    'Protocol',
    'Slug',
    'Category',
    'Chains',
    'TVL USD',
    '7d %',
    'Age days',
    'Implied value USD',
    'Watchlist'
  ];

  // One CSV cell: numbers stay plain, null/undefined become empty, and any field
  // holding a comma, a quote, or a line break is wrapped in quotes with each inner
  // quote doubled.
  function csvCell(value) {
    if (value === null || value === undefined) return '';
    var text = String(value);
    if (text.indexOf(',') >= 0 || text.indexOf('"') >= 0 ||
        text.indexOf('\n') >= 0 || text.indexOf('\r') >= 0) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  // One row of the board as its ten CSV cells, in header order.
  function rowCells(row) {
    return [
      csvCell(row.rank),
      csvCell(row.name),
      csvCell(row.slug),
      csvCell(row.category),
      csvCell((row.chains || []).join(';')),
      csvCell(row.tvl_usd),
      csvCell(row.change_7d),
      csvCell(row.age_days),
      csvCell(row.implied_value_usd),
      csvCell(row.on_watchlist)
    ];
  }

  // The whole board as a CSV string: the header row, then one row per protocol.
  function toCSV(rows) {
    var lines = [FIELDS.map(csvCell).join(',')];
    (rows || []).forEach(function (row) {
      lines.push(rowCells(row).join(','));
    });
    return lines.join('\n');
  }

  // One row of the board as a plain object with the same fields the CSV uses,
  // so a JSON export and a CSV export always agree about the board.
  function rowObject(row) {
    var obj = {};
    obj['Rank'] = row.rank === undefined ? null : row.rank;
    obj['Protocol'] = row.name === undefined ? null : row.name;
    obj['Slug'] = row.slug === undefined ? null : row.slug;
    obj['Category'] = row.category === undefined ? null : row.category;
    obj['Chains'] = row.chains || [];
    obj['TVL USD'] = row.tvl_usd === undefined ? null : row.tvl_usd;
    obj['7d %'] = row.change_7d === undefined ? null : row.change_7d;
    obj['Age days'] = row.age_days === undefined ? null : row.age_days;
    obj['Implied value USD'] = row.implied_value_usd === undefined ? null : row.implied_value_usd;
    obj['Watchlist'] = row.on_watchlist === undefined ? null : row.on_watchlist;
    return obj;
  }

  // The whole board as indented JSON.
  function toJSON(rows) {
    return JSON.stringify((rows || []).map(rowObject), null, 2);
  }

  // The shared download pattern: a Blob, a temporary object URL, a temporary
  // link the browser clicks, then the URL is revoked. Returns true when the
  // download was started, false when the browser cannot do it.
  function downloadBlob(text, type, filename) {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' ||
        typeof URL.createObjectURL !== 'function' || typeof document === 'undefined') {
      return false;
    }
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  }

  function downloadCSV(rows, filename) {
    return downloadBlob(toCSV(rows), 'text/csv;charset=utf-8', filename || DEFAULT_CSV_NAME);
  }

  function downloadJSON(rows, filename) {
    return downloadBlob(toJSON(rows), 'application/json', filename || DEFAULT_JSON_NAME);
  }

  // The middle value of a sorted list: the middle one for an odd count, the
  // mean of the two middle ones for an even count, 0 for an empty list.
  function median(values) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // The board in five plain-text lines: how many rows, the total TVL, the median
  // implied value, the category with the most rows, and how many rows are on the
  // watchlist. Plain numbers throughout — no formatting.
  function boardSummary(rows) {
    var list = rows || [];
    var totalTvl = 0;
    var watchlist = 0;
    var implied = [];
    var byCategory = {};
    list.forEach(function (row) {
      if (typeof row.tvl_usd === 'number' && isFinite(row.tvl_usd)) {
        totalTvl += row.tvl_usd;
      }
      if (typeof row.implied_value_usd === 'number' && isFinite(row.implied_value_usd)) {
        implied.push(row.implied_value_usd);
      }
      if (row.on_watchlist) watchlist += 1;
      var category = row.category || 'Other';
      byCategory[category] = (byCategory[category] || 0) + 1;
    });
    var topCategory = 'none';
    var topCount = 0;
    Object.keys(byCategory).forEach(function (category) {
      if (byCategory[category] > topCount) {
        topCount = byCategory[category];
        topCategory = category;
      }
    });
    return [
      'Rows: ' + list.length,
      'Total TVL: ' + totalTvl,
      'Median implied value: ' + median(implied),
      'Top category: ' + topCategory + ' (' + topCount + ')',
      'Watchlist rows: ' + watchlist
    ].join('\n');
  }

  // Copy with the clipboard API when the browser offers it, with a hidden
  // textarea and the old copy command as the fallback. Resolves true on success.
  function fallbackCopy(text) {
    if (typeof document === 'undefined') return false;
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  function copyLink() {
    var href = window.location.href;
    if (typeof navigator !== 'undefined' && navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(href).then(
        function () { return true; },
        function () { return fallbackCopy(href); }
      );
    }
    return Promise.resolve(fallbackCopy(href));
  }

  window.TokenRadarExport = {
    toCSV: toCSV,
    downloadCSV: downloadCSV,
    toJSON: toJSON,
    downloadJSON: downloadJSON,
    boardSummary: boardSummary,
    copyLink: copyLink
  };
})();
