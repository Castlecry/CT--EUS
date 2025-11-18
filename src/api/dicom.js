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
 * 上传轨迹点云为PLY文件并处理后端分批返回的PLY文件流
 * @param {Blob} plyBlob - PLY文件Blob对象
 * @param {string|number} batchId - 批次ID
 * @param {Function} onPlyReceived - 处理每个接收到的PLY文件的回调函数
 * @returns {Promise} 返回处理结果
 */
export const uploadTrajectoryPly = async (plyBlob, batchId, onPlyReceived) => {
  if (!plyBlob || !batchId) {
    console.error('No PLY file or batchId provided');
    return Promise.reject(new Error('No PLY file or batchId provided'));
  }
  
  try {
    // 设置更长的超时时间，确保能接收所有PLY文件
    const response = await apiClient.post('/eus/generate-video', {
      trajectory: plyBlob,
      batch_id: batchId
    }, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      responseType: 'stream',
      timeout: 600000 // 10分钟超时，确保有足够时间接收所有文件
    });
    
    // 创建一个Promise来处理流式响应
    return new Promise((resolve, reject) => {
      const reader = response.data.getReader();
      const buffer = [];
      let currentFile = null;
      let fileCount = 0;
      
      // 超时处理
      const timeoutId = setTimeout(() => {
        reject(new Error('接收PLY文件超时，请检查网络连接或后端服务'));
      }, 600000); // 10分钟超时
      
      reader.read().then(function processChunk({ done, value }) {
        // 清除超时定时器
        clearTimeout(timeoutId);
        
        if (done) {
          // 处理最后一个可能未处理的文件
          if (buffer.length > 0) {
            processCurrentFile();
          }
          console.log(`所有PLY文件接收完成，共${fileCount}个文件`);
          resolve({ status: 'completed', message: '所有PLY文件处理完成', fileCount: fileCount });
          return;
        }
        
        // 添加新数据到缓冲区
        buffer.push(value);
        
        // 尝试将缓冲区内容转换为字符串以检查是否包含完整的PLY文件
        const combinedBuffer = new Uint8Array(buffer.reduce((acc, val) => acc + val.byteLength, 0));
        let offset = 0;
        for (const chunk of buffer) {
          combinedBuffer.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }
        
        const bufferString = String.fromCharCode.apply(null, combinedBuffer);
        const plyHeaderIndex = bufferString.indexOf('ply');
        
        // 如果找到PLY文件头，并且不是在缓冲区的开始位置，说明前面可能有完整的PLY文件
        if (plyHeaderIndex > 0) {
          // 提取当前完整的PLY文件数据
          const completeFileData = combinedBuffer.slice(0, plyHeaderIndex);
          const remainingData = combinedBuffer.slice(plyHeaderIndex);
          
          // 处理完整的PLY文件
          processPlyData(completeFileData);
          
          // 更新缓冲区，只保留剩余的数据
          buffer.length = 0;
          buffer.push(remainingData.buffer);
        }
        
        // 继续读取下一个数据块，设置适当的延迟确保不占用过多资源
        setTimeout(() => {
          reader.read().then(processChunk).catch(error => {
            clearTimeout(timeoutId);
            reject(error);
          });
        }, 50); // 短暂延迟，避免CPU占用过高
      }).catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
      
      // 处理完整的PLY文件数据
      function processPlyData(plyData) {
        const plyBlob = new Blob([plyData], { type: 'application/octet-stream' });
        parsePlyFile(plyBlob).then(parsedData => {
          // 确保有5个点数据
          if (parsedData.points && parsedData.points.length >= 5) {
            const trajectoryData = {
              targetPoint: parsedData.points[0], // 第一个点作为目标点
              facePoints: parsedData.points.slice(1, 5) // 后四个点用于形成面
            };
            
            fileCount++;
            console.log(`处理第${fileCount}个PLY文件，包含${parsedData.points.length}个点`);
            
            // 调用回调函数处理解析后的数据
            if (typeof onPlyReceived === 'function') {
              onPlyReceived(trajectoryData);
            }
          }
        }).catch(error => {
          console.error('解析PLY文件失败:', error);
          // 解析失败不中断整个流程，继续处理下一个文件
        });
      }
      
      // 处理当前缓冲区中的文件
      function processCurrentFile() {
        const combinedChunks = new Blob(buffer, { type: 'application/octet-stream' });
        processPlyData(combinedChunks);
        buffer.length = 0;
      }
    });
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
 * 获取校准轨迹的PLY文件
 * @param {string|number} batchId - 批次ID
 * @param {number} plyBatchNo - PLY批次号，初始为1，每次画新线自增
 * @returns {Promise} 返回校准轨迹的PLY模型数据
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
    const response = await apiClient.get('/eus/calibration-trajectory', {
      params: {
        batchId: batchIdStr,
        plyBatchNo: batchNoStr
      },
      responseType: 'blob'
    });

    console.log('getCalibrationTrajectoryPly: 请求成功，response.data类型:', typeof response.data);
    console.log('getCalibrationTrajectoryPly: response.data是否为Blob:', response.data instanceof Blob);
    
    // 创建可直接使用的URL
    const objectUrl = URL.createObjectURL(response.data);
    console.log('校准轨迹PLY模型URL:', objectUrl);
    
    // 准备返回对象
    const result = {
      batchId: batchIdStr,
      plyBatchNo: batchNoStr,
      data: objectUrl,
      size: response.data.size
    };
    console.log('getCalibrationTrajectoryPly: 返回结果:', result);
    
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
    const url = `${apiClient.defaults.baseURL}/api/getPlyFile?batchId=${encodeURIComponent(batchIdStr)}&plyBatchNo=${encodeURIComponent(batchNoStr)}`;
    console.log('getPlyFile 请求URL:', url);

    console.log('getPlyFile: 准备发送请求');
    const response = await apiClient.get('/api/getPlyFile', {
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
  getPlyFile
};