'use strict';

(() => {
  const {formatSize, extensionOf, createModel, queryRecords, chartSegments} = window.DiskCore;
  const element = id => document.getElementById(id);
  const number = value => new Intl.NumberFormat('en-US').format(value);
  const zone = element('drop-zone');
  const pageSize = 100;
  let snapshot = null;
  let model = null;
  let folderId = 0;
  let pageIndex = 0;
  let busy = false;
  let exporting = false;
  let dragDepth = 0;
  let searchTimer;

  function setStatus(message, warning = false) {
    element('status').textContent = message;
    element('status').classList.toggle('warning', warning);
  }
  function setBusy(value) {
    busy = value;
    element('choose-folder').disabled = value || exporting;
    element('cancel-scan').hidden = !value;
    element('export-csv').disabled = value || exporting || !snapshot;
    zone.setAttribute('aria-busy', String(value));
  }
  function getQuery() {
    return {folderId, search: element('search').value, scope: element('scope').value,
      kind: element('kind').value, extension: element('extension').value,
      minimumSize: Number(element('minimum-size').value)};
  }
  function clearFilters() {
    clearTimeout(searchTimer);
    element('search').value = '';
    element('scope').value = 'children';
    element('kind').value = 'all';
    element('extension').value = '';
    element('minimum-size').value = '0';
    pageIndex = 0;
  }
  function navigate(id) {
    folderId = id;
    clearFilters();
    renderFolder();
  }
  function renderBreadcrumbs() {
    const trail = [];
    for (let current = model.byId.get(folderId); current; current = model.byId.get(current.parentId)) trail.unshift(current);
    const fragment = document.createDocumentFragment();
    trail.forEach((record, index) => {
      if (index) { const separator = document.createElement('span'); separator.textContent = '/'; fragment.append(separator); }
      const button = document.createElement('button');
      button.textContent = record.name;
      if (record.id === folderId) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => navigate(record.id));
      fragment.append(button);
    });
    element('breadcrumbs').replaceChildren(fragment);
  }
  function renderChart() {
    const folder = model.byId.get(folderId);
    const children = model.children.get(folderId) || [];
    const segments = chartSegments(children);
    const svg = element('space-chart');
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const title = document.createElementNS(svgNamespace, 'title');
    title.id = 'chart-title';
    title.textContent = `${folder.name}: ${formatSize(folder.size)} in ${number(children.length)} immediate items.`;
    svg.replaceChildren(title);
    const background = document.createElementNS(svgNamespace, 'circle');
    for (const [key, value] of Object.entries({cx: 120, cy: 120, r: 92, fill: 'none', stroke: '#293447', 'stroke-width': 24})) background.setAttribute(key, value);
    svg.append(background);
    let offset = 0;
    const circumference = 2 * Math.PI * 92;
    const legend = document.createDocumentFragment();
    segments.forEach(segment => {
      const fraction = folder.size ? segment.size / folder.size : 0;
      const arc = document.createElementNS(svgNamespace, 'circle');
      const length = fraction * circumference;
      for (const [key, value] of Object.entries({cx: 120, cy: 120, r: 92, fill: 'none', stroke: segment.color,
        'stroke-width': 24, 'stroke-dasharray': `${length} ${circumference - length}`, 'stroke-dashoffset': -offset})) arc.setAttribute(key, value);
      const arcTitle = document.createElementNS(svgNamespace, 'title');
      arcTitle.textContent = `${segment.name}: ${formatSize(segment.size)} (${(fraction * 100).toFixed(1)}%)`;
      arc.append(arcTitle); svg.append(arc); offset += length;
      const isFolder = segment.type === 'folder' && segment.recordId !== null;
      const row = document.createElement(isFolder ? 'button' : 'div');
      row.className = `legend-item${isFolder ? ' folder' : ''}`;
      row.title = arcTitle.textContent;
      const dot = document.createElement('span'); dot.className = 'legend-dot'; dot.style.backgroundColor = segment.color;
      const name = document.createElement('span'); name.textContent = segment.name;
      const size = document.createElement('span'); size.textContent = `${formatSize(segment.size)} · ${(fraction * 100).toFixed(1)}%`;
      row.append(dot, name, size);
      if (isFolder) row.addEventListener('click', () => navigate(segment.recordId));
      legend.append(row);
    });
    if (!segments.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'No file data in this folder. Empty items still appear in the list.'; legend.append(empty); }
    element('chart-legend').replaceChildren(legend);
    element('chart-total').textContent = formatSize(folder.size);
  }
  function renderList() {
    if (!model) return;
    const folder = model.byId.get(folderId);
    const query = getQuery();
    const records = queryRecords(model, query);
    const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
    pageIndex = Math.min(pageIndex, pageCount - 1);
    const visible = records.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
    element('result-count').textContent = `${number(records.length)} matching ${records.length === 1 ? 'item' : 'items'} · ${query.scope === 'descendants' ? 'including subfolders' : 'immediate children'}`;
    element('page-label').textContent = `Page ${number(pageIndex + 1)} of ${number(pageCount)}`;
    element('previous-page').disabled = pageIndex === 0;
    element('next-page').disabled = pageIndex >= pageCount - 1;
    const fragment = document.createDocumentFragment();
    visible.forEach(record => {
      const percentage = folder.size ? record.size / folder.size * 100 : 0;
      const row = document.createElement(record.type === 'folder' ? 'button' : 'div');
      row.className = `entry ${record.type}`;
      const icon = document.createElement('span'); icon.className = 'entry-icon'; icon.textContent = record.type === 'folder' ? '▱' : '≡'; icon.setAttribute('aria-hidden', 'true');
      const detail = document.createElement('span');
      const name = document.createElement('span'); name.className = 'entry-name'; name.textContent = record.name; detail.append(name);
      if (record.partial) { const partial = document.createElement('span'); partial.className = 'partial-label'; partial.textContent = 'Partial scan'; detail.append(partial); }
      if (query.scope === 'descendants') { const path = document.createElement('span'); path.className = 'entry-path'; path.textContent = record.relativePath; detail.append(path); }
      const track = document.createElement('span'); track.className = 'track'; track.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('span'); fill.className = 'fill'; fill.style.width = `${percentage}%`; track.append(fill); detail.append(track);
      const size = document.createElement('span'); size.className = 'entry-size'; size.textContent = formatSize(record.size);
      const percent = document.createElement('small'); percent.textContent = percentage > 0 && percentage < .1 ? '< 0.1%' : `${percentage.toFixed(1)}%`; size.append(percent);
      row.append(icon, detail, size);
      if (record.type === 'folder') row.addEventListener('click', () => navigate(record.id));
      fragment.append(row);
    });
    if (!visible.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = (model.children.get(folderId) || []).length ? 'No matches. Try clearing the filters or including subfolders.' : 'This folder is empty.'; fragment.append(empty); }
    element('entries').replaceChildren(fragment);
  }
  function renderFolder() {
    element('folder-title').textContent = model.byId.get(folderId).name;
    renderBreadcrumbs(); renderChart(); renderList();
  }
  function showSnapshot(result) {
    snapshot = result;
    model = createModel(snapshot.records);
    folderId = 0;
    clearFilters();
    element('total-size').textContent = formatSize(snapshot.totalSize);
    element('file-count').textContent = number(snapshot.fileCount);
    element('folder-count').textContent = number(snapshot.folderCount);
    const extensions = [...new Set(snapshot.records.filter(record => record.type === 'file').map(extensionOf))].sort();
    element('extension').replaceChildren(new Option('All extensions', ''));
    for (const extension of extensions) element('extension').append(new Option(extension, extension));
    element('scan-details').hidden = !snapshot.errorCount && !snapshot.skippedCount;
    element('scan-summary').textContent = `${number(snapshot.errorCount)} unreadable items. ${number(snapshot.skippedCount)} symbolic links or special files skipped. Totals include readable files only.`;
    const errors = document.createDocumentFragment();
    for (const error of snapshot.errors) { const item = document.createElement('li'); item.textContent = `${error.path}: ${error.code}`; errors.append(item); }
    element('scan-errors').replaceChildren(errors);
    element('results').hidden = false;
    renderFolder();
    setStatus(`${snapshot.errorCount ? 'Partial scan' : 'Scan complete'} · ${number(snapshot.fileCount)} files · ${snapshot.rootPath}${snapshot.skippedCount ? ` · ${number(snapshot.skippedCount)} links or special files skipped` : ''}`, snapshot.errorCount > 0);
  }
  async function scan(operation) {
    if (busy || exporting) return;
    const previousStatus = element('status').textContent;
    const previousWarning = element('status').classList.contains('warning');
    setBusy(true);
    setStatus('Choose a folder or wait for the scan to begin…');
    try {
      const result = await operation();
      if (result.status === 'complete') showSnapshot(result.snapshot);
      else setStatus(snapshot ? `Scan canceled. Previous results are still available. ${previousStatus}` : 'Scan canceled. Choose a folder to start again.', previousWarning);
    } catch (error) {
      setStatus(`${error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')}${snapshot ? ' Previous results are still available.' : ''}`, true);
    } finally { setBusy(false); }
  }
  if (!window.diskAPI) {
    element('choose-folder').disabled = true;
    setStatus('Open the Disk Analyzer desktop application. This page is not a browser-based scanner.', true);
    return;
  }
  window.diskAPI.onProgress(progress => {
    if (busy) setStatus(`Scanning… ${number(progress.fileCount)} files · ${formatSize(progress.totalSize)}${progress.errorCount ? ` · ${number(progress.errorCount)} unreadable items` : ''}`);
  });
  element('choose-folder').addEventListener('click', () => scan(() => window.diskAPI.chooseFolder()));
  element('cancel-scan').addEventListener('click', async () => {
    element('cancel-scan').disabled = true;
    try { await window.diskAPI.cancelScan(); }
    catch (error) { setStatus(error.message, true); }
    finally { element('cancel-scan').disabled = false; }
  });
  element('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { pageIndex = 0; renderList(); }, 150); });
  for (const id of ['scope', 'kind', 'extension', 'minimum-size']) element(id).addEventListener('change', () => { pageIndex = 0; renderList(); });
  element('clear-filters').addEventListener('click', () => { clearFilters(); renderList(); });
  element('previous-page').addEventListener('click', () => { pageIndex--; renderList(); });
  element('next-page').addEventListener('click', () => { pageIndex++; renderList(); });
  element('export-csv').addEventListener('click', async () => {
    if (busy || exporting || !snapshot) return;
    clearTimeout(searchTimer); renderList();
    const query = getQuery();
    exporting = true; setBusy(false);
    try {
      const result = await window.diskAPI.exportCSV(query);
      if (result.status === 'saved') setStatus(`Exported ${number(result.rowCount)} matching rows to ${result.filePath}`);
      else setStatus('Export canceled. No CSV was saved.');
    } catch (error) { setStatus(`Could not export CSV: ${error.message}`, true); }
    finally { exporting = false; setBusy(false); }
  });
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', event => event.preventDefault());
  zone.addEventListener('dragenter', event => { event.preventDefault(); if (!busy && !exporting) { dragDepth++; zone.classList.add('dragging'); } });
  zone.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) zone.classList.remove('dragging'); });
  zone.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = busy || exporting ? 'none' : 'copy'; });
  zone.addEventListener('drop', event => {
    event.preventDefault(); dragDepth = 0; zone.classList.remove('dragging');
    if (busy || exporting) return;
    const files = [...event.dataTransfer.files];
    if (files.length !== 1) { setStatus('Please drop one folder at a time.', true); return; }
    // Resolve the dropped OS file reference while the drop event is active.
    scan(() => window.diskAPI.scanDroppedFolder(files[0]));
  });
})();
