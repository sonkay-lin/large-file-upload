# 大文件断点续传
## 前端代码实现
html的内容
```vue
<template>
  <input type="file" @change="selectFile" :disabled="isUpload || isLoadingFile">
  <button @click="upload" :disabled="disabledUpload">上传</button>
  <button @click="pause" :disabled="!isUpload || isLoadingFile">暂停</button>
  <div v-if="isLoadingFile">加载文件中。。。</div>
  <!-- 上传进度 -->
  <div v-else>上传进度：{{ percentage }}</div>
</template>
<script setup>
//选择文件
function selectFile(e) {
  const file = e.target.files[0]
  //转化文件获取进度
  changeFile(file)
}
</script>
```
## 1. 使用spark-md5将文件内容生成hash值
选择文件，根据文件的内容转化成hash
spark-md5会根据文件的内容生成一个hash值，用于判断文件是否上传过。
```js
//使用sparkMd5生成hash
function generateHash(file) {
  return new Promise((resolve, reject) => {
    //使用FileReader异步读取文件
    const fileReader = new FileReader()
    //读取文件内容转化为buffer
    fileReader.readAsArrayBuffer(file)
    fileReader.onload = e => {
      //拿到读取的结果
      const buffer = e.target.result
      const spark = new SparkMD5.ArrayBuffer()
      //生成hash值
      spark.append(buffer)
      hash = spark.end()
      //获取后缀名
      const suffix = /\.([a-zA-Z0-9]+)$/.exec(file.name)?.[1]
      const filename = `${hash}.${suffix}`
      //返回结果
      resolve({ buffer, hash, suffix, filename })
    }
    fileReader.onerror = ({ target }) => {
      const { message = 'error' } = target.error
      reject(message)
    }
  })
}
```
## 2. 向服务器发送请求查找此文件
用生成的hash值，向服务器发送请求查找此文件是否已上传，获取上传的内容。
## 3. 文件切片
将文件分割成同等大小的文件碎片，核心是利用 Blob.prototype.slice 方法，和数组的 slice 方法相似，文件的 slice 方法可以返回原文件的某个切片
```js
/**
 * @name createChunk 创建切片
 * @param file 文件
 * @param size 文件被分割的大小
 * @param hash 文件生成的HASH
 * @param suffix 文件后缀
 * @renturn chunkList(文件切片内容) 
 */ 
function createChunk({file, size = limtSize, hash, suffix }) {
  const chunkList = []
  let cur = 0
  count = 0
  while (cur < file.size) {
    count++
    chunkList.push({
      file: file.slice(cur, cur + size),//使用slice()进行切片
      fileName: `${hash}_${count}.${suffix}`
    })
    cur += size
  }
  return chunkList
}
```

