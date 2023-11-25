<template>
  <input type="file" @change="selectFile" :disabled="isUpload || isLoadingFile">
  <button @click="upload" :disabled="disabledUpload">{{ isError ? '重试' : '上传' }}</button>
  <button @click="pause" :disabled="!isUpload || isLoadingFile">暂停</button>
  <div v-if="isLoadingFile">加载文件中。。。</div>
  <!-- 上传进度 -->
  <div v-else>上传进度：{{ percentage }}</div>
  <div v-if="isError">上传过程中出错了</div>
</template>

<script setup>
import { useUpload } from '@/hooks/useUpload.js'

const { 
  percentage, //上传进度
  isLoadingFile, //加载文件状态
  disabledUpload, //禁用上传按钮
  isUpload, //上传状态
  isError,
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