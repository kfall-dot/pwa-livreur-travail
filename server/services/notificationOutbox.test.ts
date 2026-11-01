import {test} from 'node:test'
import assert from 'node:assert/strict'
import {retryDelayMs,OUTBOX_MAX_ATTEMPTS} from './notificationOutbox.js'
test('notifications : reprises espacées et délai plafonné',()=>{
 assert.equal(retryDelayMs(1),30000);assert.equal(retryDelayMs(2),60000)
 assert.ok(retryDelayMs(OUTBOX_MAX_ATTEMPTS)<=3600000)
 assert.equal(retryDelayMs(100),3600000)
})
