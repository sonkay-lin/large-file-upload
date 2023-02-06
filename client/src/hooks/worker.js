import SparkMD5 from 'spark-md5'
self.onmessage = ({ data }) => {
  // 获取主线程传过来的buffer文件数据
  const { buffer } = data
  const spark = new SparkMD5.ArrayBuffer()
  //生成hash值
  spark.append(buffer)
  const hash = spark.end()
  //发送给主线程
  self.postMessage({ hash })
}
