export class RemoteRequestQueue {
  busy(client:object):boolean;
  run<T>(client:object,action:()=>T|PromiseLike<T>):Promise<T>;
}
