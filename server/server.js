const express = require("express");
const fs = require("fs");
const bodyParser = require("body-parser");
const multiparty = require("multiparty");

const app = express();
const PORT = 8888;
const HOSTNAME = `http://127.0.0.1:${PORT}`;
app.listen(PORT, () => {
  console.log(`启动成功：${HOSTNAME}`);
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  req.method === "OPTIONS"
    ? res.send("CURRENT SERVICES SUPPORT CROSS DOMAIN REQUESTS!")
    : next();
});
app.use(
  bodyParser.urlencoded({
    extended: false,
    limit: "1024mb",
  })
);
//上传路径
const uploadDir = `${__dirname}/upload`;
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
//获取已经上传的内容
app.get("/upload_already", async (req, res) => {
  const { HASH, filename } = req.query;
  //文件夹路径
  const path = `${uploadDir}/${HASH}`;
  //文件路径
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

app.use(express.static("./"));
app.use((req, res) => {
  res.status(404);
  res.send("NOT FOUND!");
});