#### 将1、2、3步骤合并，用户选择文件后，就向服务器获取文件显示上传的进度
```js
//对文件进行转化获取文件的hash和切片
async function changeFile(File) {
  try {
    isLoadingFile.value = true
    file = File
    //1. 获取文件转化后的值
    const { suffix, filename } = await generateHash(file)
    //2. 获取已上传的文件切片
    const result = await uploadApi.getAlready({ HASH: hash, filename })
    //文件已经上传过了
    if (result.code === 1) {
      percentage.value = 100
      return
    }
    alreadyChunk = result.fileList || []
    //3. 对文件进行分割,获取分割的数量
    chunkList = createChunk({ file, hash, suffix })
    //已经上传的数量
    const alreadyCount = alreadyChunk.length
    //更新上传进度
    percentage.value = Math.floor((alreadyCount / count) * 100)
  } catch (error) {
    throw error
  } finally {
    isLoadingFile.value = false
  }
}
```
## 4. 上传文件切片
循环遍历文件切片数组上传文件
```js
//上传切片
async function uploadChunk(chunk) {
  try {
    const formData = new FormData()
    formData.append('file', chunk.file)
    formData.append('filename', chunk.fileName)
    //上传切片
    const { code } = await uploadApi.upLoadChunks(formData)
    if (code !== 0) {
      //上传失败 不要让alreadyCount增加，直接return
      return
    }
    //每次上传后看看是否已经上传完
    alreadyChunk.push(chunk.fileName)
    complete()
  } catch (error) {
    throw error
  }
}
//上传
async function upload() {
  if (!file) return //提示选择文件
  isUpload.value = true
  //过滤获取需要上传的切片
  chunkList.forEach(item => {
    //说明此切片已上传过不需要再进行上传了
    if (alreadyChunk.length > 0 && alreadyChunk.includes(item.fileName)) {
      //做下是否上传完成校验
      complete()
    } else {
      //需要上传的切片
      uploadChunk(item)
    }
  })
}
```
## 5. 合并文件
每次文件切片上传后，校验是否可以合并文件，如果全部上传成功后，发送请求告诉服务器合并文件
```js
//切片全部上传，合并文件
async function complete() {
  //已经上传的数量，用于判断是否合并
  const alreadyCount = alreadyChunk.length
  //更新上传进度
  percentage.value = Math.floor((alreadyCount / count) * 100)
  //未全部上传完成返回
  if (alreadyCount < count) return 
  try {
    //全部上传完成，请求合并文件
    const result = await uploadApi.upLoadMerge(`HASH=${hash}&count=${count}`)
    if (result.code !== 0) {
      throw result.codeText
    }
    alert('上传成功')
  } catch (error) {
    console.log(error)
  } finally {
    isUpload.value = false
  }
}
```
## 6. 暂停上传
用请求拦截将正在请求的api放入请求队列，暂停时遍历队列全部取消，然后清空队列
```js
//request.js
//正在请求的队列
export let requestStack = []
//清空队列
export function clear() {
  requestStack = []
}
//请求拦截
instance.interceptors.request.use(request => {
  let CancelToken = axios.CancelToken
  request.cancelToken = new CancelToken((c) => {
    request.cancel = c
  })
  requestStack.push(request)
  return request
}, error => {
  return Promise.reject(error)
})
```
```js
//暂停请求
function pause() {
  isUpload.value = false
  requestStack.forEach(item => {
    item.cancel()
  });
  clear()
}
```


## 问题1：文件过大页面阻塞
在选择文件后，将文件转化成hash值时，如果选择的文件过大，页面会卡住，无法交互。

这是因为文件过大spark-md5要进行大量的运算，而js又是单线程的，所以页面会阻塞。

- 解决办法: 使用webwork开启线程
> webwork常用于大量计算和音视频模块、加载大量的图片也可以使用webwork优化

优化代码
```js
const worker = new Worker(new URL('./worker.js', import.meta.url),{
  type: 'module',
})
//使用sparkMd5生成hash
function generateHash(file) {
  return new Promise((resolve, reject) => {
    //使用FileReader异步读取文件
    const fileReader = new FileReader()
    //读取文件内容转化为buffer
    fileReader.readAsArrayBuffer(file)
    fileReader.onload = e => {
      //拿到读取的结果
      const buffer = e.target.result
      //向线程发送数据
      worker.postMessage({ buffer })
      //监听线程发过来的数据
      worker.onmessage = ({ data }) => {
        //获取后缀名
        hash = data.hash
        const suffix = /\.([a-zA-Z0-9]+)$/.exec(file.name)?.[1]
        const filename = `${hash}.${suffix}`
        //返回结果
        resolve({ buffer, hash, suffix, filename })
      }
    }
    fileReader.onerror = ({ target }) => {
      const { message = 'error' } = target.error
      reject(message)
    }
  })
}
```
worker代码
```js
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
```
## 问题2：请求并发
如果选择的文件过大，上传文件切片后会马上将所有的请求发送(虽然浏览器最多只能同时请求6个)，但如果多个用户同时请求，服务器的压力就会增加，所以需要控制一次性发送的请求数量。

