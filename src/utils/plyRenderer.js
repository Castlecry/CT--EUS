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
      // 节流控制变量
      this.lastAddPointTime = null;
      this.lastUpdatePreviewTime = null;

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

      // 调用API获取PLY数据，getOrganPlyModel函数现在已经封装了batchId参数
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
        points: [...this.snappedTrajectoryPoints]
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
    
    // 添加节流逻辑，限制点的添加频率
    const now = Date.now();
    if (!this.lastAddPointTime || now - this.lastAddPointTime > 50) { // 每50ms最多添加一个点
      this._addPointAtMouse(event);
      this.lastAddPointTime = now;
    }
    
    // 限制预览更新频率
    if (!this.lastUpdatePreviewTime || now - this.lastUpdatePreviewTime > 100) { // 每100ms最多更新一次预览
      this._updateTrajectoryPreview();
      this.lastUpdatePreviewTime = now;
    }
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
    
    // 优化：限制检查的点数，当点数过多时只检查部分点
    const points = pointsData.points;
    const maxCheckPoints = 1000; // 最多检查1000个点
    const checkEveryNth = points.length > maxCheckPoints ? Math.ceil(points.length / maxCheckPoints) : 1;
    
    for (let i = 0; i < points.length; i += checkEveryNth) {
      const point = points[i];
      const distance = this.raycaster.ray.distanceToPoint(point);
      if (distance < minDistance && distance < distanceThreshold) {
        minDistance = distance;
        closestPoint = point;
      }
    }

    // 移除频繁的日志输出，减少性能开销
    // 仅在调试时使用：if (closestPoint) console.log(`找到距离射线${minDistance.toFixed(3)}的最近点`);

    return closestPoint;
  }

  // 删除近距离点计算功能，以提高性能

  // 删除旧方法的注释

  /**
   * 优化轨迹点，确保它们位于模型表面
   * @private
   * @param {Array<THREE.Vector3>} points - 用户绘制的原始点
   * @returns {Array<THREE.Vector3>} 优化后的表面轨迹点
   */
  _optimizeTrajectoryForSurface(points) {
    if (!points || points.length === 0) return [];
    
    const optimizedPoints = [];
    
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const optimizedPoint = this._projectPointToSurface(point);
      
      if (optimizedPoint) {
        optimizedPoints.push(optimizedPoint);
      } else {
        // 如果无法优化，则使用原始点
        optimizedPoints.push(point.clone());
      }
    }
    
    return optimizedPoints;
  }
  
  /**
   * 将点投影到模型表面
   * @private
   * @param {THREE.Vector3} point - 要投影的点
   * @returns {THREE.Vector3|null} 投影到表面的点或null
   */
  _projectPointToSurface(point) {
    // 创建从摄像机位置指向该点的射线
    const cameraPos = this.camera.position.clone();
    const direction = new THREE.Vector3().subVectors(point, cameraPos).normalize();
    
    // 设置射线
    this.raycaster.set(cameraPos, direction);
    
    // 射线检测所有可见的模型
    const intersects = this.raycaster.intersectObjects(this.scene.children, true).filter(
      intersect => intersect.object.userData.isOrganModel || 
                   (this.modelRenderer && this.modelRenderer.models && this.currentModel && 
                    this.modelRenderer.models.get(this.currentModel) === intersect.object)
    );
    
    if (intersects.length > 0) {
      // 找到距离摄像机最近的交点（外表面）
      const closestIntersect = intersects.reduce((closest, current) => 
        current.distance < closest.distance ? current : closest
      );
      
      return closestIntersect.point;
    }
    
    return null;
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
      // 简化实现：直接使用用户触碰的所有点连接成线用于预览
      const material = new THREE.LineBasicMaterial({
        color: 0x00FF00, // 绿色预览线
        linewidth: 2,
        transparent: true,
        opacity: 0.7
      });
      
      // 直接使用所有用户触碰的点，确保每两个相邻点都正确连接
      const geometry = new THREE.BufferGeometry().setFromPoints(this.snappedTrajectoryPoints);
      this.trajectoryLine = new THREE.Line(geometry, material);
      
      // 设置渲染顺序，确保预览线显示在最前面
      this.trajectoryLine.renderOrder = 999;
      
      this.scene.add(this.trajectoryLine);
      console.log('轨迹预览更新成功，直接使用用户触碰点');
      console.log(`轨迹预览更新成功，已连接 ${this.snappedTrajectoryPoints.length - 1} 条线段`);
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
      console.log(`使用原始轨迹点作为后备，已连接 ${this.snappedTrajectoryPoints.length - 1} 条线段`);
    }
  }
  
  /**
   * 生成完全贴合在模型外表面的轨迹点
   * @private
   */
  _generateSurfaceTrajectory(controlPoints) {
    const interpolatedPoints = [];
    
    // 在每两个控制点之间插入额外的中间点，并确保它们都在表面上
    for (let i = 0; i < controlPoints.length - 1; i++) {
      const startPoint = controlPoints[i];
      const endPoint = controlPoints[i + 1];
      
      // 在两点之间创建一条线段，增加足够的中间点
      const segmentPoints = this._createSurfaceSegment(startPoint, endPoint, 20);
      
      // 添加线段点（第一个点只在第一次添加）
      if (i === 0) {
        interpolatedPoints.push(segmentPoints[0]);
      }
      
      // 添加中间点和终点
      for (let j = 1; j < segmentPoints.length; j++) {
        interpolatedPoints.push(segmentPoints[j]);
      }
    }
    
    return interpolatedPoints;
  }
  
  /**
   * 创建完全贴合在模型外表面的线段
   * @private
   */
  _createSurfaceSegment(startPoint, endPoint, numSteps) {
    const segmentPoints = [startPoint.clone()];
    const direction = new THREE.Vector3().subVectors(endPoint, startPoint).normalize();
    const distance = startPoint.distanceTo(endPoint);
    const stepDistance = distance / numSteps;
    
    // 从起点到终点逐步移动，确保每个中间点都在表面上
    let currentPosition = startPoint.clone();
    for (let i = 1; i < numSteps; i++) {
      // 计算下一个理论位置
      const nextPosition = currentPosition.clone().add(direction.clone().multiplyScalar(stepDistance));
      
      // 从摄像机向该理论位置投射射线，找到最近的外表面交点
      const surfacePoint = this._projectPointToSurface(nextPosition);
      
      if (surfacePoint) {
        segmentPoints.push(surfacePoint);
        // 更新当前位置为找到的表面点
        currentPosition.copy(surfacePoint);
      }
    }
    
    // 添加终点
    segmentPoints.push(endPoint.clone());
    
    return segmentPoints;
  }

  /**
   * 计算点到线段的最短距离
   * @private
   * @param {THREE.Vector3} point - 要测量的点
   * @param {THREE.Vector3} lineStart - 线段起点
   * @param {THREE.Vector3} lineEnd - 线段终点
   * @returns {number} 点到线段的最短距离
   */
  _pointToLineDistance(point, lineStart, lineEnd) {
    // 计算线段向量
    const lineVector = new THREE.Vector3().subVectors(lineEnd, lineStart);
    // 计算点到线段起点的向量
    const pointVector = new THREE.Vector3().subVectors(point, lineStart);
    // 计算线段长度的平方
    const lineLengthSquared = lineVector.lengthSq();
    
    // 如果线段长度为0，直接返回点到线段起点的距离
    if (lineLengthSquared === 0) {
      return point.distanceTo(lineStart);
    }
    
    // 计算投影系数
    const t = Math.max(0, Math.min(1, pointVector.dot(lineVector) / lineLengthSquared));
    // 计算投影点
    const projection = new THREE.Vector3().copy(lineStart).add(lineVector.multiplyScalar(t));
    // 返回点到投影点的距离
    return point.distanceTo(projection);
  }

  /**
   * 收集距离轨迹线段很近的点
   * @private
   * @param {Array<THREE.Vector3>} trajectoryPoints - 轨迹点数组
   * @param {number} distanceThreshold - 距离阈值
   * @returns {Array<THREE.Vector3>} 收集到的靠近线段的点
   */
  _collectPointsNearSegments(trajectoryPoints, distanceThreshold = 0.5) {
    const collectedPoints = [];
    
    // 确保有当前模型的点数据
    if (!this.currentModel || !this.pointsData.has(this.currentModel)) {
      return collectedPoints;
    }
    
    const modelPoints = this.pointsData.get(this.currentModel).points;
    if (!modelPoints || modelPoints.length === 0) {
      return collectedPoints;
    }
    
    // 性能优化：限制检查的点数
    const maxCheckPoints = 2000;
    const checkEveryNth = modelPoints.length > maxCheckPoints ? 
      Math.ceil(modelPoints.length / maxCheckPoints) : 1;
    
    // 遍历轨迹线段
    for (let i = 0; i < trajectoryPoints.length - 1; i++) {
      const startPoint = trajectoryPoints[i];
      const endPoint = trajectoryPoints[i + 1];
      
      // 遍历模型点
      for (let j = 0; j < modelPoints.length; j += checkEveryNth) {
        const modelPoint = modelPoints[j];
        // 计算点到线段的距离
        const distance = this._pointToLineDistance(modelPoint, startPoint, endPoint);
        
        // 如果距离小于阈值，添加到收集的点中
        if (distance < distanceThreshold) {
          collectedPoints.push(modelPoint.clone());
        }
      }
    }
    
    return collectedPoints;
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

    // 移除频繁的日志输出，减少性能开销
    // console.log(`完成轨迹绘制，点数: ${this.snappedTrajectoryPoints.length}`);
    
    try {
      // 简化实现：直接使用用户触碰的所有点连接成线
      const material = new THREE.LineBasicMaterial({
        color: 0xFF0000,
        linewidth: 3,  // 增加线宽
        transparent: false,
        opacity: 1.0
      });
      
      const geometry = new THREE.BufferGeometry().setFromPoints(this.snappedTrajectoryPoints);
      this.lineObject = new THREE.Line(geometry, material);
      
      // 设置渲染顺序，确保轨迹线显示在最前面
      this.lineObject.renderOrder = 1000;
      this.lineObject.name = `${this.currentModel}_trajectory`;
      
      // 记录轨迹点信息
      this.lineObject.trajectoryPoints = [...this.snappedTrajectoryPoints];
      
      // 收集距离轨迹线段很近的点
      const nearbyPoints = this._collectPointsNearSegments(this.snappedTrajectoryPoints, 0.5);
      
      // 更新selectedPoints，包含轨迹点和靠近线段的点
      this.selectedPoints = [...this.snappedTrajectoryPoints, ...nearbyPoints];
      
      this.scene.add(this.lineObject);
      
      // 可选：添加调试信息
      console.log(`轨迹创建成功，收集了${nearbyPoints.length}个靠近线段的点`);
      // 移除频繁的日志输出，减少性能开销
      // console.log('轨迹创建成功');
    } catch (error) {
      console.error('创建轨迹时出错:', error);
      
      // 出错时使用简单的折线作为后备
      const material = new THREE.LineBasicMaterial({
        color: 0xFF0000,
        linewidth: 3
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(this.snappedTrajectoryPoints);
      this.lineObject = new THREE.Line(geometry, material);
      this.lineObject.name = `${this.currentModel}_trajectory`;
      
      // 记录轨迹点信息
      this.lineObject.trajectoryPoints = [...this.snappedTrajectoryPoints];
      
      // 收集距离轨迹线段很近的点
      const nearbyPoints = this._collectPointsNearSegments(this.snappedTrajectoryPoints, 0.5);
      
      // 更新selectedPoints，包含轨迹点和靠近线段的点
      this.selectedPoints = [...this.snappedTrajectoryPoints, ...nearbyPoints];
      
      this.scene.add(this.lineObject);
      
      // 可选：添加调试信息
      console.log(`使用后备方案，收集了${nearbyPoints.length}个靠近线段的点`);
    }

    // 清除预览
    this._clearTrajectory();

    // 移除频繁的日志输出，减少性能开销
    // console.log(`轨迹绘制完成：${this.snappedTrajectoryPoints.length}个点，选中${this.selectedPoints.length}个点`);
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
    // 确保selectedPoints也被清空
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
    
    // 清除轨迹，确保清除模型后轨迹也被清除
    this.clearLine();
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
      console.log(`${organName}法向量显示状态: ${!currentState}`);
      return !currentState;
    }

    return currentState;
  }

  /**
   * 获取最近绘制轨迹的点
   */
  getCurrentTrajectoryPoints() {
    return this.lineObject ? this.lineObject.trajectoryPoints || [] : [];
  }

  /**
   * 检查是否有选中的点
   * @returns {boolean} 是否有选中的点
   */
  hasSelectedPoints() {
    return this.getCurrentTrajectoryPoints().length > 0;
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