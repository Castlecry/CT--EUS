import axios from 'axios';

// 创建axios实例
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_APP_API_BASE_URL || 'http://localhost:8080/api',
  timeout: 3000000, // 300秒超时
});
console.log('apiClient 配置的 baseURL:', apiClient.defaults.baseURL);
/**
 * 上传DICOM文件到服务器
 * @param {FileList|Array} files - 要上传的DICOM文件列表
 * @returns {Promise} 返回包含时间戳的上传结果
 */
export const uploadDicomFiles = async (files) => {
  try {
    const formData = new FormData();
    
    // 添加文件到FormData
    Array.from(files).forEach((file, index) => {
      formData.append(`files[${index}]`, file);
    });
    
    // 生成batchId（使用时间戳，确保唯一且可用于后续处理）
    const batchId = Date.now(); // 核心：生成唯一batchId
    formData.append('batchId', batchId); // 上传时传递此batchId
    
    // 发送POST请求
    await apiClient.post('/dicom/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    // 返回生成的batchId，供处理函数使用
    return batchId;
  } catch (error) {
    console.error('上传DICOM文件失败:', error);
    throw error;
  }
};

/**
 * 上传点2CT参数并获取生成的ZIP文件（包含PLY和PNG图片）
 * @param {number} batchId - 批次ID
 * @param {Object} pointParams - 点参数对象，包含选中点坐标、法向量、轴向和旋转角度
 * @returns {Promise} 返回包含解压后文件信息的对象
 */
export const uploadPoint2CTParams = async (batchId, pointParams) => {
  try {
    // 参数校验
    if (!batchId) {
      throw new Error('参数错误：batchId不能为空');
    }
    if (!pointParams) {
      throw new Error('参数错误：点参数不能为空');
    }
    
    console.log('上传点2CT参数 - batchId:', batchId);
    console.log('上传点2CT参数 - 点参数:', pointParams);
    
    // 构造请求数据
    const requestData = {
      batchId: batchId.toString(),
      ...pointParams // 直接传递所有参数，不再包装在point2CTParams中
    };
    
    // 发送POST请求，期望后端返回ZIP文件
    const response = await apiClient.post('/eus/image/generate', requestData, {
      headers: {
        'Content-Type': 'application/json'
      },
      responseType: 'blob' // 确保以二进制形式接收ZIP文件
    });
    
    console.log('获取点2CT ZIP文件成功，大小:', response.data.size, '字节');
    
    // 解压ZIP文件并处理其中的PLY和PNG文件
    const extractedFiles = await extractFilesFromZip(response.data);
    
    return {
      batchId: batchId.toString(),
      zipSize: response.data.size,
      extractedFiles: extractedFiles
    };
  } catch (error) {
    console.error('上传点2CT参数失败:', error);
    if (error.response) {
      console.error('服务器响应:', error.response);
    }
    throw error;
  }
};

/**
 * 从ZIP文件中解压并提取PLY和PNG文件
 * @param {Blob} zipBlob - ZIP文件Blob对象
 * @returns {Promise<Object>} 返回包含PLY和PNG文件信息的对象
 */
async function extractFilesFromZip(zipBlob) {
  // 由于浏览器环境中没有内置的ZIP解压功能，我们需要使用JSZip库
  // 但首先检查JSZip是否已加载
  let JSZip;
  try {
    // 尝试动态导入JSZip
    const module = await import('jszip');
    JSZip = module.default;
  } catch (error) {
    console.error('无法加载JSZip库，尝试使用备用方法处理ZIP文件:', error);
    
    // 如果没有JSZip库，我们将创建一个临时URL并返回
    // 这需要前端手动处理或显示错误
    const zipUrl = URL.createObjectURL(zipBlob);
    return {
      hasError: true,
      errorMessage: '缺少ZIP解压库，请安装jszip包',
      zipUrl: zipUrl,
      plyFiles: [],
      pngFiles: []
    };
  }
  
  try {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(zipBlob);
    
    const plyFiles = [];
    const pngFiles = [];
    
    // 遍历ZIP中的所有文件
    for (const [fileName, zipEntry] of Object.entries(zipContent.files)) {
      console.log('处理ZIP中的文件:', fileName);
      
      if (!zipEntry.dir) { // 只处理文件，不处理目录
        // 获取文件内容
        const content = await zipEntry.async('blob');
        const fileUrl = URL.createObjectURL(content);
        
        // 根据文件扩展名分类
        if (fileName.toLowerCase().endsWith('.ply')) {
          plyFiles.push({
            name: fileName,
            url: fileUrl,
            size: content.size,
            type: 'application/octet-stream'
          });
          console.log('找到PLY文件:', fileName);
        } else if (fileName.toLowerCase().endsWith('.png')) {
          pngFiles.push({
            name: fileName,
            url: fileUrl,
            size: content.size,
            type: 'image/png'
          });
          console.log('找到PNG文件:', fileName);
        }
      }
    }
    
    // 按文件名排序，确保图片按顺序显示
    pngFiles.sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      hasError: false,
      plyFiles: plyFiles,
      pngFiles: pngFiles,
      totalFiles: plyFiles.length + pngFiles.length
    };
  } catch (error) {
    console.error('解压ZIP文件失败:', error);
    
    // 创建ZIP文件的URL作为备用
    const zipUrl = URL.createObjectURL(zipBlob);
    
    return {
      hasError: true,
      errorMessage: '解压ZIP文件失败: ' + error.message,
      zipUrl: zipUrl,
      plyFiles: [],
      pngFiles: []
    };
  }
}

