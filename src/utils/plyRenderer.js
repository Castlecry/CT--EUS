import * as THREE from 'three';

/**
 * PLY渲染器类，用于解析PLY文件并渲染点位和法向量
 */
class PlyRenderer {
  constructor(modelRenderer) {
    // 检查modelRenderer是否有效
    if (!modelRenderer) {
      throw new Error('ModelRenderer实例不能为空');
    }
    
    // 保存对主渲染器的引用
    this.modelRenderer = modelRenderer;
    
    // 延迟初始化，确保ModelRenderer已完全初始化
    this._initialized = false;
    this._initPromise = this._initialize();
  }
  
  /**
   * 异步初始化PlyRenderer
   * @private
   */
  async _initialize() {
    try {
      // 等待ModelRenderer完全初始化
      await new Promise(resolve => {
        const checkInit = () => {
          if (this.modelRenderer && 
              this.modelRenderer.scene && 
              this.modelRenderer.camera && 
              this.modelRenderer.renderer && 
              this.modelRenderer.controls) {
            resolve();
          } else {
            setTimeout(checkInit, 50);
          }
        };
        checkInit();
      });
      
      // 获取渲染器组件
      this.scene = this.modelRenderer.scene;
      this.camera = this.modelRenderer.camera;
      this.renderer = this.modelRenderer.renderer;
      this.controls = this.modelRenderer.controls;
      
      // 初始化PLY数据存储
      this.pointsObjects = new Map(); // 存储已渲染的点云对象
      this.vectorsObjects = new Map(); // 存储已渲染的法向量对象
      this.pointsData = new Map(); // 存储原始点位数据，用于吸附计算
      
      // 线段绘制相关状态
      this.isDrawing = false; // 是否处于绘制状态
      this.currentModel = null; // 当前绘制的模型
      this.lineObject = null; // 当前绘制的线段对象
      this.startPoint = null; // 线段起点
      this.endPoint = null; // 线段终点
      this.tempLine = null; // 临时线段（拖动时）
      
      // 事件处理函数引用 - 延迟到方法定义后再绑定
      this._bindEventHandlers();
      
      this._initialized = true;
      console.log('PlyRenderer初始化完成');
    } catch (error) {
      console.error('PlyRenderer初始化失败:', error);
      throw error;
    }
  }
  
  /**
   * 确保PlyRenderer已初始化
   * @private
   */
  async _ensureInitialized() {
    if (!this._initialized) {
      await this._initPromise;
    }
  }

