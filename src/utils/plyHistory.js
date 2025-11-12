import * as THREE from 'three';

/**
 * 轨迹历史记录管理器
 * 负责管理和维护模型轨迹的历史记录
 */
class PlyHistoryManager {
  constructor() {
    // 存储不同模型的轨迹历史记录
    // 格式: { modelName: [{ id, name, points, lineObject, timestamp }] }
    this.trajectories = new Map();
    // 当前激活的模型名称
    this.currentModel = null;
    // 当前显示的轨迹ID
    this.currentDisplayedTrajectoryId = null;
    // 轨迹颜色列表，用于区分不同轨迹
    this.trajectoryColors = [
      0xFF0000,  // 红色
      0x00FF00,  // 绿色
      0x0000FF,  // 蓝色
      0xFFFF00,  // 黄色
      0xFF00FF,  // 紫色
      0x00FFFF,  // 青色
      0xFFA500,  // 橙色
      0x800080   // 紫红色
    ];
  }

  /**
   * 设置当前操作的模型
   * @param {string} modelName - 模型名称
   */
  setCurrentModel(modelName) {
    this.currentModel = modelName;
    // 初始化该模型的轨迹数组（如果不存在）
    if (modelName && !this.trajectories.has(modelName)) {
      this.trajectories.set(modelName, []);
    }
  }

  /**
   * 添加一条新的轨迹到历史记录
   * @param {Array} points - 轨迹点数组
   * @param {THREE.Scene} scene - 场景对象
   * @returns {Object} 新添加的轨迹对象
   */
  addTrajectory(points, scene) {
    if (!this.currentModel || !points || points.length < 2) {
      return null;
    }

    // 生成唯一ID和时间戳
    const timestamp = new Date();
    const id = `traj_${this.currentModel}_${timestamp.getTime()}`;
    
    // 创建轨迹名称
    const name = `轨迹 ${this.getTrajectories().length + 1} (${timestamp.toLocaleTimeString()})`;
    
    // 计算轨迹颜色（循环使用颜色列表）
    const colorIndex = this.getTrajectories().length % this.trajectoryColors.length;
    const color = this.trajectoryColors[colorIndex];
    
    // 创建轨迹线段
    const material = new THREE.LineBasicMaterial({
      color: color,
      linewidth: 3,
      transparent: true,
      opacity: 0.8  // 历史轨迹稍微透明一点
    });
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineObject = new THREE.Line(geometry, material);
    lineObject.name = id;
    lineObject.visible = false;  // 初始隐藏
    
    // 添加到场景
    scene.add(lineObject);
    
    // 创建轨迹记录
    const trajectory = {
      id,
      name,
      points: [...points],
      lineObject,
      timestamp,
      color
    };
    
    // 添加到历史记录
    const modelTrajectories = this.trajectories.get(this.currentModel);
    modelTrajectories.push(trajectory);
    
    console.log(`添加新轨迹到历史记录: ${name}, 点数: ${points.length}`);
    
    // 更新当前显示的轨迹ID
    this.currentDisplayedTrajectoryId = id;
    
    return trajectory;
  }

  /**
   * 获取当前模型的所有轨迹
   * @returns {Array} 轨迹数组
   */
  getTrajectories() {
    if (!this.currentModel || !this.trajectories.has(this.currentModel)) {
      return [];
    }
    return this.trajectories.get(this.currentModel);
  }

  /**
   * 显示指定的历史轨迹
   * @param {string} trajectoryId - 轨迹ID
   * @param {THREE.Scene} scene - 场景对象
   * @returns {boolean} 是否成功
   */
  showTrajectory(trajectoryId, scene) {
    if (!this.currentModel || !this.trajectories.has(this.currentModel)) {
      return false;
    }

    // 隐藏当前显示的轨迹
    this.hideCurrentTrajectory(scene);
    
    const modelTrajectories = this.trajectories.get(this.currentModel);
    const trajectory = modelTrajectories.find(t => t.id === trajectoryId);
    
    if (!trajectory) {
      console.error(`找不到指定ID的轨迹: ${trajectoryId}`);
      return false;
    }
    
    // 显示轨迹
    if (trajectory.lineObject) {
      trajectory.lineObject.visible = true;
      // 提高可见轨迹的不透明度
      trajectory.lineObject.material.opacity = 1.0;
      scene.add(trajectory.lineObject);
    }
    
    // 更新当前显示的轨迹ID
    this.currentDisplayedTrajectoryId = trajectoryId;
    
    console.log(`显示历史轨迹: ${trajectory.name}`);
    return true;
  }