/**
 * 处理DICOM文件（使用FormData形式传递batchId，与上传格式保持一致）
 * @param {number} batchId - 上传时返回的batchId
 * @returns {Promise} 返回处理结果
 */
export const processDicomFiles = async (batchId) => {
  try {
    // 创建FormData对象（与上传时的参数格式一致）
    const formData = new FormData();
    // 添加batchId参数（转为字符串避免类型问题，后端接收更兼容）
    formData.append('batchId', batchId.toString());
    
    // 发送POST请求（使用FormData格式）
    const response = await apiClient.post('/process/start', formData, {
      headers: {
        'Content-Type': 'multipart/form-data', // 明确指定格式
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('处理DICOM文件失败:', error);
    throw error;
  }
};

/**
 * 获取指定器官的OBJ模型（自动添加.obj后缀，使用params传递参数）
 * @param {string|number} batchId - 上传时的批次ID
 * @param {string} baseName - 器官基础名称（如"stomach"，无需带.obj）
 * @returns {Promise} 返回模型数据（包含可直接使用的URL）
 */
export const getOrganModel = async (batchId, baseName) => {
  try {
    // 参数校验：确保必要参数存在
    if (!batchId || !baseName) {
      throw new Error("参数错误：batchId和基础名称不能为空");
    }

    // 自动添加.obj后缀（处理已包含后缀的情况，避免重复添加）
    const fileName = baseName.endsWith('.obj') 
      ? baseName.trim() 
      : `${baseName.trim()}.obj`;

    // 构造完整URL用于调试
    const url = `${apiClient.defaults.baseURL}/process/obj/download?batchId=${encodeURIComponent(batchId)}&fileName=${encodeURIComponent(fileName)}`;
    console.log('getOrganModel 请求URL:', url);

    // 发送GET请求，通过params传递参数
    const response = await apiClient.get('/process/obj/download', {
      params: {
        batchId: batchId.toString(),  // 转为字符串避免类型问题
        fileName: fileName            // 自动处理后的完整文件名
      },
      responseType: 'blob'  // 保持二进制响应类型
    });

    // 创建可直接用于Three.js加载的URL
    const objectUrl = URL.createObjectURL(response.data);
    
    return {
      batchId: batchId,
      baseName: baseName.trim(),  // 原始基础名称（不带后缀）
      fileName: fileName,         // 带.obj后缀的完整文件名
      data: objectUrl,            // 返回可直接使用的URL
      size: response.data.size,   // 文件大小（字节）
      coordinates: { x: 0, y: 0, z: 0 }  // 坐标信息
    };
  } catch (error) {
    console.error(`获取模型失败（batchId: ${batchId}, 基础名称: ${baseName}）:`, error);
    if (error.response) {
      console.error('服务器响应:', error.response);
    }
    throw error;  // 向上层抛出错误，便于业务层处理
  }
};
    
    

/**
 * 获取指定器官的PLY模型
 * @param {string} organName - 器官的英文名字
 * @param {string|number} batchId - 上传时的批次ID
 * @returns {Promise} 返回模型数据（包含可直接使用的URL）
 */
export const getOrganPlyModel = async (organName, batchId) => {
  console.log('getOrganPlyModel函数开始执行，参数organName:', organName, 'batchId:', batchId);
  try {
    // 参数校验
    if (!organName) {
      console.error('getOrganPlyModel: 参数错误 - organName为空');
      throw new Error("参数错误：器官英文名称不能为空");
    }
    
    if (!batchId) {
      console.error('getOrganPlyModel: 参数错误 - batchId为空');
      throw new Error("参数错误：批次ID不能为空");
    }

    // 确保参数是字符串类型
    const organNameStr = String(organName).trim();
    const batchIdStr = String(batchId).trim();
    
    console.log('getOrganPlyModel: 处理后的参数 - organName:', organNameStr, 'batchId:', batchIdStr);

    // 构造完整URL用于调试
    const url = `${apiClient.defaults.baseURL}/organ/ply?organName=${encodeURIComponent(organNameStr)}&batchId=${encodeURIComponent(batchIdStr)}`;
    console.log('getOrganPlyModel 请求URL:', url);

    console.log('getOrganPlyModel: 准备发送请求');
    const response = await apiClient.get('/organ/ply', {
      params: {
        organName: organNameStr,  // 严格按照接口文档使用organName参数
        batchId: batchIdStr       // 添加batchId参数
      },
      responseType: 'blob'
    });

    console.log('getOrganPlyModel: 请求成功，response.data类型:', typeof response.data);
    console.log('getOrganPlyModel: response.data是否为Blob:', response.data instanceof Blob);
    
    // 创建可直接使用的URL
    const objectUrl = URL.createObjectURL(response.data);
    console.log('PLY模型URL:', objectUrl);
    
    // 准备返回对象
    const result = {
      organName: organNameStr,
      fileName: organNameStr,  // 根据错误信息，确保fileName已定义
      data: objectUrl,
      size: response.data.size
    };
    console.log('getOrganPlyModel: 返回结果:', result);
    
    return result;
  } catch (error) {
    console.error(`获取PLY模型失败（器官名称: ${organName}, batchId: ${batchId}）:`, error);
    if (error.response) {
      console.error('服务器响应:', error.response);
    }
    throw error;
  }
};

/**
 * 上传轨迹点云为PLY文件到后端
 * @param {Blob} plyBlob - PLY文件Blob对象
 * @param {string|number} batchId - 批次ID
 * @param {number} plyBatchNo - PLY批次号，初始为1，每次画新线自增
 * @returns {Promise} 返回处理结果
 */
export const uploadTrajectoryPly = async (plyBlob, batchId, plyBatchNo) => {
  if (!plyBlob || !batchId || !plyBatchNo) {
    console.error('No PLY file or batchId or plyBatchNo provided');
    return Promise.reject(new Error('No PLY file or batchId or plyBatchNo provided'));
  }
  console.log('Uploading trajectory PLY file, batchId:', batchId, 'plyBatchNo:', plyBatchNo);
  try {
    // 创建FormData对象处理文件上传
    const formData = new FormData();
    formData.append('plyFile', plyBlob); // 使用plyFile作为文件参数名
    formData.append('batchId', batchId); // 后端期望的参数名
    formData.append('plyBatchNo', plyBatchNo); // 后端期望的参数名
    
    // 发送请求到后端
    await apiClient.post('/eus/generate-video', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      timeout: 600000 // 10分钟超时
    });
    
    console.log('Trajectory PLY file uploaded successfully');
    return { status: 'completed', message: 'PLY文件上传成功' };
  } catch (error) {
    console.error('Error uploading trajectory PLY file:', error);
    throw error;
  }
};

/**
 * 解析PLY文件，提取点信息（每行只取前三个数据作为x,y,z坐标）
 * @param {Blob} plyBlob - PLY文件Blob对象
 * @returns {Promise} 返回解析后的点数据
 */
async function parsePlyFile(plyBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(event) {
      try {
        const data = event.target.result;
        const text = typeof data === 'string' ? data : String.fromCharCode.apply(null, new Uint8Array(data));
        const lines = text.split('\n');
        
        // 查找顶点数量和数据起始位置
        let vertexCount = 0;
        let dataStartIndex = -1;
        let inHeader = true;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          if (inHeader) {
            // 解析头信息
            if (line.startsWith('element vertex')) {
              vertexCount = parseInt(line.split(' ')[2], 10);
              console.log(`发现顶点数量: ${vertexCount}`);
            }
            
            if (line === 'end_header') {
              dataStartIndex = i + 1;
              inHeader = false;
              console.log(`数据起始位置: 第${dataStartIndex}行`);
              break;
            }
          }
        }
        
        // 提取点数据，每行只取前三个数据作为x,y,z坐标
        const points = [];
        let actualPointCount = 0;
        
        // 从数据起始位置开始读取，最多读取10个点（确保能获取到所有可能的点）
        for (let i = 0; i < 10 && (dataStartIndex + i) < lines.length; i++) {
          const line = lines[dataStartIndex + i].trim();
          if (line) {
            // 分割数据，只取前三个作为x,y,z坐标
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
              const x = parseFloat(parts[0]);
              const y = parseFloat(parts[1]);
              const z = parseFloat(parts[2]);
              
              // 检查坐标值是否有效
              if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                points.push({ x, y, z });
                actualPointCount++;
                console.log(`解析到点${actualPointCount}: (${x}, ${y}, ${z})`);
                
                // 如果已经获取了5个点，就可以停止了
                if (actualPointCount >= 5) {
                  break;
                }
              }
            }
          }
        }
        
        console.log(`PLY文件解析完成，共提取${points.length}个点`);
        resolve({ points });
      } catch (error) {
        console.error('解析PLY文件时出错:', error);
        reject(error);
      }
    };
    
    reader.onerror = reject;
    
    // 优先使用readAsText方式，因为PLY文件通常是文本格式
    reader.readAsText(plyBlob);
  });
}

