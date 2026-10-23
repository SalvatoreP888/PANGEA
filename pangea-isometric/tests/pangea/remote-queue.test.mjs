import test from 'node:test';
import assert from 'node:assert/strict';
import {RemoteRequestQueue} from '../../src/pangea/persistence/remote-queue.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('A pause queued behind a held poll executes once in order and keeps the client busy',async()=>{
  const queue=new RemoteRequestQueue(),client={},gate=deferred(),order=[];
  const poll=queue.run(client,async()=>{order.push('poll');await gate.promise;order.push('snapshot');});
  const pause=queue.run(client,()=>{order.push('pause');return 'paused';});
  await Promise.resolve();assert.deepEqual(order,['poll']);assert.ok(queue.busy(client));
  gate.resolve();await poll;assert.equal(await pause,'paused');assert.deepEqual(order,['poll','snapshot','pause']);assert.equal(queue.busy(client),false);
});
test('Rejected polls release the queue and cannot discard the next control',async()=>{
  const queue=new RemoteRequestQueue(),client={},gate=deferred();
  const poll=queue.run(client,()=>gate.promise),pause=queue.run(client,()=>42);
  gate.reject(new Error('network interruption'));await assert.rejects(poll,/network interruption/);
  assert.equal(await pause,42);assert.equal(queue.busy(client),false);
});
test('A held old connection cannot block a new client or clear its later queued work',async()=>{
  const queue=new RemoteRequestQueue(),oldClient={},newClient={},gate=deferred();let current=oldClient,sent=0;
  const oldRead=queue.run(oldClient,()=>gate.promise);
  const oldControl=queue.run(oldClient,()=>{if(current===oldClient)sent++;});
  current=newClient;assert.equal(await queue.run(newClient,()=>7),7);assert.ok(queue.busy(oldClient));
  gate.resolve();await oldRead;await oldControl;assert.equal(sent,0);assert.equal(queue.busy(oldClient),false);
});