这里使用asyncPool来控制同时请求数
```js
//上传
async function upload() {
  if (!file) return //提示选择文件
  isUpload.value = true
  //过滤获取需要上传的切片
  const uploadChunkList = chunkList.filter(item => {
    //说明此切片已上传过不需要再进行上传了
    if (alreadyChunk.length > 0 && alreadyChunk.includes(item.fileName)) {
      //做下是否上传完成校验
      complete()
    } else {
      //需要上传的切片
      // uploadChunk(item)
      return item
    }
  })
  //控制请求个数，上传文件切片
  asyncPool(limtCount, uploadChunkList, uploadChunk)
}
```


## 优化后完整的前端代码
```vue
<template>
  <input type="file" @change="selectFile" :disabled="isUpload || isLoadingFile">
  <button @click="upload" :disabled="disabledUpload">上传</button>
  <button @click="pause" :disabled="!isUpload || isLoadingFile">暂停</button>
  <div v-if="isLoadingFile">加载文件中。。。</div>
  <!-- 上传进度 -->
  <div v-else>上传进度：{{ percentage }}</div>
</template>

<script setup>
import { useUpload } from './useUpload.js'

const { 
  percentage, //上传进度
  isLoadingFile, //加载文件状态
  disabledUpload, //禁用上传按钮
  isUpload, //上传状态
  changeFile, //对文件进行转化获取文件的hash和切片
  upload, //上传
  pause //暂停请求
} = useUpload()

//选择文件
function selectFile(e) {
  const file = e.target.files[0]
  //转化文件获取进度
  changeFile(file)
}

</script>
```

```js
import uploadApi from '@/api/upLoadApi'
import { requestStack, clear } from '@/utils/request'
import { asyncPool } from '@/utils/asyncPool'
import { ref, computed } from 'vue'

const worker = new Worker(new URL('./worker.js', import.meta.url),{
  type: 'module',
})

/**
 * @param limtSize 切片大小
 * @param limtCount 同时请求个数
*/
export function useUpload(limtSize = 2 * 1024 * 1024, limtCount = 3) {
  let file = null
  //文件的hash值
  let hash = ''
  //文件被分割成切片的数量
  let count = 0
  //文件分割成的数量
  let chunkList = []
  //已经上传的切片
  let alreadyChunk = []
  //上传进度
  const percentage = ref(0)
  //加载文件状态
  const isLoadingFile = ref(false)
  //上传状态
  const isUpload = ref(false)
  //禁用上传按钮
  const disabledUpload = computed(() => isUpload.value || isLoadingFile.value || percentage.value >= 100)
  //使用sparkMd5生成hash
  function generateHash(file) {
    return new Promise((resolve, reject) => {
      //使用FileReader异步读取文件
      const fileReader = new FileReader()
      //读取文件内容转化为buffer
      fileReader.readAsArrayBuffer(file)
      fileReader.onload = e => {
        //拿到读取的结果
        const buffer = e.target.result
        //向线程发送数据
        worker.postMessage({ buffer })
        //监听线程发过来的数据
        worker.onmessage = ({ data }) => {
          //获取后缀名
          hash = data.hash
          const suffix = /\.([a-zA-Z0-9]+)$/.exec(file.name)?.[1]
          const filename = `${hash}.${suffix}`
          //返回结果
          resolve({ buffer, hash, suffix, filename })
        }
      }
      fileReader.onerror = ({ target }) => {
        const { message = 'error' } = target.error
        reject(message)
      }
    })
  }
  /**
   * @name createChunk 创建切片
   * @param file 文件
   * @param size 文件被分割的大小
   * @param hash 文件生成的HASH
   * @param suffix 文件后缀
   * @renturn chunkList(文件切片内容) 
   */ 
  function createChunk({file, size = limtSize, hash, suffix }) {
    const chunkList = []
    let cur = 0
    count = 0
    while (cur < file.size) {
      count++
      chunkList.push({
        file: file.slice(cur, cur + size),//使用slice()进行切片
        fileName: `${hash}_${count}.${suffix}`
      })
      cur += size
    }
    return chunkList
  }
  //对文件进行转化获取文件的hash和切片
  async function changeFile(File) {
    try {
      //改变状态不让按钮选择
      isLoadingFile.value = true
      file = File
      //获取文件转化后的值
      const { suffix, filename } = await generateHash(file)
      //获取已上传的文件切片
      const result = await uploadApi.getAlready({ HASH: hash, filename })
      //文件已经上传过了
      if (result.code === 1) {
        percentage.value = 100
        return
      }
      //获取已经上传的切片
      alreadyChunk = result.fileList || []
      //对文件进行分割,获取分割的数量
      chunkList = createChunk({ file, hash, suffix })
      //已经上传的数量
      const alreadyCount = alreadyChunk.length
      //更新上传进度
      percentage.value = Math.floor((alreadyCount / count) * 100)
    } catch (error) {
      throw error
    } finally {
      isLoadingFile.value = false
    }
  }
  //上传切片
  async function uploadChunk(chunk) {
    try {
      const formData = new FormData()
      formData.append('file', chunk.file)
      formData.append('filename', chunk.fileName)
      //上传切片
      const { code } = await uploadApi.upLoadChunks(formData)
      if (code !== 0) {
        //上传失败 不要让alreadyCount增加，直接return
        return
      }
      //每次上传后看看是否已经上传完
      alreadyChunk.push(chunk.fileName)
      complete()
    } catch (error) {
      throw error
    }
  }
  //上传
  async function upload() {
    if (!file) return //提示选择文件
    isUpload.value = true
    //过滤获取需要上传的切片
    const uploadChunkList = chunkList.filter(item => {
      //说明此切片已上传过不需要再进行上传了
      if (alreadyChunk.length > 0 && alreadyChunk.includes(item.fileName)) {
        //做下是否上传完成校验
        complete()
      } else {
        //需要上传的切片
        // uploadChunk(item)
        return item
      }
    })
    //控制请求个数，上传文件切片
    asyncPool(limtCount, uploadChunkList, uploadChunk)
  }
  //切片全部上传，合并文件
  async function complete() {
    //已经上传的数量，用于判断是否合并
    const alreadyCount = alreadyChunk.length
    //更新上传进度
    percentage.value = Math.floor((alreadyCount / count) * 100)
    //未全部上传完成返回
    if (alreadyCount < count) return 
    try {
      //全部上传完成，请求合并文件
      const result = await uploadApi.upLoadMerge(`HASH=${hash}&count=${count}`)
      if (result.code !== 0) {
        throw result.codeText
      }
      alert('上传成功')
    } catch (error) {
      console.log(error)
    } finally {
      isUpload.value = false
    }
  }
  //暂停请求
  function pause() {
    isUpload.value = false
    requestStack.forEach(item => {
      item.cancel()
    });
    clear()
  }
  return {
    isLoadingFile,
    isUpload,
    disabledUpload,
    percentage,
    changeFile,
    uploadChunk,
    upload,
    pause
  }
}
```


