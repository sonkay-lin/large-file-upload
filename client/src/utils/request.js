import axios from "axios";
// import config from "../config";
// import { useStore } from "vuex";

const baseUrl = process.env.NODE_ENV === "development" ? '/api' : ''

const instance = axios.create({
  headers: {},
  baseURL: baseUrl
});

// const axiosRequestsAry = []
// let axiosIsRefreshing = false

//存放请求队列 请求完后删除
export let requestStack = [];
export function clear() {
  requestStack = [];
}

//请求拦截
instance.interceptors.request.use(
  (request) => {
    let CancelToken = axios.CancelToken;
    request.cancelToken = new CancelToken((c) => {
      request.cancel = c;
    });
    requestStack.push(request);
    return request;
  },
  (error) => {
    return Promise.reject(error);
  }
);
//响应拦截
instance.interceptors.response.use(
  (response) => {
    const { config: { url: reqUrl }, data: { code } } = response
    if (reqUrl === '/upload_chunk' && code === 1) {
      console.log('请求出错了重新上传')
      return againRequest(instance, response.config)
    }
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);
// 重新发送请求
function againRequest(axios, config) {
  if (config.data instanceof FormData) {
    const retry = +config.data.get('count')
    const maxCount = +config.data.get('maxCount')
    const fileName = config.data.get('filename')
    if (retry >= maxCount) {
      return Promise.reject({
        code: 1,
        fileName,
        msg: `重新请求次数超过${maxCount}次`
      })
    }
    config.data.set('count', retry + 1)
  }
  return axios(config)
}

export default function request(reqConfig) {
  return new Promise((resolve, reject) => {
    instance
      .request(reqConfig)
      .then((res) => {
        const { data: result } = res;
        resolve(result);
      })
      .catch((error) => {
        reject(error);
      });
  });
}
