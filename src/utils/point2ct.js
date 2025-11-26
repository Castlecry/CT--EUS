import * as THREE from 'three';

/**
 * 点2CT功能工具类
 * 实现点吸附、向量计算、角度旋转和正方形面生成等核心功能
 */
class Point2CTManager {
  constructor() {
    // 吸附距离阈值（5个单位）
    this.吸附距离 = 5;
    // 正方形边长（85mm）
    this.正方形边长 = 85;
    // 当前选中的点
    this.选中的点 = null;
    // 选中点的法向量
    this.选中点法向量 = null;
    // 选中的单位向量
    this.选中单位向量 = null;
    // 旋转角度
    this.旋转角度1 = 0;
    this.旋转角度2 = 0;
    this.旋转角度3 = 0;
  }

  /**
   * 根据鼠标点击位置，找到模型中距离最近的点
   * @param {THREE.Vector3} 点击位置 - 鼠标点击的3D坐标
   * @param {Array} 模型点列表 - 模型中的所有点坐标
   * @returns {Object|null} 找到的最近点，包含坐标和索引
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
          索引: i,
          距离: 距离
        };
      }
    }

    return 最近点;
  }

  /**
   * 设置选中的点及其法向量
   * @param {Object} 点信息 - 包含坐标和法向量的点对象
   */
  设置选中点(点信息) {
    if (点信息) {
      this.选中的点 = 点信息.坐标;
      this.选中点法向量 = 点信息.法向量;
    } else {
      this.选中的点 = null;
      this.选中点法向量 = null;
    }
  }

  /**
   * 获取指定轴向的单位向量
   * @param {string} 轴向 - 'x', 'y' 或 'z'
   * @returns {THREE.Vector3} 对应的单位向量
   */
  获取轴向单位向量(轴向) {
    switch (轴向.toLowerCase()) {
      case 'x':
        return new THREE.Vector3(1, 0, 0);
      case 'y':
        return new THREE.Vector3(0, 1, 0);
      case 'z':
        return new THREE.Vector3(0, 0, 1);
      default:
        return new THREE.Vector3(1, 0, 0); // 默认x轴
    }
  }

  /**
   * 设置选中的单位向量
   * @param {THREE.Vector3} 单位向量
   */
  设置选中单位向量(单位向量) {
    this.选中单位向量 = 单位向量;
  }

  /**
   * 根据选中的点、法向量和单位向量生成初始正方形面
   * @returns {Array} 正方形的四个顶点坐标
   */
  生成初始正方形面() {
    if (!this.选中的点 || !this.选中点法向量 || !this.选中单位向量) {
      console.error('缺少必要的点或向量信息');
      return [];
    }

    // 确保法向量和单位向量垂直
    const 切线向量 = new THREE.Vector3().crossVectors(
      this.选中点法向量,
      this.选中单位向量
    ).normalize();

    // 计算正方形的四个顶点
    const 半长 = this.正方形边长 / 2;
    const 顶点1 = new THREE.Vector3(
      this.选中的点.x + 半长 * this.选中单位向量.x - 半长 * 切线向量.x,
      this.选中的点.y + 半长 * this.选中单位向量.y - 半长 * 切线向量.y,
      this.选中的点.z + 半长 * this.选中单位向量.z - 半长 * 切线向量.z
    );
    const 顶点2 = new THREE.Vector3(
      this.选中的点.x + 半长 * this.选中单位向量.x + 半长 * 切线向量.x,
      this.选中的点.y + 半长 * this.选中单位向量.y + 半长 * 切线向量.y,
      this.选中的点.z + 半长 * this.选中单位向量.z + 半长 * 切线向量.z
    );
    const 顶点3 = new THREE.Vector3(
      this.选中的点.x - 半长 * this.选中单位向量.x + 半长 * 切线向量.x,
      this.选中的点.y - 半长 * this.选中单位向量.y + 半长 * 切线向量.y,
      this.选中的点.z - 半长 * this.选中单位向量.z + 半长 * 切线向量.z
    );
    const 顶点4 = new THREE.Vector3(
      this.选中的点.x - 半长 * this.选中单位向量.x - 半长 * 切线向量.x,
      this.选中的点.y - 半长 * this.选中单位向量.y - 半长 * 切线向量.y,
      this.选中的点.z - 半长 * this.选中单位向量.z - 半长 * 切线向量.z
    );

    return [顶点1, 顶点2, 顶点3, 顶点4];
  }

