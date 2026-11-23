// Runs inside the opaque, network-disabled frame with the paginated renderer.
export function installPanelPreview({token, pdf, content, pages, data}) {
  const post = (kind, fields) => parent.postMessage({kind, token, ...fields}, '*');
  const normalize = text => text.replace(/\s+/g, '').toLocaleLowerCase();
  let current = 1, zoom = 100, fit = 'width', lastQuery = '', matchIndex = -1;
  let raf;
  let entries = [];
  document.body.classList.add('panel');
  const pageNumber = () => {
    const scroll = document.scrollingElement;
    if (scroll.scrollHeight > scroll.clientHeight && scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2) return pages.length;
    const anchor = Math.min(innerHeight * .35, 160);
    const index = pages.findIndex(({section}) => section.getBoundingClientRect().bottom > anchor);
    return index < 0 ? pages.length : index + 1;
  };
  const publish = () => {
    current = pageNumber();
    const anchor = Math.min(innerHeight * .35, 160);
    const activeOutline = entries.findLastIndex(({page, y}) => {
      if (!page) return false;
      if (page !== current) return data.sourceFormat !== 'pptx' && page < current;
      if (y === undefined) return true;
      const box = pages[page - 1].sheet.getBoundingClientRect();
      return box.top + box.height * y / 100 <= anchor;
    });
    const sheets = data.sheets?.length;
    const sheet = data.sourceFormat === 'xlsx' && activeOutline >= 0 ? activeOutline + 1 : undefined;
    post('office-panel-state', {current, pages: pages.length, zoom, activeOutline, sheet, sheets});
  };
  const jump = number => pages[number - 1]?.section.scrollIntoView({block: 'start'});
  const clamp = value => Math.round(Math.max(50, Math.min(200, value)));
  const resize = keepPage => {
    const saved = current;
    const match = keepPage && content.querySelector('.pdf-highlight');
    const matchRect = match && match.getBoundingClientRect();
    if (fit) {
      const {canvas} = pages[saved - 1];
      const width = (document.documentElement.clientWidth - 30) / canvas.width;
      zoom = clamp(125 * (fit === 'page' ? Math.min(width, (innerHeight - 28) / canvas.height) : width));
    }
    for (const {sheet, canvas} of pages) sheet.style.width = (canvas.width * zoom / 125) + 'px';
    if (keepPage) {
      if (matchRect && matchRect.bottom > 0 && matchRect.top < innerHeight) {
        match.scrollIntoView({block:'center'});
      } else jump(saved);
    }
    publish();
  };
  const search = (query, fromPage) => {
    const needle = normalize(query);
    for (const mark of content.querySelectorAll('.pdf-highlight')) mark.remove();
    if (!needle) { lastQuery = ''; return; }
    const matches = [];
    for (const page of pages) {
      if (fromPage && page.number !== fromPage) continue;
      let start = 0;
      while ((start = page.searchText.indexOf(needle, start)) >= 0) {
        matches.push({page, start, end: start + needle.length});
        start += needle.length;
      }
    }
    if (!matches.length) return;
    matchIndex = !fromPage && needle === lastQuery ? (matchIndex + 1) % matches.length : 0;
    lastQuery = fromPage ? '' : needle;
    const {page, start, end} = matches[matchIndex];
    for (const item of page.text) {
      if (item.end <= start || item.start >= end) continue;
      const mark = document.createElement('span');
      mark.className = 'pdf-highlight';
      const fraction = (Math.max(start, item.start) - item.start) / (item.end - item.start);
      const width = (Math.min(end, item.end) - Math.max(start, item.start)) / (item.end - item.start);
      mark.style.cssText = `left:${item.x + item.width * fraction}%;top:${item.y}%;width:${item.width * width}%;height:${item.height}%`;
      page.sheet.append(mark);
    }
    (page.sheet.querySelector('.pdf-highlight') || page.section).scrollIntoView({block:'center'});
  };
  const command = ({command, text, page}) => {
    if (command === 'find' && typeof text === 'string') return search(text.slice(0, 160));
    if (command === 'jump') {
      if (Number.isInteger(page)) jump(page);
      if (typeof text === 'string' && text && Number.isInteger(page)) search(text, page);
      return;
    }
    if (command === 'previous' || command === 'next') return jump(current + (command === 'previous' ? -1 : 1));
    if (command === 'width' || command === 'page') fit = command;
    else if (command === 'in' || command === 'out') { fit = ''; zoom = clamp(zoom + (command === 'in' ? 10 : -10)); }
    else return;
    resize(true);
  };
  addEventListener('message', event => {
    if (event.source === parent && event.data?.token === token && event.data.kind === 'office-panel-command') command(event.data);
  });
  addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = undefined; publish(); });
  }, {passive:true});
  addEventListener('resize', () => resize(true));
  addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (event.deltaY) command({command:event.deltaY < 0 ? 'in' : 'out'});
  }, {passive:false});
  resize(false);

  async function metadata() {
    let count;
    if (data.sourceFormat === 'pptx') {
      entries = pages.map(({canvas, number}) => {
        const thumbnail = document.createElement('canvas');
        thumbnail.width = 190;
        thumbnail.height = Math.max(1, Math.round(canvas.height * thumbnail.width / canvas.width));
        const context = thumbnail.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, thumbnail.width, thumbnail.height);
        context.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
        return {title:'幻灯片 ' + number, page:number, image:thumbnail.toDataURL()};
      });
    } else if (data.sourceFormat === 'docx') {
      if (Number.isInteger(data.wordCount)) count = data.wordCount + ' 字';
      entries = (data.headings || []).flatMap(({title, level}) => {
        const needle = normalize(title);
        if (!needle) return [];
        const page = pages.find(p => p.searchText.includes(needle));
        if (!page) return [];
        const offset = page.searchText.indexOf(needle);
        const y = page.text.find(item => item.start <= offset && offset < item.end)?.y;
        return [{title, level, page:page.number, text:title, y}];
      });
    } else if (data.sourceFormat === 'xlsx' && data.sheets?.length) {
      const outline = await pdf.getOutline().catch(() => null);
      for (const [index, title] of data.sheets.entries()) {
        const bookmark = outline?.find(entry => entry.title === title);
        const dest = typeof bookmark?.dest === 'string' ? await pdf.getDestination(bookmark.dest).catch(() => null) : bookmark?.dest;
        const mapped = dest?.[0] ? await pdf.getPageIndex(dest[0]).then(n => n + 1).catch(() => undefined) : undefined;
        const page = mapped || (data.sheets.length === pages.length ? index + 1 : undefined);
        entries.push({title, page});
      }
    }
    post('office-panel-metadata', {count, entries});
    publish();
  }
  return metadata();
}