## 后端代码实现
## 1. 获取已上传内容
根据前端传过来的hash查找是否已有上传的文件，有就返回文件；如果有文件切片，就返回所有文件切片
```js
//检测文件是否存在
const exists = (path) => {
  return new Promise((resolve) => {
    fs.access(path, fs.constants.F_OK, (err) => {
      if (err) {
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
};
app.get("/upload_already", async (req, res) => {
  const { HASH, filename } = req.query;
  const path = `${uploadDir}/${HASH}`;
  const filePath = `${uploadDir}/${filename}`;
  let fileList = [];
  try {
    const isExists = await exists(filePath);
    if (isExists) {
      //文件存在直接返回
      res.send({
        code: 1,
        codeText: "文件已存在",
        originalFilename: filename,
        servicePath: path.replace(__dirname, filePath),
      });
      return;
    }
    //读取文件目录
    fileList = fs.readdirSync(path);
    //对文件夹下的切片排序，返回
    fileList = fileList.sort((a, b) => {
      let reg = /_(\d+)/;
      return reg.exec(a)[1] - reg.exec(b)[1];
    });
    res.send({
      code: 0,
      codeText: "",
      fileList: fileList,
    });
  } catch (err) {
    res.send({
      code: 0,
      codeText: "",
      fileList: fileList,
    });
  }
});
```

