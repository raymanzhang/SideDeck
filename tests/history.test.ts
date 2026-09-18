// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendSample, emptyHistory, checkFreshness } from '../src/state/systemHistory.ts';
import { chartSegments, networkCeiling } from '../src/state/charts.ts';
import { formatBytes, formatRate } from '../src/utils/format.ts';
import type { SystemMetrics } from '../src/types/system.ts';
const sample = (id: number, time: number, gap=false): SystemMetrics => ({
  sample_id: id, sampled_at_ms: time, sample_gap: gap,
  cpu: {overall: 42, cores: [20,64]}, memory: {used:50,total:100,percent:50},
  disk:null, network:{rx_rate:null,tx_rate:null}, temperature:{cpu:null},battery:null,
});
test('waiting, first null rates, duplicates, delayed samples, staleness and recovery use an injected clock', () => {
  let state = emptyHistory();
  assert.equal(checkFreshness(state, 20000, 20000).paused, false);
  state = appendSample(state, sample(1, 1000,true), 1000, 1000);
  assert.equal(state.samples.length, 1); assert.equal(state.samples[0].network.rx_rate, null);
  assert.equal(appendSample(state,sample(1,1000),7000,7000),state);
  state = appendSample(state,sample(2,4000),4000,4000);
  assert.equal(state.samples[1].sample_gap,false);
  assert.equal(checkFreshness(state,10000,10000).paused,false);
  state = checkFreshness(state,10001,10001); assert.equal(state.paused,true);
  state = appendSample(state,sample(3,14000),14000,14000);
  assert.equal(state.paused,false); assert.equal(state.samples[2].sample_gap,true);
  assert.equal(checkFreshness(state,14010,60000).paused,true, 'sleep detected even if performance clock stops');
});
test('history retains at most 60 seconds and 64 real points, rollback starts a new segment', () => {
  let state = emptyHistory();
  for(let i=1;i<=120;i++) state=appendSample(state,sample(i,i*1000),i*1000,i*1000);
  assert.equal(state.samples[0].sampled_at_ms,60000); assert.equal(state.samples.length,61);
  assert.equal(appendSample(state,sample(1,1000),122000,122000),state);
  state=appendSample(state,sample(121,200),123000,123000);
  assert.equal(state.samples.length,1); assert.equal(state.samples[0].sample_gap,true);
  for(let i=122;i<222;i++) state=appendSample(state,sample(i,200+i),123000+i,123000+i);
  assert.equal(state.samples.length,64);
});
test('common network ceiling, zero lines, missing values and gaps never invent points or NaN geometry', () => {
  assert.equal(networkCeiling([10_000_000,1_000_000]),10_000_000);
  assert.equal(networkCeiling([0,0,null,NaN,Infinity]),1);
  const points = [{time:1000,value:0},{time:3000,value:0},{time:5000,value:null},{time:7000,value:10},{time:17000,value:2},{time:19000,value:3,gap:true}];
  const segments=chartSegments(points,19000,100);
  assert.deepEqual(segments.map(s=>s.length),[2,1,1,1]);
  assert.equal(segments[0][0].y,78); assert.equal(segments[0][1].y,78);
  assert.equal(chartSegments([{time:10,value:NaN},{time:20,value:Infinity}],20,1).length,0);
  assert.ok(segments.flat().every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  assert.equal(chartSegments([],0,100).length,0);
  assert.equal(formatRate(null),'Unavailable'); assert.equal(formatRate(0),'0 B/s');
  assert.equal(formatBytes(NaN),'Unavailable');
});
