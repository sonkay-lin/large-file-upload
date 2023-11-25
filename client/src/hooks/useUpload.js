import uploadApi from "@/api/upLoadApi.js";
import { requestStack, clear } from "@/utils/request.js";
import { asyncPool } from "@/utils/asyncPool.js";
import { ref, computed } from "vue";

const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});

/**
 * @param limtSize 切片大小
 * @param limtCount 同时请求个数
 */
export function useUpload(limtSize = 2 * 1024 * 1024, limtCount = 3) {
  let file = null;
  //文件的hash值
  let hash = "";
  //文件被分割成切片的数量
  let count = 0;
  //文件分割成的数量
  let chunkList = [];
  //已经上传的切片
  let alreadyChunk = [];
  //上传进度
  const percentage = ref(0);
  //加载文件状态
  const isLoadingFile = ref(false);
  //上传状态
  const isUpload = ref(false);
  // 是否上传出错
  const isError = ref(false);
  const isFinish = ref(false);
  //禁用上传按钮
  const disabledUpload = computed(
    () =>
      (isUpload.value || isLoadingFile.value || percentage.value >= 100) &&
      !isFinish.value
  );
  //使用sparkMd5生成hash
  function generateHash(file) {
    return new Promise((resolve, reject) => {
      //使用FileReader异步读取文件
      const fileReader = new FileReader();
      //读取文件内容转化为buffer
      fileReader.readAsArrayBuffer(file);
      fileReader.onload = (e) => {
        //拿到读取的结果
        const buffer = e.target.result;
        //向线程发送数据
        worker.postMessage({ buffer });
        //监听线程发过来的数据
        worker.onmessage = ({ data }) => {
          //获取后缀名
          hash = data.hash;
          const suffix = /\.([a-zA-Z0-9]+)$/.exec(file.name)?.[1];
          const filename = `${hash}.${suffix}`;
          //返回结果
          resolve({ buffer, hash, suffix, filename });
        };
      };
      fileReader.onerror = ({ target }) => {
        const { message = "error" } = target.error;
        reject(message);
      };
    });
  }
  /**
   * @name createChunk 创建切片
   * @param file 文件
   * @param size 文件被分割的大小
   * @param hash 文件生成的HASH
   * @param suffix 文件后缀
   * @renturn chunkList(文件切片内容)
   */
  function createChunk({ file, size = limtSize, hash, suffix }) {
    const chunkList = [];
    let cur = 0;
    count = 0;
    while (cur < file.size) {
      count++;
      chunkList.push({
        file: file.slice(cur, cur + size), //使用slice()进行切片
        fileName: `${hash}_${count}.${suffix}`,
      });
      cur += size;
    }
    return chunkList;
  }
  //对文件进行转化获取文件的hash和切片
  async function changeFile(File) {
    try {
      //改变状态不让按钮选择
      isLoadingFile.value = true;
      isError.value = false;
      isFinish.value = false;
      file = File;
      //获取文件转化后的值
      const { suffix, filename } = await generateHash(file);
      //获取已上传的文件切片
      const result = await uploadApi.getAlready({ HASH: hash, filename });
      //文件已经上传过了
      if (result.code === 1) {
        percentage.value = 100;
        return;
      }
      //获取已经上传的切片
      alreadyChunk = result.fileList || [];
      //对文件进行分割,获取分割的数量
      chunkList = createChunk({ file, hash, suffix });
      //已经上传的数量
      const alreadyCount = alreadyChunk.length;
      //更新上传进度
      percentage.value = Math.floor((alreadyCount / count) * 100);
    } catch (error) {
      // throw error
    } finally {
      isLoadingFile.value = false;
    }
  }
  //上传切片
  async function uploadChunk(chunk) {
    try {
      const formData = new FormData();
      formData.append("file", chunk.file);
      formData.append("filename", chunk.fileName);
      formData.append("count", 0);
      formData.append("maxCount", 3);
      //上传切片
      const { code } = await uploadApi.upLoadChunks(formData);
      if (code !== 0) {
        //上传失败 不要让alreadyCount增加，直接return
        return;
      }
      //每次上传后看看是否已经上传完
      alreadyChunk.push(chunk.fileName);
      complete();
    } catch (error) {
      if (error.code === "ERR_CANCELED") {
        throw error;
      }
      alert(`${error.fileName}文件${error.msg}`);
      isError.value = true;
    }
  }
  //上传
  async function upload() {
    if (!file) return; //提示选择文件
    isUpload.value = true;
    isFinish.value = false;
    isError.value = false;
    //过滤获取需要上传的切片
    const uploadChunkList = chunkList.filter((item) => {
      //说明此切片已上传过不需要再进行上传了
      if (alreadyChunk.length > 0 && alreadyChunk.includes(item.fileName)) {
        //做下是否上传完成校验
        complete();
      } else {
        //需要上传的切片
        // uploadChunk(item)
        return item;
      }
    });
    //控制请求个数，上传文件切片
    await asyncPool(limtCount, uploadChunkList, uploadChunk);
    isFinish.value = true;
  }
  //切片全部上传，合并文件
  async function complete() {
    //已经上传的数量，用于判断是否合并
    const alreadyCount = alreadyChunk.length;
    //更新上传进度
    percentage.value = Math.floor((alreadyCount / count) * 100);
    //未全部上传完成返回
    if (alreadyCount < count) return;
    try {
      //全部上传完成，请求合并文件
      const result = await uploadApi.upLoadMerge(`HASH=${hash}&count=${count}`);
      if (result.code !== 0) {
        throw result.codeText;
      }
      alert("上传成功");
    } catch (error) {
      console.log(error);
    } finally {
      isUpload.value = false;
    }
  }
  //暂停请求
  function pause() {
    isUpload.value = false;
    requestStack.forEach((item) => {
      item.cancel();
    });
    clear();
  }
  return {
    isLoadingFile,
    isUpload,
    isError,
    disabledUpload,
    percentage,
    changeFile,
    uploadChunk,
    upload,
    pause,
  };
}
