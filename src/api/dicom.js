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
 * 上传轨迹点云为PLY文件
 * @param {string} fileName - 文件名（不包含后缀）
 * @param {string} content - PLY文件内容
 * @param {string|number} batchId - 批次ID
 * @returns {Promise} 返回上传结果
 */
export const uploadTrajectoryPly = async (plyBlob, batchId) => {
  if (!plyBlob || !batchId) {
    console.error('No PLY file or batchId provided');
    return Promise.reject(new Error('No PLY file or batchId provided'));
  }
  
  try {
    const formData = new FormData();
    formData.append('plyFile', plyBlob);
    formData.append('batchId', batchId);
    
    const response = await axios.post('/eus/generate-video', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error uploading trajectory PLY file:', error);
    throw error;
  }
};

export default {
  uploadDicomFiles,
  processDicomFiles,
  getOrganModel,
  getOrganPlyModel,
  uploadTrajectoryPly
};