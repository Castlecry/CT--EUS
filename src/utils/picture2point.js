import JSZip from 'jszip';

/**
 * 图像2点管理器，负责处理图像上传、API调用和结果处理
 */
class Picture2PointManager {
  constructor() {
    // 基础配置
    this.apiBaseUrl = 'http://localhost:8080/api/eus/retrieval';
    
    // 存储当前处理的文件信息
    this.currentFiles = {
      ctImage: null,
      eusImage: null,
      plyFile: null
    };
  }

  /**
   * 上传batchid和图像文件到后端
   * @param {string} batchId - 批次ID
   * @param {File} imageFile - 上传的图像文件
   * @returns {Promise<Object>} 包含处理结果的对象
   */
  async uploadImage(batchId, imageFile) {
    try {
      // 创建FormData
      const formData = new FormData();
      formData.append('batchId', batchId);
      formData.append('uploadFile', imageFile);

      // 发送请求
      const response = await fetch(`${this.apiBaseUrl}/get-all-files`, {
        method: 'POST',
        body: formData,
        // 注意：不要设置Content-Type，让浏览器自动处理
        // headers: { 'Content-Type': 'multipart/form-data' } // 这会导致边界问题
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status} ${response.statusText}`);
      }

      // 获取ZIP文件数据
      const zipData = await response.blob();
      console.log('成功获取ZIP文件:', zipData);

      // 解压ZIP文件
      const result = await this._extractZip(zipData);
      
      // 更新当前文件信息
      this.currentFiles = {
        ctImage: result.ctImage,
        eusImage: result.eusImage,
        plyFile: result.plyFile
      };

      // 解析PLY文件获取点坐标
      const points = result.plyFile ? await this._parsePlyFile(result.plyFile.blob) : [];

      return {
        success: true,
        data: {
          ctImage: result.ctImage,
          eusImage: result.eusImage,
          plyFile: result.plyFile,
          points: points,
          extractedFiles: result.files
        }
      };
    } catch (error) {
      console.error('上传和处理图像失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 解压ZIP文件并提取所需文件
   * @param {Blob} zipData - ZIP文件数据
   * @returns {Promise<Object>} 包含提取文件的对象
   */
  async _extractZip(zipData) {
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(zipData);
      
      // 存储所有文件
      const files = [];
      let ctImage = null;
      let eusImage = null;
      let plyFile = null;

      // 遍历ZIP中的文件
      for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir) continue; // 跳过目录

        const fileData = await zipEntry.async('blob');
        const fileUrl = URL.createObjectURL(fileData);
        
        // 创建文件对象
        const file = {
          name: zipEntry.name,
          path: relativePath,
          blob: fileData,
          url: fileUrl,
          type: zipEntry.name.includes('.png') ? 'image/png' : 
                zipEntry.name.includes('.jpg') ? 'image/jpeg' : 
                zipEntry.name.includes('.ply') ? 'model/ply' : 'application/octet-stream'
        };

        files.push(file);

        // 根据顺序分配文件类型
        if (!ctImage && (file.name.includes('CT') || file.type.startsWith('image/'))) {
          ctImage = file;
        } else if (!eusImage && (file.name.includes('EUS') || file.type.startsWith('image/'))) {
          eusImage = file;
        } else if (!plyFile && file.name.includes('.ply')) {
          plyFile = file;
        }
      }

      // 如果根据名称无法区分，按照文件顺序分配
      if (!ctImage && files.some(f => f.type.startsWith('image/'))) {
        ctImage = files.find(f => f.type.startsWith('image/'));
      }
      if (!eusImage && files.some(f => f.type.startsWith('image/') && f !== ctImage)) {
        eusImage = files.find(f => f.type.startsWith('image/') && f !== ctImage);
      }
      if (!plyFile) {
        plyFile = files.find(f => f.name.includes('.ply'));
      }

      console.log('ZIP解压结果:', {
        ctImage: ctImage?.name,
        eusImage: eusImage?.name,
        plyFile: plyFile?.name,
        totalFiles: files.length
      });

      return {
        ctImage,
        eusImage,
        plyFile,
        files
      };
    } catch (error) {
      console.error('解压ZIP文件失败:', error);
      throw new Error(`解压ZIP文件失败: ${error.message}`);
    }
  }

  /**
   * 获取当前处理的文件信息
   * @returns {Object} 当前文件信息
   */
  getCurrentFiles() {
    return { ...this.currentFiles };
  }

  /**
   * 清理资源，释放URL对象
   */
  cleanup() {
    if (this.currentFiles.ctImage?.url) {
      URL.revokeObjectURL(this.currentFiles.ctImage.url);
    }
    if (this.currentFiles.eusImage?.url) {
      URL.revokeObjectURL(this.currentFiles.eusImage.url);
    }
    if (this.currentFiles.plyFile?.url) {
      URL.revokeObjectURL(this.currentFiles.plyFile.url);
    }
    
    this.currentFiles = {
      ctImage: null,
      eusImage: null,
      plyFile: null
    };
    
    console.log('已清理所有资源');
  }

  /**
   * 解析PLY文件，提取点坐标数据
   * @param {Blob} plyBlob - PLY文件的Blob对象
   * @returns {Promise<Array>} 点坐标数组
   */
  async _parsePlyFile(plyBlob) {
    try {
      const text = await this._blobToText(plyBlob);
      const lines = text.trim().split('\n');
      
      // 查找顶点数据开始的位置
      let vertexStartIndex = -1;
      let vertexCount = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('element vertex')) {
          vertexCount = parseInt(line.split(' ')[2], 10);
        }
        
        if (line === 'end_header') {
          vertexStartIndex = i + 1;
          break;
        }
      }

      if (vertexStartIndex === -1) {
        throw new Error('无效的PLY文件格式，未找到头部结束标记');
      }

      // 提取顶点坐标
      const points = [];
      const endIndex = Math.min(vertexStartIndex + vertexCount, lines.length);
      
      for (let i = vertexStartIndex; i < endIndex; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const coords = line.split(/\s+/);
        if (coords.length >= 3) {
          points.push({
            x: parseFloat(coords[0]),
            y: parseFloat(coords[1]),
            z: parseFloat(coords[2])
          });
        }
      }

      console.log('成功解析PLY文件，获取到', points.length, '个点');
      return points;
    } catch (error) {
      console.error('解析PLY文件失败:', error);
      throw new Error(`解析PLY文件失败: ${error.message}`);
    }
  }

  /**
   * 将Blob转换为文本
   * @param {Blob} blob - Blob对象
   * @returns {Promise<string>} 文本内容
   */
  async _blobToText(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
  }

  /**
   * 根据四个点生成正方形面的顶点和面索引数据
   * @param {Array} points - 四个点的坐标数组
   * @returns {Object} 包含顶点和面索引的对象
   */
  generateSquareFaceData(points) {
    if (!points || points.length < 4) {
      throw new Error('生成正方形面需要至少4个点');
    }

    // 使用前四个点作为正方形的顶点
    // 确保按用户提供的PLY格式顺序使用顶点
    const vertices = points.slice(0, 4).map(point => [point.x, point.y, point.z]);
    
    console.log('处理的4个顶点坐标:', vertices);
    
    // 定义正方形的两个三角形面，确保面的正确连接
    // 使用[0,1,2]和[0,2,3]的索引组合形成一个四边形
    const faces = [
      [0, 1, 2],  // 第一个三角形
      [0, 2, 3]   // 第二个三角形
    ];

    console.log('生成正方形面数据:', { vertices, faces });
    return {
      vertices,
      faces
    };
  }

  /**
   * 验证输入参数
   * @param {string} batchId - 批次ID
   * @param {File} imageFile - 图像文件
   * @returns {Object} 验证结果
   */
  validateInput(batchId, imageFile) {
    const errors = [];
    
    if (!batchId || typeof batchId !== 'string' || !batchId.trim()) {
      errors.push('批次ID不能为空');
    }
    
    if (!imageFile) {
      errors.push('请选择上传的图像文件');
    } else if (!['image/png', 'image/jpeg'].includes(imageFile.type)) {
      errors.push('请上传PNG或JPG格式的图像文件');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// 创建单例实例
const picture2PointManager = new Picture2PointManager();

// 导出实例和类
export default picture2PointManager;
export { Picture2PointManager };