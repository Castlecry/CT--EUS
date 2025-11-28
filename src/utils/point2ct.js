import * as THREE from 'three';

/**
 * 点2CT功能工具类
 * 简化实现：仅支持点选择、轴向选择和角度设置的数据收集
 */
class Point2CTManager {
  constructor() {
    // 吸附距离阈值（15个单位）
    this.吸附距离 = 15;
    // 正方形边长（85mm）
    this.正方形边长 = 85;
    // 当前选中的点
    this.选中的点 = null;
    // 选中点的法向量
    this.选中点法向量 = null;
    // 选中的轴向字符 (x, y, z)
    this.axisChar = 'z';
    // 选中的单位向量
    this.unitVector = new THREE.Vector3(0, 0, 1); // 默认z轴
    // 旋转角度
    this.旋转角度1 = 0;
    this.旋转角度2 = 0;
    this.旋转角度3 = 0;
    // 批次ID
    this.batchId = '';
  }

  /**
   * 根据鼠标点击位置，找到模型中距离最近的点
   * @param {THREE.Vector3} 点击位置 - 鼠标点击的3D坐标
   * @param {Array} 模型点列表 - 模型中的所有点坐标
   * @returns {Object|null} 找到的最近点，包含坐标、索引和法向量
   */
  吸附最近点(点击位置, 模型点列表) {
    if (!点击位置 || !模型点列表 || 模型点列表.length === 0) {
      return null;
    }

    let 最近点 = null;
    let 最小距离 = this.吸附距离;

    // 遍历所有点，找到最近的点
    for (let i = 0; i < 模型点列表.length; i++) {
      const 点 = 模型点列表[i];
      const 距离 = new THREE.Vector3(点.x, 点.y, 点.z).distanceTo(点击位置);
      
      if (距离 < 最小距离) {
        最小距离 = 距离;
        最近点 = {
          坐标: new THREE.Vector3(点.x, 点.y, 点.z),
          法向量: 点.normal ? new THREE.Vector3(点.normal.x, 点.normal.y, 点.normal.z) : null,
          索引: i,
          距离: 距离
        };
      }
    }

    return 最近点;
  }

  /**
   * 设置选中的点及其法向量
   * 兼容两种调用方式：
   * 1. 设置选中点(点信息对象) - 点信息对象包含坐标和法向量属性
   * 2. 设置选中点(坐标, 法向量) - 单独传入坐标和法向量
   */
  设置选中点(坐标, 法向量) {
    if (arguments.length === 1) {
      // 单参数模式：传入的是包含坐标和法向量的对象
      const 点信息 = 坐标;
      if (点信息) {
        this.选中的点 = 点信息.坐标;
        this.选中点法向量 = 点信息.法向量;
      } else {
        this.选中的点 = null;
        this.选中点法向量 = null;
      }
    } else if (arguments.length === 2) {
      // 双参数模式：分别传入坐标和法向量
      this.选中的点 = 坐标;
      this.选中点法向量 = 法向量;
    } else {
      // 参数数量错误，清除选中状态
      this.选中的点 = null;
      this.选中点法向量 = null;
      console.error('设置选中点：参数数量错误');
    }
  }

  /**
   * 设置选中的轴向字符
   * @param {string} axis - 'x', 'y' 或 'z'
   * @returns {boolean} 是否设置成功
   */
  设置轴向(axis) {
    const validAxes = ['x', 'y', 'z'];
    if (validAxes.includes(axis.toLowerCase())) {
      this.axisChar = axis.toLowerCase();
      return true;
    }
    console.error('无效的轴向，请选择 x, y 或 z');
    return false;
  }

  /**
   * 设置批次ID
   * 注意：此batchId必须是DICOM文件上传时生成的批次ID
   * 由uploadDicomFiles函数生成并通过路由传递到ModelViewerPage
   * @param {string} id - 批次ID
   */
  设置批次ID(id) {
    this.batchId = id;
  }

  /**
   * 设置旋转角度
   * @param {number} 角度1 - 第一次旋转角度（顺时针）
   * @param {number} 角度2 - 第二次旋转角度（顺时针）
   * @param {number} 角度3 - 第三次旋转角度（顺时针）
   */
  设置旋转角度(角度1, 角度2, 角度3) {
    // 确保角度在0-180范围内
    this.旋转角度1 = Math.max(0, Math.min(180, 角度1));
    this.旋转角度2 = Math.max(0, Math.min(180, 角度2));
    this.旋转角度3 = Math.max(0, Math.min(180, 角度3));
    console.log(`设置旋转角度：角度1=${this.旋转角度1}°（顺时针），角度2=${this.旋转角度2}°（顺时针），角度3=${this.旋转角度3}°（顺时针）`);
  }

  /**
   * 获取后端接口所需的数据格式
   * 注意：batchId来自于前面DICOM文件上传时生成的唯一标识符
   * 在uploadDicomFiles函数中使用Date.now()生成，并在整个工作流中保持一致
   * @returns {Object|null} 符合后端接口要求的JSON对象
   */
  获取上传数据() {
    if (!this.选中的点 || !this.选中点法向量 || !this.batchId) {
      console.error('缺少必要参数：点坐标、法向量或批次ID');
      return null;
    }

    return {
      batchId: this.batchId,
      point: [this.选中的点.x, this.选中的点.y, this.选中的点.z],
      normal: [this.选中点法向量.x, this.选中点法向量.y, this.选中点法向量.z],
      axisChar: this.axisChar,
      expandAlongNormal: true,
      angle1: this.旋转角度1,
      angle2: this.旋转角度2,
      angle3: this.旋转角度3,
      sideLength: this.正方形边长
    };
  }