## 2. 上传切片
使用multiparty解析前端传过来的文件切片，根据文件名称获取hash值，如果文件第一次上传就根据hash创建文件夹，将切片写入文件夹中
```js
// 基于multiparty插件实现文件上传处理 & form-data解析
const multiparty_upload = (req) => {
  let config = {
    maxFieldsSize: 200 * 1024 * 1024,
  };
  return new Promise(async (resolve, reject) => {
    new multiparty.Form(config).parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({
        fields,
        files,
      });
    });
  });
};
// 创建文件并写入到指定的目录 & 返回客户端结果
const writeFile = (res, path, file, filename) => {
  return new Promise((resolve, reject) => {
    try {
      const readStream = fs.createReadStream(file.path);
      const writeStream = fs.createWriteStream(path);
      readStream.pipe(writeStream);
      readStream.on("end", () => {
        resolve();
        fs.unlinkSync(file.path);
        res.send({
          code: 0,
          codeText: "upload success",
          originalFilename: filename,
          servicePath: path.replace(__dirname, HOSTNAME),
        });
      });
    } catch (error) {
      reject(error);
      res.send({
        code: 1,
        codeText: error,
      });
    }
  });
};
//切片上传接口
app.post("/upload_chunk", async (req, res) => {
  try {
    const { fields, files } = await multiparty_upload(req);
    const file = (files.file && files.file[0]) || {};
    const filename = (fields.filename && fields.filename[0]) || "";
    const HASH = /^([^_]+)_(\d+)/.exec(filename)[1];
    const path = `${uploadDir}/${HASH}`;
    if (!fs.existsSync(path)) {
      //路径不存在就创建文件夹
      fs.mkdirSync(path);
    }
    const filePath = `${uploadDir}/${HASH}/${filename}`;
    const isExists = await exists(filePath);
    if (isExists) {
      //文件存在返回
      res.send({
        code: 0,
        codeText: "文件已存在",
        originalFilename: filename,
        servicePath: path.replace(__dirname, HOSTNAME),
      });
      return;
    }
    //写入文件
    writeFile(res, filePath, file, filename);
  } catch (error) {
    res.send({
      code: 1,
      codeText: error,
    });
  }
});
```

## 3. 将切片合并
将文件夹下的切片按照命名排序，然后合并成一个文件，最后删除文件夹下的内容
```js
// 大文件切片上传 & 合并切片
const merge = (HASH, count) => {
  return new Promise(async (resolve, reject) => {
    const path = `${uploadDir}/${HASH}`;
    const isExists = await exists(path);
    let suffix = "";
    //获取不到文件
    if (!isExists) {
      reject("没有找到路径");
      return;
    }
    //获取目录下的文件
    const fileList = fs.readdirSync(path);
    if (fileList.length < count) {
      reject("文件上传不完整");
      return;
    }
    //将文件夹下的文件按顺序排序
    fileList
      .sort((a, b) => {
        const reg = /_(\d+)/;
        return reg.exec(a)[1] - reg.exec(b)[1];
      })
      .forEach((item) => {
        //获取文件后缀
        !suffix && (suffix = /\.([0-9a-zA-Z]+)$/.exec(item)[1]);
        //同步将文件夹下的文件合并，如果文件不存在则创建文件
        fs.appendFileSync(
          `${uploadDir}/${HASH}.${suffix}`,
          fs.readFileSync(`${path}/${item}`)
        );
        fs.unlinkSync(`${path}/${item}`);
      });
    //删除文件夹下的切片目录
    fs.rmdirSync(path);
    resolve({
      path: `${uploadDir}/${HASH}.${suffix}`,
      filename: `${HASH}.${suffix}`,
    });
  });
};

//合并接口
app.post("/upload_merge", async (req, res) => {
  const { HASH, count } = req.body;
  try {
    const { filename, path } = await merge(HASH, count);
    res.send({
      code: 0,
      codeText: "merge success",
      originalFilename: filename,
      servicePath: path.replace(__dirname, HOSTNAME),
    });
  } catch (err) {
    res.send({
      code: 1,
      codeText: err,
    });
  }
});
```