  /**
   * 围绕法向量轴旋转正方形
   * @param {Array} 正方形顶点 - 要旋转的正方形的四个顶点
   * @param {number} 角度 - 旋转角度（弧度）
   * @returns {Array} 旋转后的正方形顶点
   */
  围绕法向量旋转(正方形顶点, 角度) {
    if (!this.选中的点 || !this.选中点法向量) {
      console.error('缺少必要的点或法向量信息');
      return 正方形顶点;
    }

    const 旋转矩阵 = new THREE.Matrix4().makeRotationAxis(
      this.选中点法向量,
      THREE.MathUtils.degToRad(角度)
    );

    return 正方形顶点.map(顶点 => {
      const 相对顶点 = 顶点.clone().sub(this.选中的点);
      相对顶点.applyMatrix4(旋转矩阵);
      return 相对顶点.add(this.选中的点);
    });
  }

  // 围绕单位向量旋转方法已被围绕边旋转方法替代，不再需要

  /**
   * 围绕正方形的选择点所在的边为轴旋转
   * @param {Array} 正方形顶点 - 要旋转的正方形的四个顶点
   * @param {number} 角度 - 旋转角度（弧度）
   * @returns {Array} 旋转后的正方形顶点
   */
  围绕边旋转(正方形顶点, 角度) {
    if (!this.选中的点 || 正方形顶点.length < 2) {
      console.error('缺少必要的点信息或正方形顶点不足');
      return 正方形顶点;
    }

    // 找到包含选中点的边
    // 计算选中点到各顶点的距离
    let 最近顶点 = null;
    let 次近顶点 = null;
    let 最小距离 = Infinity;
    let 次小距离 = Infinity;

    正方形顶点.forEach(顶点 => {
      const 距离 = this.计算距离(this.选中的点, 顶点);
      if (距离 < 最小距离) {
        次小距离 = 最小距离;
        次近顶点 = 最近顶点;
        最小距离 = 距离;
        最近顶点 = 顶点;
      } else if (距离 < 次小距离) {
        次小距离 = 距离;
        次近顶点 = 顶点;
      }
    });

    // 如果找不到足够的顶点，使用备用方案
    if (!最近顶点 || !次近顶点) {
      console.error('无法确定包含选中点的边');
      return 正方形顶点;
    }

    // 计算边的方向向量（作为旋转轴）
    const 边向量 = new THREE.Vector3().subVectors(次近顶点, 最近顶点).normalize();

    // 创建旋转矩阵
    const 旋转矩阵 = new THREE.Matrix4().makeRotationAxis(
      边向量,
      THREE.MathUtils.degToRad(角度)
    );

    // 计算边的中点作为旋转中心点（更准确的边旋转）
    const 边中点 = new THREE.Vector3().addVectors(最近顶点, 次近顶点).multiplyScalar(0.5);

    return 正方形顶点.map(顶点 => {
      const 相对顶点 = 顶点.clone().sub(边中点);
      相对顶点.applyMatrix4(旋转矩阵);
      return 相对顶点.add(边中点);
    });
  }

  /**
   * 围绕当前正方形面的法向量旋转
   * @param {Array} 正方形顶点 - 要旋转的正方形的四个顶点
   * @param {number} 角度 - 旋转角度（弧度）
   * @returns {Array} 旋转后的正方形顶点
   */
  围绕正方形面法向量旋转(正方形顶点, 角度) {
    if (!this.选中的点 || 正方形顶点.length < 3) {
      console.error('缺少必要的点信息或正方形顶点不足');
      return 正方形顶点;
    }

    // 计算正方形面的法向量
    const 边1 = new THREE.Vector3().subVectors(正方形顶点[1], 正方形顶点[0]);
    const 边2 = new THREE.Vector3().subVectors(正方形顶点[2], 正方形顶点[0]);
    const 面法向量 = new THREE.Vector3().crossVectors(边1, 边2).normalize();

    const 旋转矩阵 = new THREE.Matrix4().makeRotationAxis(
      面法向量,
      THREE.MathUtils.degToRad(角度)
    );

    return 正方形顶点.map(顶点 => {
      const 相对顶点 = 顶点.clone().sub(this.选中的点);
      相对顶点.applyMatrix4(旋转矩阵);
      return 相对顶点.add(this.选中的点);
    });
  }

