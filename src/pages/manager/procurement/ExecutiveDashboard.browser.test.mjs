import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'
test('pilotage : rôles, liens de dossiers, sources partielles et affichage mobile', { skip: process.env.RUN_EXECUTIVE_UI !== '1' }, async () => {
 let vite,browser
 try {
  vite=await createServer({server:{host:'127.0.0.1',port:0,watch:null},plugins:[{name:'executive-test',configureServer(server){server.middlewares.use('/__executive-test',async(_req,res,next)=>{try{
   const html=await server.transformIndexHtml('/__executive-test',`<html><body style="background:#f3f5f8;margin:24px"><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {ExecutiveDashboard} from '/src/pages/manager/procurement/ExecutiveDashboard.tsx';const role=new URLSearchParams(location.search).get('role')||'daf';createRoot(document.getElementById('root')).render(React.createElement(ExecutiveDashboard,{role,handleAuth:()=>false,onOpenRequest:id=>{window.openedRequest=id},onOpenBudgets:()=>{window.openedBudget=true},onOpenRequests:()=>{window.openedRequests=true}}));</script></body></html>`)
   res.setHeader('Content-Type','text/html');res.end(html)
  }catch(err){next(err)}})}}]});await vite.listen()
  const base=`http://127.0.0.1:${vite.httpServer.address().port}`
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL||'msedge'})
  const page=await browser.newPage({viewport:{width:1400,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let partial=false
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base){await route.abort();return}if(!url.pathname.startsWith('/api/')){await route.continue();return}
   if(partial&& !url.pathname.endsWith('/requests')){await route.fulfill({status:503,json:{message:'Source indisponible'}});return}
   if(url.pathname.endsWith('/site-budgets')){await route.fulfill({json:{budgets:[{siteId:'a',siteName:'Cocody Tour A',budgetTotalFcfa:1000000,engagedFcfa:1200000,realizedFcfa:800000,remainingFcfa:-200000},{siteId:'b',siteName:'Résidence 35ème',budgetTotalFcfa:2000000,engagedFcfa:1800000,realizedFcfa:1500000,remainingFcfa:200000}]}});return}
   if(url.pathname.endsWith('/requests')){await route.fulfill({json:{requests:[{id:'daf-1',reference:'EB-DAF',siteName:'Cocody Tour A',status:'daf_review',totalAmountFcfa:75000,urgency:'urgent',updatedAt:'2026-01-01'},{id:'pdg-1',reference:'EB-PDG',siteName:'Résidence 35ème',status:'pdg_review',totalAmountFcfa:500000,updatedAt:'2026-01-01'}]}});return}
   if(url.pathname.endsWith('/bc-register')){assert.equal(url.searchParams.get('month'),'all');const row={purchaseOrderId:'bc1',purchaseRequestId:'daf-1',bon:'BC-1',siteName:'Cocody Tour A',invoice:'F-1',amountFcfa:75000,invoiceTransmitted:true,invoicePaid:false};await route.fulfill({json:{rows:[row,row]}});return}
   await route.fulfill({status:404,json:{message:'Route inattendue'}})
  })
  await page.goto(`${base}/__executive-test?role=daf`)
  await expect(page.getByText('Anticiper les engagements.')).toBeVisible()
  await expect(page.locator('.executive__requests').first()).toContainText('EB-DAF')
  await expect(page.locator('.executive__requests').first()).not.toContainText('EB-PDG')
  await expect(page.getByText('1 BC avec facture transmise', {exact:false})).toBeVisible()
  await page.getByRole('button',{name:/EB-DAF/}).click();assert.equal(await page.evaluate(()=>window.openedRequest),'daf-1')
  await page.getByRole('button',{name:'Voir le suivi budgétaire →'}).first().click();assert.equal(await page.evaluate(()=>window.openedBudget),true)
  await page.screenshot({path:'.deployment/executive-daf-desktop.png',fullPage:true})
  await page.goto(`${base}/__executive-test?role=pdg`);await expect(page.getByText('Repérer les points d’attention.')).toBeVisible()
  await expect(page.locator('.executive__requests').first()).toContainText('EB-PDG')
  await expect(page.locator('.executive__requests').first()).not.toContainText('EB-DAF')
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.deployment/executive-pdg-mobile.png',fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  partial=true;await page.getByRole('button',{name:'Actualiser',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Vue partielle')
  await expect(page.locator('.executive__metrics')).toContainText('Indisponible')
  assert.deepEqual(errors,[])
 }finally{await browser?.close();await vite?.close()}
})