  /**
   * 清除选中状态
   */
  清除选中状态() {
    this.选中的点 = null;
    this.选中点法向量 = null;
    this.axisChar = 'z';
    this.旋转角度1 = 0;
    this.旋转角度2 = 0;
    this.旋转角度3 = 0;
    console.log('已清除所有选中状态');
  }

  /**
   * 验证当前参数是否完整且有效
   * 特别注意：batchId必须是从DICOM文件上传流程中获取的有效值
   * @returns {Object} 包含验证结果和错误信息
   */
  验证参数() {
    const errors = [];
    
    if (!this.选中的点) {
      errors.push('未选择点');
    }
    
    if (!this.选中点法向量) {
      errors.push('未获取到法向量');
    }
    
    if (!this.batchId) {
      errors.push('未设置批次ID');
    }
    
    if (!['x', 'y', 'z'].includes(this.axisChar)) {
      errors.push(`无效的轴向: ${this.axisChar}`);
    }
    
    // 验证角度范围
    const angles = [this.旋转角度1, this.旋转角度2, this.旋转角度3];
    angles.forEach((angle, index) => {
      if (angle < 0 || angle > 180) {
        errors.push(`角度${index + 1}超出范围(0-180): ${angle}`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors: errors,
      message: errors.length === 0 ? '参数验证通过' : `参数验证失败: ${errors.join(', ')}`
    };
  }

  /**
   * 获取当前状态信息
   * @returns {Object} 当前所有状态信息
   */
  获取状态信息() {
    return {
      batchId: this.batchId,
      hasSelectedPoint: !!this.选中的点,
      point: this.选中的点 ? { x: this.选中的点.x, y: this.选中的点.y, z: this.选中的点.z } : null,
      normal: this.选中点法向量 ? { x: this.选中点法向量.x, y: this.选中点法向量.y, z: this.选中点法向量.z } : null,
      axisChar: this.axisChar,
      unitVector: { x: this.unitVector.x, y: this.unitVector.y, z: this.unitVector.z },
      angles: { angle1: this.旋转角度1, angle2: this.旋转角度2, angle3: this.旋转角度3 },
      sideLength: this.正方形边长
    };
  }

  /**
   * 设置单位向量
   * @param {THREE.Vector3} vector - 单位向量
   */
  setUnitVector(vector) {
    if (vector && vector.isVector3) {
      this.unitVector.copy(vector).normalize();
      console.log('设置单位向量:', this.unitVector.x.toFixed(3), this.unitVector.y.toFixed(3), this.unitVector.z.toFixed(3));
    }
  }

  /**
   * 设置第一个角度（围绕法向量）
   * @param {number} angle - 旋转角度（度数）
   * @returns {number} 设置后的角度值
   */
  setFirstAngle(angle) {
    // 限制角度范围在0-180度
    this.旋转角度1 = Math.max(0, Math.min(180, angle));
    console.log(`设置第一个角度: ${this.旋转角度1}度`);
    return this.旋转角度1;
  }

  /**
   * 设置第二个角度（围绕选择的轴向）
   * @param {number} angle - 旋转角度（度数）
   * @returns {number} 设置后的角度值
   */
  setSecondAngle(angle) {
    // 限制角度范围在0-180度
    this.旋转角度2 = Math.max(0, Math.min(180, angle));
    console.log(`设置第二个角度: ${this.旋转角度2}度`);
    return this.旋转角度2;
  }

  /**
   * 覆盖设置选中点方法，兼容ModelViewerPage.vue中的调用
   * @param {THREE.Vector3} point - 选中点的坐标
   * @param {THREE.Vector3} normal - 选中点的法向量
   */
  setSelectedPoint(point, normal) {
    this.选中的点 = point;
    this.选中点法向量 = normal;
    console.log('设置选中点:', point ? point.toArray() : null);
  }
  
  /**
   * 重置所有状态
   * 兼容ModelViewerPage.vue中的resetPoint2CTMode函数调用
   */
  reset() {
    this.清除选中状态();
    console.log('point2CTManager已重置');
  }
  
  /**
   * 围绕法向量旋转
   * 兼容ModelViewerPage.vue中的updateThirdAngle函数调用
   * @param {number} angle - 旋转角度（度数）
   * @returns {number} 设置后的角度值
   */
  rotateAroundFacetNormal(angle) {
    // 限制角度范围在0-180度
    this.旋转角度3 = Math.max(0, Math.min(180, angle));
    console.log(`设置第三个角度: ${this.旋转角度3}度`);
    return this.旋转角度3;
  }
}

// 导出实例
export const point2CTManager = new Point2CTManager();

// 导出工具函数
export const {
  吸附最近点,
  设置选中点,
  设置轴向,
  设置旋转角度,
  获取上传数据,
  清除选中状态,
  设置批次ID,
  setUnitVector,
  setFirstAngle,
  setSecondAngle,
  setSelectedPoint
} = point2CTManager;

export default point2CTManager;