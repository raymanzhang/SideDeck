// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

import {test,expect} from '@playwright/test';
test('fullscreen UI waits for native completion; Escape respects detail/settings layers',async({page})=>{
  await page.goto('/tests/fixture.html');
  const enter=page.getByRole('button',{name:'Enter fullscreen',exact:true}); await expect(enter).toBeEnabled();
  await enter.click();
  await expect(page.getByRole('button',{name:'Entering fullscreen…',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Exit fullscreen',exact:true})).toHaveCount(0);
  await page.evaluate(()=>(window as any).pushWindow({actualFullscreen:true,transition:null}));
  await expect(page.getByRole('button',{name:'Exit fullscreen',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const before=await page.evaluate(()=>(window as any).windowUpdates().length);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(()=>(window as any).windowUpdates().length)).toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Exiting fullscreen…',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).windowUpdates().at(-1))).toMatchObject({fullscreenWanted:false});
  await page.evaluate(()=>(window as any).pushWindow({actualFullscreen:false,transition:null}));
  await expect(page.getByRole('button',{name:'Enter fullscreen',exact:true})).toBeEnabled();
});
test('actual display feedback, fallback, retry and legacy import never write old local key',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('sys-hud:window-prefs',JSON.stringify({alwaysOnTop:true})));
  await page.goto('/tests/fixture.html');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByRole('button',{name:'Always on top: On'})).toHaveAttribute('aria-pressed','true');
  await page.getByLabel('Target display').selectOption('main');
  expect(await page.evaluate(()=>(window as any).windowUpdates().at(-1))).toMatchObject({target:{mode:'display',id:'main'}});
  await page.evaluate(()=>(window as any).pushWindow({error:'Transition timed out',fallbackReason:'Selected display is disconnected'}));
  await expect(page.getByRole('alert')).toContainText('Transition timed out');
  await page.getByRole('button',{name:'Retry window settings'}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sys-hud:window-prefs')!))).toEqual({alwaysOnTop:true});
});

test('native Escape notifications close exactly one UI layer before exiting fullscreen',async({page})=>{
  await page.goto('/tests/fixture.html');
  await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
  await page.evaluate(()=>(window as any).pushWindow({actualFullscreen:true,transition:null}));
  await page.evaluate(()=>(window as any).pushMetrics({sample_id:1,sampled_at_ms:1000,sample_gap:true,cpu:{overall:20,cores:[20]},memory:{used:1,total:2,percent:50},disk:null,network:{rx_rate:null,tx_rate:null},temperature:{cpu:null},battery:null}));
  await page.getByRole('button',{name:'Open CPU details'}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.evaluate(()=>(window as any).nativeEscape());
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('region',{name:'CPU details'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Exit fullscreen',exact:true})).toBeEnabled();
  await page.evaluate(()=>(window as any).nativeEscape());
  await expect(page.getByRole('region',{name:'CPU details'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Open CPU details'})).toBeFocused();
  await expect(page.getByRole('button',{name:'Exit fullscreen',exact:true})).toBeEnabled();
  await page.evaluate(()=>(window as any).nativeEscape());
  await expect(page.getByRole('button',{name:'Exiting fullscreen…',exact:true})).toBeDisabled();
});