  /**
   * 获取并渲染PLY文件中的点位和法向量
   * @param {string} organName - 器官名称
   * @param {Function} getOrganPlyModel - 获取PLY模型的API函数
   * @returns {Promise<boolean>} - 是否渲染成功
   */
  async loadAndRenderPlyPoints(organName, getOrganPlyModel) {
    try {
      // 确保PlyRenderer已初始化
      if (!this.modelRenderer || !this.modelRenderer.scene) {
        console.error('PlyRenderer未正确初始化');
        return false;
      }
      
      // 检查是否已有该器官的点位数据，如果有则先清除
      this.clearPlyData(organName);

      // 调用API获取PLY模型数据
      const plyData = await getOrganPlyModel(organName);
      
      // 读取PLY文件内容
      const response = await fetch(plyData.data);
      const plyText = await response.text();
      
      // 解析PLY文件
      const points = this.parsePlyFile(plyText);
      
      if (!points || points.length === 0) {
        console.error('未解析到有效点位数据');
        return false;
      }

      // 渲染点位
      const pointsObject = this.renderPoints(points);
      // 渲染法向量
      const vectorsObject = this.renderNormals(points);

      // 将对象添加到场景中
      if (this.modelRenderer && this.modelRenderer.scene) {
        this.modelRenderer.scene.add(pointsObject);
        this.modelRenderer.scene.add(vectorsObject);
        
        // 存储对象引用和原始点位数据
        this.pointsObjects.set(organName, pointsObject);
        this.vectorsObjects.set(organName, vectorsObject);
        this.pointsData.set(organName, points); // 存储原始点位数据用于吸附计算
        
        // 重新渲染场景
        this.modelRenderer.render();
        
        console.log(`成功渲染${organName}的点位和法向量，共${points.length}个点`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('加载和渲染PLY文件失败:', error);
      return false;
    }
  }

  /**
   * 解析PLY文件内容
   * @param {string} plyText - PLY文件文本内容
   * @returns {Array} - 包含点坐标和法向量的数组
   */
  parsePlyFile(plyText) {
    const lines = plyText.trim().split('\n');
    const points = [];
    let dataStartIndex = -1;
    let vertexCount = 0;
    
    // 解析头部信息
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 查找顶点数量
      if (line.startsWith('element vertex')) {
        vertexCount = parseInt(line.split(' ')[2]);
      }
      
      // 查找数据部分起始位置
      if (line === 'end_header') {
        dataStartIndex = i + 1;
        break;
      }
    }
    
    if (dataStartIndex === -1) {
      console.error('PLY文件格式错误：未找到end_header标记');
      return [];
    }
    
    // 解析数据部分
    const dataLines = lines.slice(dataStartIndex, dataStartIndex + vertexCount);
    
    for (const line of dataLines) {
      const values = line.trim().split(/\s+/).map(parseFloat);
      
      // 确保每行有6个数据（3个坐标 + 3个法向量）
      if (values.length >= 6) {
        points.push({
          x: values[0],
          y: values[1],
          z: values[2],
          nx: values[3],
          ny: values[4],
          nz: values[5]
        });
      }
    }
    
    return points;
  }
  
  /**
   * 启动线段绘制模式
   * @param {string} modelName - 当前选中的模型名称
   */
  startDrawing(modelName) {
    if (!this.modelRenderer || !this.modelRenderer.scene || !this.modelRenderer.renderer) {
      console.error('模型渲染器未初始化');
      return false;
    }
    
    // 检查是否有该模型的点位数据
    if (!this.pointsData.has(modelName)) {
      console.error(`模型${modelName}没有点位数据`);
      return false;
    }
    
    // 清除之前的线段
    this.clearLine();
    
    // 设置绘制状态
    this.isDrawing = true;
    this.currentModel = modelName;
    
    // 添加事件监听
    const domElement = this.modelRenderer.renderer.domElement;
    domElement.addEventListener('mousedown', this.onMouseDown);
    domElement.addEventListener('mousemove', this.onMouseMove);
    domElement.addEventListener('mouseup', this.onMouseUp);
    
    console.log(`开始在模型${modelName}上绘制线段`);
    return true;
  }
  
  /**
   * 停止线段绘制模式
   */
  stopDrawing() {
    if (!this.isDrawing || !this.modelRenderer || !this.modelRenderer.renderer) return;
    
    this.isDrawing = false;
    this.currentModel = null;
    
    // 移除临时线段
    this.removeTempLine();
    
    // 移除事件监听
    const domElement = this.modelRenderer.renderer.domElement;
    domElement.removeEventListener('mousedown', this.onMouseDown);
    domElement.removeEventListener('mousemove', this.onMouseMove);
    domElement.removeEventListener('mouseup', this.onMouseUp);
    
    console.log('停止线段绘制');
  }
  
  /**
   * 切换线段绘制模式
   * @param {string} modelName - 当前选中的模型名称
   */
  toggleDrawing(modelName) {
    if (this.isDrawing) {
      this.stopDrawing();
      return false;
    } else {
      return this.startDrawing(modelName);
    }
  }
  
  /**
   * 鼠标按下事件处理
   */
  onMouseDown(event) {
    if (!this.isDrawing || !this.currentModel) return;
    
    // 获取点击位置的吸附点
    const snapPoint = this.getNearestPointFromMouse(event);
    if (snapPoint) {
      this.startPoint = snapPoint;
      this.endPoint = snapPoint;
      this.drawTempLine();
    }
  }
  
  /**
   * 鼠标移动事件处理
   */
  onMouseMove(event) {
    if (!this.isDrawing || !this.startPoint || !this.currentModel) return;
    
    // 获取移动位置的吸附点
    const snapPoint = this.getNearestPointFromMouse(event);
    if (snapPoint) {
      this.endPoint = snapPoint;
      this.drawTempLine();
    }
  }
  
  /**
   * 鼠标抬起事件处理
   */
  onMouseUp(event) {
    if (!this.isDrawing || !this.startPoint || !this.endPoint || !this.currentModel) {
      this.startPoint = null;
      this.endPoint = null;
      this.removeTempLine();
      return;
    }
    
    // 确认绘制线段
    this.drawFinalLine();
    this.startPoint = null;
    this.endPoint = null;
    this.removeTempLine();
  }
  
  /**
   * 从鼠标位置获取最近的点位
   */
  getNearestPointFromMouse(event) {
    if (!this.modelRenderer || !this.modelRenderer.camera || !this.currentModel) return null;
    
    // 计算鼠标在标准化设备坐标中的位置
    const rect = this.modelRenderer.renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // 创建射线
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: mouseX, y: mouseY }, this.modelRenderer.camera);
    
