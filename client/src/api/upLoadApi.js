import request from '@/utils/request.js'
export default class upLoadApi {
  //获取已经上传的文件进度
  static getAlready(params) {
    return request({
      url: '/upload_already',
      method: 'get',
      params
    })
  }
  //文件分片上传
  static upLoadChunks(data) {
    return request({
      url: '/upload_chunk',
      method: 'post',
      data,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  }
  //合并文件
  static upLoadMerge(data) {
    return request({
      url: '/upload_merge',
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data,
    })
  }
}