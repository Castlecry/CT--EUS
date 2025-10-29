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
      this._normalsVisibility = new Map(); // 存储法向量可见性状态

      // 线段绘制相关状态
      this.isDrawing = false; // 是否处于绘制模式
      this.isDragging = false; // 是否正在拖动画线
      this.currentModel = null; // 当前绘制的模型
      this.lineObject = null; // 最终绘制的线段对象
      this.startPoint = null; // 线段起点
      this.trajectoryPoints = []; // 用户绘制的原始轨迹点
      this.snappedTrajectoryPoints = []; // 吸附到模型点位的轨迹点
      this.trajectoryLine = null; // 实时预览轨迹线
      this.selectedPoints = []; // 保存所有选中的点（曲线点+附近点）
      this.drawnCurves = []; // 保存已绘制的所有曲线数据
      this.snapCallback = null; // 吸附回调函数
      this.snapEnabled = false; // 是否启用吸附

      // 初始化射线检测器
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();

      // 绑定事件处理函数
      this._bindEventHandlers();

      this._initialized = true;
      console.log('PlyRenderer初始化成功');
    } catch (error) {
      console.error('PlyRenderer初始化失败:', error);
      throw error;
    }
  }

  /**
   * 绑定事件处理函数
   * @private
   */
  _bindEventHandlers() {
    if (!this.renderer || !this.renderer.domElement) {
      console.error('无法绑定事件，渲染器DOM元素不存在');
      return;
    }

    // 保存事件处理函数的引用，用于后续解绑
    this._handleMouseDown = this._onMouseDown.bind(this);
    this._handleMouseMove = this._onMouseMove.bind(this);
    this._handleMouseUp = this._onMouseUp.bind(this);
    this._handleMouseLeave = this._onMouseLeave.bind(this);

    // 初始不绑定事件，在进入绘制模式时绑定
  }

  /**
   * 解绑事件处理函数
   * @private
   */
  _unbindEventHandlers() {
    if (!this.renderer || !this.renderer.domElement) return;

    this.renderer.domElement.removeEventListener('mousedown', this._handleMouseDown);
    this.renderer.domElement.removeEventListener('mousemove', this._handleMouseMove);
    this.renderer.domElement.removeEventListener('mouseup', this._handleMouseUp);
    this.renderer.domElement.removeEventListener('mouseleave', this._handleMouseLeave);
  }

  /**
   * 加载并渲染PLY点位和法向量
   * @param {string} organName - 器官名称
   * @param {Function} getOrganPlyModel - 获取PLY模型的API函数
   * @returns {Promise<boolean>} 是否成功
   */
  async loadAndRenderPlyPoints(organName, getOrganPlyModel) {
    if (!this._initialized || !organName || typeof getOrganPlyModel !== 'function') {
      console.error('加载PLY点位失败：初始化未完成或参数无效');
      return false;
    }

    try {
      console.log(`开始加载${organName}的PLY点位数据`);

      // 清除该器官的现有数据
      this._clearOrganData(organName);

      // 调用API获取PLY数据
      const plyData = await getOrganPlyModel(organName);
      if (!plyData || !plyData.data) {
        throw new Error('获取PLY数据失败：返回数据无效');
      }

      // 加载PLY文件
      const pointsAndNormals = await this._loadPlyFile(plyData.data);
      if (!pointsAndNormals || !pointsAndNormals.points || pointsAndNormals.points.length === 0) {
        throw new Error('解析PLY文件失败：未找到有效点位数据');
      }

      // 保存点位数据
      this.pointsData.set(organName, pointsAndNormals);

      // 渲染点位
      this._renderPoints(organName, pointsAndNormals.points);

      // 渲染法向量（默认隐藏）
      if (pointsAndNormals.normals && pointsAndNormals.normals.length > 0) {
        this._renderNormals(organName, pointsAndNormals.points, pointsAndNormals.normals);
        this._normalsVisibility.set(organName, false);
      }

      console.log(`成功加载并渲染${organName}的PLY点位数据`);
      return true;
    } catch (error) {
      console.error(`加载PLY点位失败：${error.message}`);
      // 确保清除可能存在的部分数据
      this._clearOrganData(organName);
      return false;
    }
  }

  /**
   * 加载PLY文件并解析点位和法向量
   * @private
   * @param {string} url - PLY文件URL
   * @returns {Promise<{points: Array, normals: Array}>} 解析后的点位和法向量
   */
  async _loadPlyFile(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`加载PLY文件失败：${response.statusText}`);
      }

      const text = await response.text();
      const lines = text.split('\n');
      
      // 解析PLY头部，找到数据起始位置
      let dataStartIndex = -1;
      let vertexCount = 0;
      let hasNormals = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('element vertex')) {
          vertexCount = parseInt(line.split(' ')[2]);
        } else if (line.startsWith('property float nx')) {
          hasNormals = true;
        } else if (line === 'end_header') {
          dataStartIndex = i + 1;
          break;
        }
      }

      if (dataStartIndex === -1 || vertexCount === 0) {
        throw new Error('无效的PLY文件格式：未找到头部信息或顶点计数');
      }

      // 解析顶点数据
      const points = [];
      const normals = [];
      
      for (let i = dataStartIndex; i < dataStartIndex + vertexCount && i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(/\s+/).map(parseFloat);
        
        // 每行的前三个是x,y,z坐标
        if (values.length >= 3) {
          points.push(new THREE.Vector3(values[0], values[1], values[2]));
          
          // 后三个是法向量
          if (hasNormals && values.length >= 6) {
            normals.push(new THREE.Vector3(values[3], values[4], values[5]).normalize());
          }
        }
      }

      console.log(`PLY文件解析完成：${points.length}个点位，${hasNormals ? normals.length : 0}个法向量`);
      return { points, normals };
    } catch (error) {
      console.error(`解析PLY文件失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 渲染点位
   * @private
   * @param {string} organName - 器官名称
   * @param {Array<THREE.Vector3>} points - 点位数据
   */
  _renderPoints(organName, points) {
    // 创建点材质（黑色）
    const material = new THREE.PointsMaterial({
      color: 0x000000, // 黑色
      size: 0.5,
      sizeAttenuation: true
    });

    // 创建几何体
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // 创建点云对象
    const pointsObject = new THREE.Points(geometry, material);
    pointsObject.name = `${organName}_points`;

    // 添加到场景
    this.scene.add(pointsObject);
    this.pointsObjects.set(organName, pointsObject);

    console.log(`渲染了${points.length}个点位`);
  }

  /**
   * 渲染法向量
   * @private
   * @param {string} organName - 器官名称
   * @param {Array<THREE.Vector3>} points - 点位数据
   * @param {Array<THREE.Vector3>} normals - 法向量数据
   */
  _renderNormals(organName, points, normals) {
    // 创建法向量组
    const normalsGroup = new THREE.Group();
    normalsGroup.name = `${organName}_normals`;
    normalsGroup.visible = false; // 默认隐藏

    // 创建线段材质（黑色）
    const material = new THREE.LineBasicMaterial({
      color: 0x000000
    });

    // 为每个点创建法向量线段
    const normalLength = 1.0; // 法向量长度
    
    for (let i = 0; i < points.length && i < normals.length; i++) {
      const startPoint = points[i];
      const endPoint = new THREE.Vector3(
        startPoint.x + normals[i].x * normalLength,
        startPoint.y + normals[i].y * normalLength,
        startPoint.z + normals[i].z * normalLength
      );

      const geometry = new THREE.BufferGeometry().setFromPoints([startPoint, endPoint]);
      const line = new THREE.Line(geometry, material);
      normalsGroup.add(line);
    }

    // 添加到场景
    this.scene.add(normalsGroup);
    this.vectorsObjects.set(organName, normalsGroup);

    console.log(`渲染了${normals.length}个法向量`);
  }

  /**
   * 切换绘制模式
   * @param {string} organName - 器官名称
   * @returns {boolean} 当前绘制模式状态
   */
  toggleDrawing(organName) {
    if (!this._initialized || !this.hasPlyData(organName)) {
      console.error('切换绘制模式失败：初始化未完成或未加载PLY数据');
      return false;
    }

    try {
      // 如果当前不在绘制模式，进入绘制模式
      if (!this.isDrawing) {
        this.isDrawing = true;
        this.currentModel = organName;
        this._startDrawing();
        console.log(`进入绘制模式：${organName}`);
      } else {
        // 如果已经在绘制模式，退出
        this._stopDrawing();
        console.log('退出绘制模式');
      }

      return this.isDrawing;
    } catch (error) {
      console.error('切换绘制模式失败：', error);
      this._stopDrawing();
      return false;
    }
  }

  /**
   * 开始绘制模式
   * @private
   */
  _startDrawing() {
    // 绑定鼠标事件
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.addEventListener('mousedown', this._handleMouseDown);
      this.renderer.domElement.addEventListener('mousemove', this._handleMouseMove);
      this.renderer.domElement.addEventListener('mouseup', this._handleMouseUp);
      this.renderer.domElement.addEventListener('mouseleave', this._handleMouseLeave);
    }

    // 初始化轨迹数据
    this.trajectoryPoints = [];
    this.snappedTrajectoryPoints = [];
    this.selectedPoints = [];

    // 设置鼠标样式
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.style.cursor = 'crosshair';
    }

    // 禁用控制器，固定模型
    if (this.controls) {
      this.controls.enabled = false;
      console.log('控制器已禁用，模型固定');
    }
  }

  /**
   * 停止绘制模式
   * @private
   */
  _stopDrawing() {
    this.isDrawing = false;
    this.isDragging = false;
    
    // 解绑鼠标事件
    this._unbindEventHandlers();

    // 保存当前绘制的轨迹
    if (this.snappedTrajectoryPoints.length > 1) {
      this.drawnCurves.push({
        organName: this.currentModel,
        points: [...this.snappedTrajectoryPoints],
        selectedPoints: [...this.selectedPoints]
      });
    }

    // 清除临时轨迹预览
    this._clearTrajectory();

    // 恢复鼠标样式
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.style.cursor = 'default';
    }

    // 重新启用控制器
    if (this.controls) {
      this.controls.enabled = true;
      console.log('控制器已重新启用');
    }

    // 清理吸附设置
    this.snapEnabled = false;
    this.snapCallback = null;
  }

  /**
   * 鼠标按下事件处理
   * @private
   * @param {MouseEvent} event - 鼠标事件
   */
  _onMouseDown(event) {
    if (!this.isDrawing) return;

    this.isDragging = true;
    this._updateMousePosition(event);
    this._addPointAtMouse(event);
  }

  /**
   * 鼠标移动事件处理
   * @private
   * @param {MouseEvent} event - 鼠标事件
   */
  _onMouseMove(event) {
    if (!this.isDrawing || !this.isDragging) return;

    this._updateMousePosition(event);
    this._addPointAtMouse(event);
    this._updateTrajectoryPreview();
  }

  /**
   * 鼠标释放事件处理
   * @private
   * @param {MouseEvent} event - 鼠标事件
   */
  _onMouseUp(event) {
    if (!this.isDrawing || !this.isDragging) return;

    this.isDragging = false;
    this._finalizeTrajectory();
  }

  /**
   * 鼠标离开事件处理
   * @private
   */
  _onMouseLeave() {
    if (!this.isDrawing || !this.isDragging) return;

    this.isDragging = false;
    this._finalizeTrajectory();
  }

  /**
   * 更新鼠标位置
   * @private
   * @param {MouseEvent} event - 鼠标事件
   */
  _updateMousePosition(event) {
    if (!this.renderer || !this.renderer.domElement) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * 在鼠标位置添加点
   * @private
   * @param {MouseEvent} event - 鼠标事件
   */
  _addPointAtMouse(event) {
    // 使用射线检测找到模型上的点
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    let pointToAdd = null;
    
    // 方法1: 尝试吸附到最近的点位
    if (this.snapEnabled && this.currentModel && this.pointsData.has(this.currentModel)) {
      const closestPoint = this._findClosestPoint(this.mouse);
      if (closestPoint) {
        pointToAdd = closestPoint;
        console.log('吸附到最近点:', pointToAdd.x.toFixed(2), pointToAdd.y.toFixed(2), pointToAdd.z.toFixed(2));
      }
    }
    
    // 方法2: 如果没有吸附点，尝试检测模型表面
    if (!pointToAdd && this.modelRenderer && this.modelRenderer.models && this.currentModel) {
      const model = this.modelRenderer.models.get(this.currentModel);
      if (model) {
        const modelIntersects = this.raycaster.intersectObject(model, true);
        if (modelIntersects.length > 0) {
          pointToAdd = modelIntersects[0].point;
          console.log('检测到模型表面交点:', pointToAdd.x.toFixed(2), pointToAdd.y.toFixed(2), pointToAdd.z.toFixed(2));
        }
      }
    }
    
    // 方法3: 如果以上都失败，检测整个场景（确保总能画上线）
    if (!pointToAdd) {
      const sceneIntersects = this.raycaster.intersectObjects(this.scene.children, true);
      if (sceneIntersects.length > 0) {
        pointToAdd = sceneIntersects[0].point;
        console.log('使用场景交点:', pointToAdd.x.toFixed(2), pointToAdd.y.toFixed(2), pointToAdd.z.toFixed(2));
      }
    }
    
    // 方法4: 如果还是没有交点，创建一个基于射线的点（作为最后的后备）
    if (!pointToAdd) {
      // 沿着射线方向创建一个点
      const rayDirection = new THREE.Vector3();
      this.raycaster.ray.direction.normalize();
      rayDirection.copy(this.raycaster.ray.direction);
      pointToAdd = this.raycaster.ray.origin.clone().add(rayDirection.multiplyScalar(10));
      console.log('使用射线方向创建点:', pointToAdd.x.toFixed(2), pointToAdd.y.toFixed(2), pointToAdd.z.toFixed(2));
    }
    
    // 添加点到轨迹
    if (pointToAdd) {
      this.trajectoryPoints.push(pointToAdd.clone());
      this.snappedTrajectoryPoints.push(pointToAdd.clone());
      
      // 查找距离轨迹0.3范围内的点
      this._findNearbyPoints(pointToAdd, 0.3);
      
      // 调用吸附回调
      if (this.snapCallback) {
        this.snapCallback(pointToAdd);
      }
    }
  }

  /**
   * 查找最近的点位
   * @private
   * @param {THREE.Vector2} mouse - 鼠标位置
   * @returns {THREE.Vector3|null} 最近的点或null
   */
  _findClosestPoint(mouse) {
    if (!this.currentModel || !this.pointsData.has(this.currentModel)) return null;

    const pointsData = this.pointsData.get(this.currentModel);
    if (!pointsData || !pointsData.points || pointsData.points.length === 0) return null;

    // 使用射线检测找到最接近视线的点
    this.raycaster.setFromCamera(mouse, this.camera);
    
    let closestPoint = null;
    let minDistance = Infinity;
    
    // 增加距离阈值，使吸附更容易触发
    const distanceThreshold = 2.0; // 从1.0增加到2.0
    
    for (const point of pointsData.points) {
      const distance = this.raycaster.ray.distanceToPoint(point);
      if (distance < minDistance && distance < distanceThreshold) {
        minDistance = distance;
        closestPoint = point;
      }
    }

    // 如果找到最近点，添加日志
    if (closestPoint) {
      console.log(`找到距离射线${minDistance.toFixed(3)}的最近点`);
    }

    return closestPoint;
  }

  /**
   * 查找距离指定点一定范围内的点
   * @private
   * @param {THREE.Vector3} centerPoint - 中心点
   * @param {number} radius - 搜索半径
   */
  _findNearbyPoints(centerPoint, radius) {
    if (!this.currentModel || !this.pointsData.has(this.currentModel)) return;

    const pointsData = this.pointsData.get(this.currentModel);
    if (!pointsData || !pointsData.points || pointsData.points.length === 0) return;

    for (const point of pointsData.points) {
      const distance = centerPoint.distanceTo(point);
      if (distance <= radius) {
        // 检查点是否已经在selectedPoints中
        const isAlreadySelected = this.selectedPoints.some(p => 
          p.x === point.x && p.y === point.y && p.z === point.z
        );
        
        if (!isAlreadySelected) {
          this.selectedPoints.push(point.clone());
        }
      }
    }
  }

  /**
   * 更新轨迹预览
   * @private
   */
  _updateTrajectoryPreview() {
    // 清除现有预览
    this._clearTrajectory();

    if (this.snappedTrajectoryPoints.length < 2) return;

    console.log(`更新轨迹预览，当前点数: ${this.snappedTrajectoryPoints.length}`);
    
    try {
      // 使用CatmullRomCurve3创建平滑曲线
      const curve = new THREE.CatmullRomCurve3(this.snappedTrajectoryPoints, false, 'centripetal', 0.5);
      
      // 根据轨迹长度生成合适数量的点，确保曲线平滑
      const pointsCount = Math.max(32, this.snappedTrajectoryPoints.length * 4);
      const curvePoints = curve.getPoints(pointsCount);
      
      // 增强材质可见性
      const material = new THREE.LineBasicMaterial({
        color: 0xFF0000, // 红色轨迹线
        linewidth: 3,    // 增加线宽
        transparent: false,
        opacity: 1.0
      });
      
      const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
      this.trajectoryLine = new THREE.Line(geometry, material);
      
      // 设置渲染顺序，确保轨迹线显示在最前面
      this.trajectoryLine.renderOrder = 1000;
      
      this.scene.add(this.trajectoryLine);
      console.log('轨迹预览更新成功');
    } catch (error) {
      console.error('更新轨迹预览时出错:', error);
      
      // 出错时使用简单的折线作为后备
      const material = new THREE.LineBasicMaterial({
        color: 0xFF0000,
        linewidth: 3
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(this.snappedTrajectoryPoints);
      this.trajectoryLine = new THREE.Line(geometry, material);
      this.scene.add(this.trajectoryLine);
    }
  }

  /**
   * 完成轨迹绘制
   * @private
   */
  _finalizeTrajectory() {
    if (this.snappedTrajectoryPoints.length < 2) {
      this._clearTrajectory();
      return;
    }

    console.log(`完成轨迹绘制，点数: ${this.snappedTrajectoryPoints.length}`);
    
    try {
      // 使用CatmullRomCurve3创建平滑曲线
      const curve = new THREE.CatmullRomCurve3(this.snappedTrajectoryPoints, false, 'centripetal', 0.5);
      
      // 根据轨迹长度生成合适数量的点，确保曲线平滑
      const pointsCount = Math.max(64, this.snappedTrajectoryPoints.length * 8);
      const curvePoints = curve.getPoints(pointsCount);
      
      // 增强材质可见性
      const material = new THREE.LineBasicMaterial({
        color: 0xFF0000,
        linewidth: 3,  // 增加线宽
        transparent: false,
        opacity: 1.0
      });
      
      const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
      this.lineObject = new THREE.Line(geometry, material);
      
      // 设置渲染顺序，确保轨迹线显示在最前面
      this.lineObject.renderOrder = 1000;
      this.lineObject.name = `${this.currentModel}_trajectory`;
      
      this.scene.add(this.lineObject);
      console.log('曲线轨迹创建成功');
    } catch (error) {
      console.error('创建平滑曲线时出错:', error);
      
      // 出错时使用简单的折线作为后备
      const material = new THREE.LineBasicMaterial({
        color: 0xFF0000,
        linewidth: 3
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(this.snappedTrajectoryPoints);
      this.lineObject = new THREE.Line(geometry, material);
      this.lineObject.name = `${this.currentModel}_trajectory`;
      this.scene.add(this.lineObject);
    }

    // 清除预览
    this._clearTrajectory();

    console.log(`轨迹绘制完成：${this.snappedTrajectoryPoints.length}个点，选中${this.selectedPoints.length}个点`);
  }

  /**
   * 清除轨迹预览
   * @private
   */
  _clearTrajectory() {
    if (this.trajectoryLine) {
      this.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      this.trajectoryLine.material.dispose();
      this.trajectoryLine = null;
    }
  }

  /**
   * 清除轨迹
   */
  clearLine() {
    if (this.lineObject) {
      this.scene.remove(this.lineObject);
      this.lineObject.geometry.dispose();
      this.lineObject.material.dispose();
      this.lineObject = null;
    }

    this.trajectoryPoints = [];
    this.snappedTrajectoryPoints = [];
    this.selectedPoints = [];
  }

  /**
   * 清除指定器官的PLY数据
   * @private
   * @param {string} organName - 器官名称
   */
  _clearOrganData(organName) {
    // 清除点位对象
    if (this.pointsObjects.has(organName)) {
      const pointsObject = this.pointsObjects.get(organName);
      this.scene.remove(pointsObject);
      pointsObject.geometry.dispose();
      pointsObject.material.dispose();
      this.pointsObjects.delete(organName);
    }

    // 清除法向量对象
    if (this.vectorsObjects.has(organName)) {
      const vectorsObject = this.vectorsObjects.get(organName);
      this.scene.remove(vectorsObject);
      vectorsObject.children.forEach(child => {
        child.geometry.dispose();
        child.material.dispose();
      });
      this.vectorsObjects.delete(organName);
    }

    // 清除点位数据
    if (this.pointsData.has(organName)) {
      this.pointsData.delete(organName);
    }

    // 清除法向量可见性状态
    if (this._normalsVisibility && this._normalsVisibility.has(organName)) {
      this._normalsVisibility.delete(organName);
    }
  }

  /**
   * 清除所有PLY数据
   */
  clearAllPlyData() {
    // 清除所有点位对象
    this.pointsObjects.forEach((object, organName) => {
      this.scene.remove(object);
      object.geometry.dispose();
      object.material.dispose();
    });
    this.pointsObjects.clear();

    // 清除所有法向量对象
    this.vectorsObjects.forEach((object, organName) => {
      this.scene.remove(object);
      object.children.forEach(child => {
        child.geometry.dispose();
        child.material.dispose();
      });
    });
    this.vectorsObjects.clear();

    // 清除所有点位数据
    this.pointsData.clear();
    
    // 清除法向量可见性状态
    if (this._normalsVisibility) {
      this._normalsVisibility.clear();
    }

    // 清除轨迹
    this.clearLine();
    this.drawnCurves = [];

    // 如果正在绘制，停止绘制
    if (this.isDrawing) {
      this._stopDrawing();
    }
  }

  /**
   * 检查是否有指定器官的PLY数据
   * @param {string} organName - 器官名称
   * @returns {boolean} 是否存在
   */
  hasPlyData(organName) {
    return this.pointsData.has(organName) && 
           this.pointsData.get(organName) && 
           this.pointsData.get(organName).points && 
           this.pointsData.get(organName).points.length > 0;
  }

  /**
   * 切换法向量显示状态
   * @param {string} organName - 器官名称
   * @returns {boolean} 切换后的状态
   */
  toggleNormalsVisibility(organName) {
    if (!this._initialized || !this._normalsVisibility) {
      return false;
    }

    const currentState = this._normalsVisibility.get(organName) || false;
    const vectorsObject = this.vectorsObjects.get(organName);

    if (vectorsObject) {
      vectorsObject.visible = !currentState;
      this._normalsVisibility.set(organName, !currentState);
      this.renderer.render(this.scene, this.camera);
      return !currentState;
    }

    return currentState;
  }

  /**
   * 检查是否有选中的点位
   * @returns {boolean} 是否有选中的点位
   */
  hasSelectedPoints() {
    return this.selectedPoints.length > 0;
  }

  /**
   * 启用吸附到最近点
   * @param {Function} callback - 吸附回调函数
   */
  enableSnapToClosestPoint(callback) {
    this.snapEnabled = true;
    this.snapCallback = callback;
  }

  /**
   * 禁用吸附到最近点
   */
  disableSnapToClosestPoint() {
    this.snapEnabled = false;
    this.snapCallback = null;
  }

  /**
   * 获取当前绘制状态
   * @returns {boolean} 是否正在绘制
   */
  getDrawingState() {
    return this.isDrawing;
  }

  /**
   * 停止绘制
   */
  stopDrawing() {
    if (this.isDrawing) {
      this._stopDrawing();
    }
  }

  /**
   * 销毁PlyRenderer实例
   */
  destroy() {
    // 停止绘制模式
    if (this.isDrawing) {
      this._stopDrawing();
    }

    // 清除所有PLY数据
    this.clearAllPlyData();

    // 解绑事件处理函数
    this._unbindEventHandlers();

    // 重置状态
    this._initialized = false;
    this.modelRenderer = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    console.log('PlyRenderer已销毁');
  }
}

export default PlyRenderer;