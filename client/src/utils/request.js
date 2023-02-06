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
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

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