/**
 * 获取校准轨迹PLY模型 - 支持接收后端返回的多个PLY文件
 * 后端应该返回格式：[{"base64": "base64编码的ply文件内容"}, ...]
 * @param {string|number} batchId - 批次ID
 * @param {number} plyBatchNo - PLY批次号，默认值为1
 * @returns {Promise} 返回包含多个轨迹点和正方形面的轨迹数据数组
 */
export const getCalibrationTrajectoryPly = async (batchId, plyBatchNo = 1) => {
  console.log('getCalibrationTrajectoryPly函数开始执行，batchId:', batchId, 'plyBatchNo:', plyBatchNo);
  try {
    // 参数校验
    if (!batchId) {
      console.error('getCalibrationTrajectoryPly: 参数错误 - batchId为空');
      throw new Error("参数错误：批次ID不能为空");
    }

    // 确保参数是字符串类型
    const batchIdStr = String(batchId).trim();
    const batchNoStr = String(plyBatchNo).trim();
    
    console.log('getCalibrationTrajectoryPly: 处理后的参数 - batchId:', batchIdStr, 'plyBatchNo:', batchNoStr);

    // 构造完整URL用于调试
    const url = `${apiClient.defaults.baseURL}/eus/calibration-trajectory?batchId=${encodeURIComponent(batchIdStr)}&plyBatchNo=${encodeURIComponent(batchNoStr)}`;
    console.log('getCalibrationTrajectoryPly 请求URL:', url);

    console.log('getCalibrationTrajectoryPly: 准备发送请求');
    
    // 发送请求获取轨迹点和正方形面数据
    // 设置响应类型为json，因为我们期望后端返回JSON格式的数据，包含多个PLY文件信息
    const response = await apiClient.get('/eus/calibration-trajectory', {
      params: {
        batchId: batchIdStr,
        plyBatchNo: batchNoStr
      },
      responseType: 'json'
    });

    console.log('getCalibrationTrajectoryPly: 请求成功，接收到响应数据');
    
    // 期望后端返回格式：[{"base64": "base64编码的ply文件内容"}, ...]
    // 解析后端返回的数据
    let trajectoryData = [];
    
    // 情况1：后端返回的是包含多个PLY文件信息的数组
    if (Array.isArray(response.data)) {
      console.log(`后端返回了${response.data.length}个PLY文件数据`);
      
      // 处理每个PLY文件
      trajectoryData = await Promise.all(response.data.map(async (plyItem, index) => {
        try {
          // 确保每个项目都有base64字段
          if (plyItem && plyItem.base64) {
            console.log(`处理索引${index}的PLY文件数据`);
            
            // 解码base64数据并创建Blob
            const binaryString = atob(plyItem.base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            // 创建Blob对象和URL
            const blob = new Blob([bytes], { type: 'application/octet-stream' });
            const objectUrl = URL.createObjectURL(blob);
            
            // 返回标准格式的数据对象
            return {
              id: `trajectory_point_${index}`,
              dataUrl: objectUrl,
              size: blob.size,
              plyBatchNo: index + 1,
              timestamp: new Date().toISOString()
            };
          } else {
            console.warn(`索引${index}的PLY文件数据缺少base64字段`);
            return null;
          }
        } catch (error) {
          console.error(`处理索引${index}的PLY文件时出错:`, error);
          return null;
        }
      }));
    } 
    // 情况2：后端返回的是单个PLY文件信息
    else if (response.data && response.data.base64) {
      console.log('后端返回了单个PLY文件数据');
      
      try {
        // 解码base64数据并创建Blob
        const binaryString = atob(response.data.base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // 创建Blob对象和URL
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const objectUrl = URL.createObjectURL(blob);
        
        trajectoryData = [{
          id: 'trajectory_point_0',
          dataUrl: objectUrl,
          size: blob.size,
          plyBatchNo: 1,
          timestamp: new Date().toISOString()
        }];
      } catch (error) {
        console.error('处理单个PLY文件时出错:', error);
        trajectoryData = [];
      }
    }
    
    // 过滤掉无效数据
    const validTrajectoryData = trajectoryData.filter(Boolean);
    console.log(`成功处理了${validTrajectoryData.length}个PLY文件数据`);
    
    // 返回标准格式的结果对象
    const result = {
      batchId: batchIdStr,
      plyBatchNo: batchNoStr,
      trajectoryData: validTrajectoryData,
      totalFiles: validTrajectoryData.length
    };
    
    console.log('getCalibrationTrajectoryPly: 最终返回结果:', result);
    return result;
  } catch (error) {
    console.error(`获取校准轨迹PLY模型失败（batchId: ${batchId}, plyBatchNo: ${plyBatchNo}）:`, error);
    if (error.response) {
      console.error('服务器响应:', error.response);
    }
    throw error;
  }
};

/**
 * 获取处理后的PLY文件
 * @param {string|number} batchId - 批次ID
 * @param {number} plyBatchNo - PLY批次号
 * @returns {Promise} 返回处理后的PLY模型数据
 */
export const getPlyFile = async (batchId, plyBatchNo) => {
  console.log('getPlyFile函数开始执行，batchId:', batchId, 'plyBatchNo:', plyBatchNo);
  try {
    // 参数校验
    if (!batchId || !plyBatchNo) {
      console.error('getPlyFile: 参数错误 - batchId或plyBatchNo为空');
      throw new Error("参数错误：batchId和plyBatchNo不能为空");
    }

    // 确保参数是字符串类型
    const batchIdStr = String(batchId).trim();
    const batchNoStr = String(plyBatchNo).trim();
    
    console.log('getPlyFile: 处理后的参数 - batchId:', batchIdStr, 'plyBatchNo:', batchNoStr);

    // 构造完整URL用于调试
    const url = `${apiClient.defaults.baseURL}/getPlyFile?batchId=${encodeURIComponent(batchIdStr)}&plyBatchNo=${encodeURIComponent(batchNoStr)}`;
    console.log('getPlyFile 请求URL:', url);

    console.log('getPlyFile: 准备发送请求');
    const response = await apiClient.get('/getPlyFile', {
      params: {
        batchId: batchIdStr,
        plyBatchNo: batchNoStr
      },
      responseType: 'blob'
    });

    console.log('getPlyFile: 请求成功，response.data类型:', typeof response.data);
    console.log('getPlyFile: response.data是否为Blob:', response.data instanceof Blob);
    
    // 创建可直接使用的URL
    const objectUrl = URL.createObjectURL(response.data);
    console.log('PLY文件URL:', objectUrl);
    
    // 准备返回对象
    const result = {
      batchId: batchIdStr,
      plyBatchNo: batchNoStr,
      data: objectUrl,
      size: response.data.size
    };
    console.log('getPlyFile: 返回结果:', result);
    
    return result;
  } catch (error) {
    console.error(`获取PLY文件失败（batchId: ${batchId}, plyBatchNo: ${plyBatchNo}）:`, error);
    if (error.response) {
      console.error('服务器响应:', error.response);
    }
    throw error;
  }
};

export default {
  uploadDicomFiles,
  processDicomFiles,
  getOrganModel,
  getOrganPlyModel,
  uploadTrajectoryPly,
  getCalibrationTrajectoryPly,
  getPlyFile,
  uploadPoint2CTParams
};