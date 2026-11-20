// [lane:pages] Entry: wires the page-level modules once the first PPT frame has been drawn.
import {bus} from './bus.js';
import {loadStyles} from './pages-dom.js';
import {createSlideRail} from './slide-rail.js';
import {createNotes} from './notes.js';
import {createSlideshow} from './slideshow.js';
import {createAnimationPane} from './animation-pane.js';

let started = false, count = 0, index = 0;
bus.on('doc:drawn', d => {
  count = d.count; index = d.part;
  if (started) return; started = true;
  const api = window.willbuddyOffice; loadStyles();
  const rail = createSlideRail({bus, api}), notes = createNotes({bus, api}), show = createSlideshow({bus, api, getCount: () => count, getCurrent: () => index}), pane = createAnimationPane({bus, api});
  bus.emit('doc:drawn', d); // replay for modules created after the first frame
  void notes.load(d.part);
  window.wbPages = {rail, notes, show, pane};
});
bus.on('pages:error', d => { const el = document.getElementById('error'); if (el) { el.hidden = false; el.textContent = d.message; } });
