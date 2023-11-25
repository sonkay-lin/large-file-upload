/**
 * @param limit 限制同时请求数量
 * @param array 参数数组
 * @param iteratorFn 请求的函数
 */
export async function asyncPool(limit, array, iteratorFn) {
  // debugger
  const ret = []; //储存所有任务队列
  const executing = []; //储存正在执行的队列

  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item, array));
    ret.push(p);

    if (limit <= array.length) {
      // 当任务完成后，从正在执行的任务数组中移除已完成的任务
      const e = p.then(() => {
        executing.splice(executing.indexOf(e), 1);
      });
      executing.push(e); // 保存正在执行的异步任务

      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(ret);
}