    // 检查是否点击在当前模型上
    const model = this.modelRenderer.models?.get(this.currentModel);
    if (!model) return null;
    
    const intersects = raycaster.intersectObject(model, true);
    if (intersects.length === 0) return null;
    
    // 获取交点
    const intersectionPoint = intersects[0].point;
    
    // 找到最近的点位
    const points = this.pointsData.get(this.currentModel);
    if (!points || points.length === 0) return null;
    
    let nearestPoint = null;
    let minDistance = Infinity;
    
    for (const point of points) {
      const distance = new THREE.Vector3(point.x, point.y, point.z).distanceTo(intersectionPoint);
      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }
    
    return nearestPoint;
  }
  
  /**
   * 绘制临时线段（拖动时）
   */
  drawTempLine() {
    if (!this.startPoint || !this.endPoint || !this.modelRenderer || !this.modelRenderer.scene) return;
    
    this.removeTempLine();
    
    // 创建几何体
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      this.startPoint.x, this.startPoint.y, this.startPoint.z,
      this.endPoint.x, this.endPoint.y, this.endPoint.z
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // 创建材质 - 红色半透明
    const material = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 3,
      transparent: true,
      opacity: 0.7
    });
    
    // 创建线段对象
    this.tempLine = new THREE.Line(geometry, material);
    this.modelRenderer.scene.add(this.tempLine);
    this.modelRenderer.render();
  }
  
  /**
   * 绘制最终线段
   */
  drawFinalLine() {
    if (!this.startPoint || !this.endPoint || !this.modelRenderer || !this.modelRenderer.scene) return;
    
    // 清除之前的线段
    this.clearLine();
    
    // 创建几何体
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      this.startPoint.x, this.startPoint.y, this.startPoint.z,
      this.endPoint.x, this.endPoint.y, this.endPoint.z
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // 创建材质 - 红色
    const material = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 3
    });
    
    // 创建线段对象
    this.lineObject = new THREE.Line(geometry, material);
    this.modelRenderer.scene.add(this.lineObject);
    this.modelRenderer.render();
    
    console.log('线段绘制完成');
  }
  
  /**
   * 移除临时线段
   */
  removeTempLine() {
    if (this.tempLine && this.modelRenderer && this.modelRenderer.scene) {
      this.modelRenderer.scene.remove(this.tempLine);
      this.tempLine.geometry.dispose();
      this.tempLine.material.dispose();
      this.tempLine = null;
      this.modelRenderer.render();
    }
  }
  
  /**
   * 清除已绘制的线段
   */
  clearLine() {
    if (this.lineObject && this.modelRenderer && this.modelRenderer.scene) {
      this.modelRenderer.scene.remove(this.lineObject);
      this.lineObject.geometry.dispose();
      this.lineObject.material.dispose();
      this.lineObject = null;
      this.modelRenderer.render();
    }
  }
  
  /**
   * 获取当前绘制状态
   */
  getDrawingState() {
    return this.isDrawing;
  }

  /**
   * 渲染点位
   * @param {Array} points - 点数据数组
   * @returns {THREE.Points} - 点云对象
   */
  renderPoints(points) {
    // 创建几何体
    const geometry = new THREE.BufferGeometry();
    
    // 准备顶点数据
    const positions = new Float32Array(points.length * 3);
    
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const index = i * 3;
      positions[index] = point.x;
      positions[index + 1] = point.y;
      positions[index + 2] = point.z;
    }
    
    // 设置几何体属性
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // 创建材质 - 黑色
    const material = new THREE.PointsMaterial({
      color: 0x000000, // 黑色
      size: 0.5,       // 点的大小
      transparent: true,
      opacity: 1.0
    });
    
    // 创建点云对象
    const pointsObject = new THREE.Points(geometry, material);
    
    return pointsObject;
  }

  /**
   * 渲染法向量
   * @param {Array} points - 点数据数组
   * @returns {THREE.LineSegments} - 法向量线段对象
   */
  renderNormals(points) {
    // 创建几何体
    const geometry = new THREE.BufferGeometry();
    
    // 准备顶点数据 - 每个法向量需要两个点
    const positions = new Float32Array(points.length * 2 * 3);
    
    // 法向量长度因子，用于控制法向量的显示长度
    const normalLength = 5.0; // 设置较长的法向量长度
    
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const baseIndex = i * 6; // 每个法向量占用6个位置（2个点 × 3个坐标）
      
      // 起始点（原始点位置）
      positions[baseIndex] = point.x;
      positions[baseIndex + 1] = point.y;
      positions[baseIndex + 2] = point.z;
      
      // 终点（原始点位置 + 法向量 × 长度因子）
      positions[baseIndex + 3] = point.x + point.nx * normalLength;
      positions[baseIndex + 4] = point.y + point.ny * normalLength;
      positions[baseIndex + 5] = point.z + point.nz * normalLength;
    }
    
    // 设置几何体属性
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // 创建材质 - 黑色
    const material = new THREE.LineBasicMaterial({
      color: 0x000000, // 黑色
      linewidth: 1     // 线宽
    });
    
    // 创建线段对象
    const linesObject = new THREE.LineSegments(geometry, material);
    
    return linesObject;
  }

  /**
   * 清除指定器官的PLY数据
   * @param {string} organName - 器官名称
   */
  clearPlyData(organName) {
    // 如果正在绘制该模型的线段，停止绘制
    if (this.isDrawing && this.currentModel === organName) {
      this.stopDrawing();
    }
    
    // 清除点位对象
    if (this.pointsObjects.has(organName)) {
      const pointsObject = this.pointsObjects.get(organName);
      if (this.modelRenderer && this.modelRenderer.scene && pointsObject.parent === this.modelRenderer.scene) {
        this.modelRenderer.scene.remove(pointsObject);
      }
      pointsObject.geometry.dispose();
      pointsObject.material.dispose();
      this.pointsObjects.delete(organName);
    }
    
    // 清除法向量对象
    if (this.vectorsObjects.has(organName)) {
      const vectorsObject = this.vectorsObjects.get(organName);
      if (this.modelRenderer && this.modelRenderer.scene && vectorsObject.parent === this.modelRenderer.scene) {
        this.modelRenderer.scene.remove(vectorsObject);
      }
      vectorsObject.geometry.dispose();
      vectorsObject.material.dispose();
      this.vectorsObjects.delete(organName);
    }
    
    // 清除点位数据
    if (this.pointsData.has(organName)) {
      this.pointsData.delete(organName);
    }
    
    // 如果有场景引用，重新渲染
    if (this.modelRenderer && this.modelRenderer.render) {
      this.modelRenderer.render();
    }
  }

  /**
   * 清除所有PLY数据
   */
  clearAllPlyData() {
    // 停止绘制
    if (this.isDrawing) {
      this.stopDrawing();
    }
    
    const organNames = [...this.pointsObjects.keys()];
    organNames.forEach(organName => this.clearPlyData(organName));
    
    // 清除线段
    this.clearLine();
  }

  /**
 * 检查是否已为指定器官加载了PLY数据
 * @param {string} organName - 器官名称
 * @returns {boolean} - 是否已加载
 */
  hasPlyData(organName) {
    // 如果还未初始化，返回false
    if (!this._initialized) {
      return false;
    }
    return this.pointsObjects.has(organName) && this.vectorsObjects.has(organName);
  }

  /**
   * 绑定事件处理函数
   * @private
   */
  _bindEventHandlers() {
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
  }
}

export default PlyRenderer;