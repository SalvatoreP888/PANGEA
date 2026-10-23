/** Serialize a session's requests per client. Controls wait behind a poll instead
 * of being silently discarded. A failed request cannot poison later controls. */
export class RemoteRequestQueue {
  pending=new WeakMap();
  busy(client){return this.pending.has(client);}
  run(client,action){
    const prior=this.pending.get(client);
    const next=prior?prior.then(action,action):Promise.resolve().then(action);
    this.pending.set(client,next);
    const clear=()=>{if(this.pending.get(client)===next)this.pending.delete(client);};
    next.then(clear,clear);
    return next;
  }
}