  /**
   * 执行三次旋转操作
   * @returns {Array} 最终旋转后的正方形顶点
   */
  执行三次旋转() {
    let 正方形顶点 = this.生成初始正方形面();
    
    // 第一次旋转：围绕法向量轴
    正方形顶点 = this.围绕法向量旋转(正方形顶点, this.旋转角度1);
    
    // 第二次旋转：围绕正方形的选择点所在的边为轴旋转
    正方形顶点 = this.围绕边旋转(正方形顶点, this.旋转角度2);
    
    // 第三次旋转：围绕正方形面法向量轴
    正方形顶点 = this.围绕正方形面法向量旋转(正方形顶点, this.旋转角度3);
    
    return 正方形顶点;
  }

  /**
   * 设置旋转角度
   * @param {number} 角度1 - 第一次旋转角度
   * @param {number} 角度2 - 第二次旋转角度
   * @param {number} 角度3 - 第三次旋转角度
   */
  设置旋转角度(角度1, 角度2, 角度3) {
    // 确保角度在0-180范围内
    this.旋转角度1 = Math.max(0, Math.min(180, 角度1));
    this.旋转角度2 = Math.max(0, Math.min(180, 角度2));
    this.旋转角度3 = Math.max(0, Math.min(180, 角度3));
  }

  /**
   * 获取上传数据格式
   * @returns {Object} 包含所有参数的JSON对象
   */
  获取上传数据() {
    if (!this.选中的点 || !this.选中单位向量) {
      return null;
    }

    return {
      point: {
        x: this.选中的点.x,
        y: this.选中的点.y,
        z: this.选中的点.z
      },
      normal: this.选中点法向量 ? {
        x: this.选中点法向量.x,
        y: this.选中点法向量.y,
        z: this.选中点法向量.z
      } : null,
      unitVector: {
        x: this.选中单位向量.x,
        y: this.选中单位向量.y,
        z: this.选中单位向量.z
      },
      angles: {
        angle1: this.旋转角度1,
        angle2: this.旋转角度2,
        angle3: this.旋转角度3
      }
    };
  }

  /**
   * 清除选中状态
   */
  清除选中状态() {
    this.选中的点 = null;
    this.选中点法向量 = null;
    this.选中单位向量 = null;
    this.旋转角度1 = 0;
    this.旋转角度2 = 0;
    this.旋转角度3 = 0;
  }

  /**
   * 计算两点之间的距离
   * @param {THREE.Vector3} 点1
   * @param {THREE.Vector3} 点2
   * @returns {number} 距离值
   */
  计算距离(点1, 点2) {
    return new THREE.Vector3(
      点1.x - 点2.x,
      点1.y - 点2.y,
      点1.z - 点2.z
    ).length();
  }

  /**
   * 归一化向量
   * @param {THREE.Vector3} 向量
   * @returns {THREE.Vector3} 归一化后的向量
   */
  归一化向量(向量) {
    const 长度 = Math.sqrt(向量.x * 向量.x + 向量.y * 向量.y + 向量.z * 向量.z);
    if (长度 === 0) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(
      向量.x / 长度,
      向量.y / 长度,
      向量.z / 长度
    );
  }
}

// 导出实例
export const point2CTManager = new Point2CTManager();

// 导出工具函数
export const {
  吸附最近点,
  设置选中点,
  获取轴向单位向量,
  设置选中单位向量,
  生成初始正方形面,
  围绕法向量旋转,
  围绕边旋转,
  围绕正方形面法向量旋转,
  执行三次旋转,
  设置旋转角度,
  获取上传数据,
  清除选中状态,
  计算距离,
  归一化向量
} = point2CTManager;

export default point2CTManager;