  /**
   * 隐藏当前显示的历史轨迹
   * @param {THREE.Scene} scene - 场景对象
   */
  hideCurrentTrajectory(scene) {
    if (!this.currentDisplayedTrajectoryId || !this.currentModel || !this.trajectories.has(this.currentModel)) {
      return;
    }
    
    const modelTrajectories = this.trajectories.get(this.currentModel);
    const trajectory = modelTrajectories.find(t => t.id === this.currentDisplayedTrajectoryId);
    
    if (trajectory && trajectory.lineObject) {
      trajectory.lineObject.visible = false;
      // 重置不透明度
      trajectory.lineObject.material.opacity = 0.8;
    }
    
    this.currentDisplayedTrajectoryId = null;
  }

  /**
   * 删除指定的历史轨迹
   * @param {string} trajectoryId - 轨迹ID
   * @param {THREE.Scene} scene - 场景对象
   * @returns {boolean} 是否成功
   */
  deleteTrajectory(trajectoryId, scene) {
    if (!this.currentModel || !this.trajectories.has(this.currentModel)) {
      return false;
    }
    
    const modelTrajectories = this.trajectories.get(this.currentModel);
    const index = modelTrajectories.findIndex(t => t.id === trajectoryId);
    
    if (index === -1) {
      console.error(`找不到要删除的轨迹: ${trajectoryId}`);
      return false;
    }
    
    const trajectory = modelTrajectories[index];
    
    // 移除轨迹对象
    if (trajectory.lineObject) {
      scene.remove(trajectory.lineObject);
      trajectory.lineObject.geometry.dispose();
      trajectory.lineObject.material.dispose();
    }
    
    // 从数组中删除
    modelTrajectories.splice(index, 1);
    
    // 如果删除的是当前显示的轨迹，更新显示状态
    if (trajectoryId === this.currentDisplayedTrajectoryId) {
      this.currentDisplayedTrajectoryId = null;
    }
    
    // 重新命名剩余的轨迹
    this._renameTrajectories();
    
    console.log(`删除历史轨迹: ${trajectory.name}`);
    return true;
  }

  /**
   * 清除当前模型的所有轨迹历史记录
   * @param {THREE.Scene} scene - 场景对象
   */
  clearAllTrajectories(scene) {
    if (!this.currentModel || !this.trajectories.has(this.currentModel)) {
      return;
    }
    
    const modelTrajectories = this.trajectories.get(this.currentModel);
    
    // 移除所有轨迹对象
    modelTrajectories.forEach(trajectory => {
      if (trajectory.lineObject) {
        scene.remove(trajectory.lineObject);
        trajectory.lineObject.geometry.dispose();
        trajectory.lineObject.material.dispose();
      }
    });
    
    // 清空轨迹数组
    modelTrajectories.length = 0;
    
    // 重置当前显示状态
    this.currentDisplayedTrajectoryId = null;
    
    console.log(`清除${this.currentModel}的所有轨迹历史记录`);
  }

  /**
   * 清除指定器官的所有轨迹历史记录
   * @param {string} organName - 器官名称
   * @param {THREE.Scene} scene - 场景对象
   */
  clearOrganTrajectories(organName, scene) {
    if (!this.trajectories.has(organName)) {
      return;
    }
    
    const organTrajectories = this.trajectories.get(organName);
    
    // 移除所有轨迹对象
    organTrajectories.forEach(trajectory => {
      if (trajectory.lineObject) {
        scene.remove(trajectory.lineObject);
        trajectory.lineObject.geometry.dispose();
        trajectory.lineObject.material.dispose();
      }
    });
    
    // 清空轨迹数组
    organTrajectories.length = 0;
    
    // 如果是当前模型，重置当前显示状态
    if (organName === this.currentModel) {
      this.currentDisplayedTrajectoryId = null;
    }
    
    console.log(`清除${organName}的所有轨迹历史记录`);
  }

  /**
   * 重新命名轨迹，确保名称连续
   * @private
   */
  _renameTrajectories() {
    if (!this.currentModel || !this.trajectories.has(this.currentModel)) {
      return;
    }
    
    const modelTrajectories = this.trajectories.get(this.currentModel);
    modelTrajectories.forEach((trajectory, index) => {
      trajectory.name = `轨迹 ${index + 1} (${trajectory.timestamp.toLocaleTimeString()})`;
    });
  }

  /**
   * 获取指定轨迹的信息
   * @param {string} trajectoryId - 轨迹ID
   * @returns {Object|null} 轨迹对象或null
   */
  getTrajectoryById(trajectoryId) {
    if (!this.currentModel || !this.trajectories.has(this.currentModel)) {
      return null;
    }
    
    const modelTrajectories = this.trajectories.get(this.currentModel);
    return modelTrajectories.find(t => t.id === trajectoryId) || null;
  }
}

export default PlyHistoryManager;