import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {chromium,expect} from '@playwright/test'
test('arrêté : contrôle DAF, révision motivée, historique et lecture seule PDG', {skip:process.env.RUN_MANAGEMENT_STATEMENT_UI!=='1'},async()=>{
 let vite,browser
 try{
  vite=await createServer({server:{host:'127.0.0.1',port:0,watch:null},plugins:[{name:'statement-ui',configureServer(server){server.middlewares.use('/__statement-test',async(_req,res,next)=>{try{const html=await server.transformIndexHtml('/__statement-test',`<html><body style="margin:24px;font-family:Arial;background:#f3f5f8"><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {ManagementStatements} from '/src/pages/manager/procurement/ManagementStatements.tsx';createRoot(document.getElementById('root')).render(React.createElement(ManagementStatements,{role:new URLSearchParams(location.search).get('role')||'daf',handleAuth:()=>false}));</script></body></html>`);res.setHeader('Content-Type','text/html');res.end(html)}catch(err){next(err)}})}}]});await vite.listen()
  const base=`http://127.0.0.1:${vite.httpServer.address().port}`;browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1400,height:1100}})
  const saved=[];let changed=false;let posts=0;const errors=[];page.on('pageerror',err=>errors.push(err.message))
  const snapshot=month=>({month,receivedOrders:[{id:'bc',requestId:'r',reference:'BC-TEST',date:'01/01/2026',siteName:'Chantier test',supplierName:'Fournisseur test',amountFcfa:changed?200:100,invoice:'F-1',invoicePaid:false,invoiceTransmitted:true,invoiceFileName:'facture.pdf',verification:''}],budgetsAtReading:[]})
  await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base){await route.abort();return}if(!url.pathname.startsWith('/api/')){await route.continue();return}
   if(route.request().method()==='POST'){
    const body=route.request().postDataJSON();assert.equal(body.reviewed,true);assert.equal(body.pin,'2468');if(saved.length)assert.ok(body.comment.length>=10)
    posts++;const statement={id:'stmt-'+posts,month:body.month,version:posts,snapshot:snapshot(body.month),sourceHash:changed?'b'.repeat(64):'a'.repeat(64),validatedByName:'DAF test',validatedAt:new Date().toISOString(),comment:body.comment};saved.unshift(structuredClone(statement));await route.fulfill({status:201,json:{statement}});return
   }
   const month=url.searchParams.get('month');await route.fulfill({json:{snapshot:snapshot(month),sourceHash:changed?'b'.repeat(64):'a'.repeat(64),statements:saved,readAt:new Date().toISOString()}})
  })
  await page.goto(`${base}/__statement-test`)
  const validate=page.getByRole('button',{name:'Valider et conserver cette lecture'});await expect(validate).toBeDisabled()
  await page.getByRole('checkbox').check();await page.locator('input[type=password]').fill('2468');await validate.click()
  await expect(page.getByRole('link',{name:'Imprimer la version validée'})).toBeVisible();assert.equal(posts,1)
  changed=true;await page.getByRole('button',{name:'Actualiser la lecture'}).click();await expect(page.getByText('BC-TEST')).toBeVisible();await page.locator('select').selectOption('live')
  await expect(page.getByText('Écart avec la dernière version',{exact:false})).toBeVisible();await page.getByRole('checkbox').check();await page.locator('input[type=password]').fill('2468');await expect(validate).toBeDisabled();await page.locator('textarea').fill('Révision après contrôle fournisseur');await validate.click()
  await expect(page.getByRole('status')).toContainText('version 2');await page.locator('select').selectOption('stmt-1');assert.equal(saved.find(s=>s.id==='stmt-1').snapshot.receivedOrders[0].amountFcfa,100)
  await page.screenshot({path:'.deployment/management-statement-desktop.png',fullPage:true})
  await page.goto(`${base}/__statement-test?role=pdg`);await expect(page.getByText('BC-TEST')).toBeVisible();await expect(page.getByRole('button',{name:'Valider et conserver cette lecture'})).toHaveCount(0)
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  assert.deepEqual(errors,[])
 }finally{await browser?.close();await vite?.close()}
})
