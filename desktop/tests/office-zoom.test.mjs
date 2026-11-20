import test from 'node:test';
import assert from 'node:assert/strict';
import {fitOfficePage,stepOfficeZoom,officeSlideTileSize} from '../src/shared/office-zoom.js';

test('fits wide and tall pages inside the native tile with bounded scale', () => {
  for (const [width,height] of [[19200,10800],[10800,19200],[12000,7000]]) {
    const scale=fitOfficePage(width,height,900,700);
    if (scale<30) { assert.ok(width<=900*scale); assert.ok(height<=700*scale); }
  }
  assert.equal(fitOfficePage(0,1,900,700),null);
  assert.equal(fitOfficePage(999999,999999,900,700),30);
  assert.equal(stepOfficeZoom(8,-1),8);
  assert.equal(stepOfficeZoom(30,1),30);
  assert.equal(stepOfficeZoom(15,-1),14);
});

test('clips native tile padding at slide edges and respects the viewport offset', () => {
  assert.deepEqual(officeSlideTileSize({width:900,height:700,documentWidth:19201,documentHeight:10801,x:0,y:0,scale:22}),{width:873,height:491});
  assert.deepEqual(officeSlideTileSize({width:900,height:700,documentWidth:19201,documentHeight:10801,x:100,y:220,scale:22}),{width:869,height:481});
  assert.equal(officeSlideTileSize({width:900}),null);
});
