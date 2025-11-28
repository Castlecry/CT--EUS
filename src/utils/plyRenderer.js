import * as THREE from 'three';
import PlyHistoryManager from './plyHistory';

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
    
    // 轨迹历史记录管理器
    this.trajectoryHistory = new PlyHistoryManager();
    
    // 校准轨迹相关
    this.calibrationTrajectories = new Map(); // 存储校准轨迹
    this.currentCalibrationTrajectory = null; // 当前显示的校准轨迹
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
   * 添加轨迹面（目标点+四个面点）
   * @param {Object} targetPoint - 目标点坐标 {x, y, z}
   * @param {Array<Object>} facePoints - 四个面点坐标数组 [{x, y, z}, ...]
   * @param {number} color - 颜色值（十六进制）
   * @returns {boolean} 添加是否成功
   */
  addTrajectoryFace(targetPoint, facePoints, color = 0xff0000) {
    try {
      // 验证参数
      if (!targetPoint || !facePoints || facePoints.length !== 4) {
        console.error('addTrajectoryFace: 无效的参数');
        return false;
      }
      
      // 确保轨迹面集合存在
      if (!this.trajectoryFaces) {
        this.trajectoryFaces = new Map();
      }
      
      // 生成唯一ID
      const faceId = `trajectory_face_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 创建组来容纳目标点和面
      const faceGroup = new THREE.Group();
      faceGroup.name = faceId;
      
      // 1. 绘制目标点（使用红色大点标识）
      const targetGeometry = new THREE.BufferGeometry();
      const targetPositions = new Float32Array([targetPoint.x, targetPoint.y, targetPoint.z]);
      targetGeometry.setAttribute('position', new THREE.BufferAttribute(targetPositions, 3));
      
      const targetMaterial = new THREE.PointsMaterial({
        color: 0xff0000,  // 红色
        size: 2.0,        // 更大的点大小
        sizeAttenuation: true
      });
      
      const targetPointObject = new THREE.Points(targetGeometry, targetMaterial);
      targetPointObject.name = `${faceId}_target`;
      faceGroup.add(targetPointObject);
      
      // 2. 绘制四个面点（使用指定颜色的中等大小点）
      const facePointsGeometry = new THREE.BufferGeometry();
      const facePointsPositions = new Float32Array(4 * 3);
      
      for (let i = 0; i < 4; i++) {
        facePointsPositions[i * 3] = facePoints[i].x;
        facePointsPositions[i * 3 + 1] = facePoints[i].y;
        facePointsPositions[i * 3 + 2] = facePoints[i].z;
      }
      
      facePointsGeometry.setAttribute('position', new THREE.BufferAttribute(facePointsPositions, 3));
      
      const facePointsMaterial = new THREE.PointsMaterial({
        color: color,
        size: 1.0,
        sizeAttenuation: true
      });
      
      const facePointsObject = new THREE.Points(facePointsGeometry, facePointsMaterial);
      facePointsObject.name = `${faceId}_points`;
      faceGroup.add(facePointsObject);
      
      // 3. 连接四个面点形成四边形 - 按照用户要求，只连接四个面点形成面
      const faceGeometry = new THREE.BufferGeometry();
      const faceVertices = new Float32Array([
        facePoints[0].x, facePoints[0].y, facePoints[0].z,
        facePoints[1].x, facePoints[1].y, facePoints[1].z,
        facePoints[2].x, facePoints[2].y, facePoints[2].z,
        facePoints[3].x, facePoints[3].y, facePoints[3].z
      ]);
      
      // 使用两个三角形组成四边形
      const faceIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);
      
      faceGeometry.setAttribute('position', new THREE.BufferAttribute(faceVertices, 3));
      faceGeometry.setIndex(new THREE.BufferAttribute(faceIndices, 1));
      
      // 计算法线
      faceGeometry.computeVertexNormals();
      
      // 创建半透明材质
      const faceMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      });
      
      const faceMesh = new THREE.Mesh(faceGeometry, faceMaterial);
      faceMesh.name = `${faceId}_face`;
      faceGroup.add(faceMesh);
      
      // 注意：按照用户要求，不再连接目标点到四个面点
      
      // 添加到场景
      this.scene.add(faceGroup);
      
      // 保存到轨迹面集合
      this.trajectoryFaces.set(faceId, faceGroup);
      
      console.log(`成功添加轨迹面 ${faceId}，包含目标点和4个面点形成的四边形面`);
      return true;
    } catch (error) {
      console.error('添加轨迹面失败:', error);
      return false;
    }
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
      // 设置当前模型，用于轨迹历史记录
      this.trajectoryHistory.setCurrentModel(organName);
      
      // 如果当前不在绘制模式，进入绘制模式
      if (!this.isDrawing) {
        // 先清除当前显示的轨迹（如果有）
        this.clearLine();
        // 隐藏历史轨迹
        this.trajectoryHistory.hideCurrentTrajectory(this.scene);
        
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

    // 清理吸附设置，但保留点位数据供其他功能使用
    this.snapEnabled = false;
    this.snapCallback = null;
    
    console.log('绘制模式已退出，点位数据保持可用');
  }

  /**
   * 鼠标按下事件处理
   * @private
   * @param {MouseEvent} event - 鼠标事件
   */
  _onMouseDown(event) {
    // 对于点2CT模式，检查snapEnabled而不仅是isDrawing
    if (!this.isDrawing && !this.snapEnabled) return;

    // 点2CT模式下的点击处理
    if (this.snapEnabled && !this.isDrawing) {
      this._updateMousePosition(event);
      
      // 检查是否有当前吸附的点
      if (this.currentClosestPoint && this.currentPointNormal) {
        // 获取摄像机前方方向，进行与_checkAndHighlightClosestPoint相同的验证
        const cameraForward = new THREE.Vector3();
        this.camera.getWorldDirection(cameraForward);
        
        // 验证吸附点是否在摄像机可见方向
        const directionToPoint = new THREE.Vector3().subVectors(this.currentClosestPoint, this.camera.position).normalize();
        const dotProduct = directionToPoint.dot(this.raycaster.ray.direction);
        const forwardDot = directionToPoint.dot(cameraForward);
        
        // 严格检查：点必须在摄像机前方且与射线方向高度一致
        if (dotProduct > 0.95 && forwardDot > 0 && this.snapCallback) {
          // 使用coordinate属性名，与handlePointClick函数的期望格式匹配
          this.snapCallback({
            coordinate: this.currentClosestPoint,
            normal: this.currentPointNormal
          });
        }
      } else {
        // 如果没有吸附到点，尝试重新查找最近点
        const closestPointInfo = this._findClosestPoint(this.mouse);
        if (closestPointInfo && closestPointInfo.coordinate && this.snapCallback) {
          // 获取摄像机前方方向
          const cameraForward = new THREE.Vector3();
          this.camera.getWorldDirection(cameraForward);
          
          // 验证吸附点是否在摄像机可见方向
          const directionToPoint = new THREE.Vector3().subVectors(closestPointInfo.coordinate, this.camera.position).normalize();
          const dotProduct = directionToPoint.dot(this.raycaster.ray.direction);
          const forwardDot = directionToPoint.dot(cameraForward);
          
          if (dotProduct > 0.95 && forwardDot > 0) {
            // 使用coordinate属性名，与handlePointClick函数的期望格式匹配
            this.snapCallback({
              coordinate: closestPointInfo.coordinate,
              normal: closestPointInfo.normal
            });
          }
        }
      }
      return;
    }

    // 绘制模式下的处理
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
    this._updateMousePosition(event);
    
    // 对于点2CT模式，只在snapEnabled为true时执行吸附逻辑
    if (this.snapEnabled && !this.isDrawing) {
      const now = Date.now();
      // 添加节流逻辑，限制点的检查频率
      if (!this.lastSnapCheckTime || now - this.lastSnapCheckTime > 50) { // 每50ms最多检查一次
        this._checkAndHighlightClosestPoint();
        this.lastSnapCheckTime = now;
      }
      return;
    }
    
    // 绘制模式下的逻辑
    if (!this.isDrawing || !this.isDragging) return;

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
   * 检查并高亮显示最近的点（用于点2CT模式）
   * @private
   */
  _checkAndHighlightClosestPoint() {
    if (!this.snapEnabled || !this.currentModel || !this.pointsData.has(this.currentModel)) return;
    
    const closestPointInfo = this._findClosestPoint(this.mouse);
    if (closestPointInfo && closestPointInfo.coordinate) {
      // 获取摄像机前方方向
      const cameraForward = new THREE.Vector3();
      this.camera.getWorldDirection(cameraForward);
      
      // 验证吸附点是否在摄像机可见方向
      const directionToPoint = new THREE.Vector3().subVectors(closestPointInfo.coordinate, this.camera.position).normalize();
      const dotProduct = directionToPoint.dot(this.raycaster.ray.direction);
      const forwardDot = directionToPoint.dot(cameraForward);
      
      // 严格检查：点必须在摄像机前方（与摄像机朝向夹角小于90度）且与射线方向高度一致
      if (dotProduct > 0.95 && forwardDot > 0) {
        // 高亮显示最近的点
        this.highlightPoint(closestPointInfo.coordinate);
        // 保存当前最近点信息
        this.currentClosestPoint = closestPointInfo.coordinate;
        this.currentPointNormal = closestPointInfo.normal;
        return;
      }
    }
    
    // 如果没有找到合适的点，清除高亮
    if (this.currentClosestPoint) {
      this.highlightPoint(null);
      this.currentClosestPoint = null;
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
    
    // 获取摄像机前方方向
    const cameraForward = new THREE.Vector3();
    this.camera.getWorldDirection(cameraForward);
    
    // 方法1: 尝试吸附到最近的点位
    if (this.snapEnabled && this.currentModel && this.pointsData.has(this.currentModel)) {
      const closestPointInfo = this._findClosestPoint(this.mouse);
      if (closestPointInfo && closestPointInfo.coordinate) {
        // 验证吸附点是否在摄像机可见方向
        const directionToPoint = new THREE.Vector3().subVectors(closestPointInfo.coordinate, this.camera.position).normalize();
        const dotProduct = directionToPoint.dot(this.raycaster.ray.direction);
        const forwardDot = directionToPoint.dot(cameraForward);
        
        // 严格检查：点必须在摄像机前方（与摄像机朝向夹角小于90度）且与射线方向高度一致
        if (dotProduct > 0.95 && forwardDot > 0) {
          pointToAdd = closestPointInfo.coordinate;
          // 保存点的法向量信息
          this.currentPointNormal = closestPointInfo.normal;
          console.log('吸附到最近点:', pointToAdd.x.toFixed(2), pointToAdd.y.toFixed(2), pointToAdd.z.toFixed(2));
        }
      }
    }
    
    // 方法2: 如果没有吸附点，尝试检测模型表面
    if (!pointToAdd && this.modelRenderer && this.modelRenderer.models && this.currentModel) {
      const model = this.modelRenderer.models.get(this.currentModel);
      if (model) {
        // 只保留在摄像机前方的交点
        const modelIntersects = this.raycaster.intersectObject(model, true).filter(intersect => {
          // 计算交点是否在摄像机前方
          const directionToPoint = new THREE.Vector3().subVectors(intersect.point, this.camera.position).normalize();
          return directionToPoint.dot(cameraForward) > 0;
        });
        
        if (modelIntersects.length > 0) {
          // 只选择距离摄像机最近的交点（确保是可见表面）
          pointToAdd = modelIntersects.reduce((closest, current) => 
            current.distance < closest.distance ? current : closest
          ).point;
          console.log('检测到模型表面交点(可见面):', pointToAdd.x.toFixed(2), pointToAdd.y.toFixed(2), pointToAdd.z.toFixed(2));
        }
      }
    }
    
    // 方法3: 如果以上都失败，检测整个场景 - 但只考虑可见物体
    if (!pointToAdd) {
      // 只保留在摄像机前方的交点
      const sceneIntersects = this.raycaster.intersectObjects(this.scene.children, true).filter(intersect => {
        // 检查交点是否在摄像机前方
        const directionToPoint = new THREE.Vector3().subVectors(intersect.point, this.camera.position).normalize();
        return directionToPoint.dot(cameraForward) > 0;
      });
      
      if (sceneIntersects.length > 0) {
        // 只选择距离摄像机最近的交点
        pointToAdd = sceneIntersects.reduce((closest, current) => 
          current.distance < closest.distance ? current : closest
        ).point;
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
    
    // 添加点到轨迹前，确保点在摄像机前方和视角可见范围内
    if (pointToAdd) {
      // 计算点是否在摄像机前方且在合理的视角范围内
      const directionToPoint = new THREE.Vector3().subVectors(pointToAdd, this.camera.position).normalize();
      const forwardDot = directionToPoint.dot(cameraForward);
      
      // 严格检查：点必须在摄像机前方（点积为正）且在合理视角范围内
      // 这样可以确保只捕获用户实际能看到的点
      if (forwardDot > 0) {
        this.trajectoryPoints.push(pointToAdd.clone());
        this.snappedTrajectoryPoints.push(pointToAdd.clone());
        
        // 调用吸附回调，传递包含坐标和法向量的完整对象
        if (this.snapCallback) {
          this.snapCallback({
            coordinate: pointToAdd,
            normal: this.currentPointNormal || new THREE.Vector3(0, 1, 0) // 如果没有法向量，使用默认值
          });
        }
      } else {
        console.log('忽略摄像机背面或视角不可见的点');
      }
    }
  }

  /**
   * 查找最近的点位
   * @private
   * @param {THREE.Vector2} mouse - 鼠标位置
   * @returns {Object|null} 包含点坐标和法向量的对象
   */
  _findClosestPoint(mouse) {
    if (!this.currentModel || !this.pointsData.has(this.currentModel)) return null;

    const pointsData = this.pointsData.get(this.currentModel);
    if (!pointsData || !pointsData.points || pointsData.points.length === 0) return null;

    // 使用射线检测找到最接近视线的点
    this.raycaster.setFromCamera(mouse, this.camera);
    
    let closestPoint = null;
    let closestNormal = null;
    let minDistance = Infinity;
    
    // 使用设置的吸附阈值或默认值
    const distanceThreshold = this.snapThreshold || 15.0; // 默认为15.0，使吸附更容易触发
    
    // 优化：限制检查的点数，当点数过多时只检查部分点
    const points = pointsData.points;
    const normals = pointsData.normals || [];
    const maxCheckPoints = 1000; // 最多检查1000个点
    const checkEveryNth = points.length > maxCheckPoints ? Math.ceil(points.length / maxCheckPoints) : 1;
    
    for (let i = 0; i < points.length; i += checkEveryNth) {
      const point = points[i];
      const distance = this.raycaster.ray.distanceToPoint(point);
      if (distance < minDistance && distance < distanceThreshold) {
        minDistance = distance;
        closestPoint = point;
        // 同时获取对应的法向量
        if (normals[i]) {
          closestNormal = normals[i];
        }
      }
    }

    // 移除频繁的日志输出，减少性能开销
    // 仅在调试时使用：if (closestPoint) console.log(`找到距离射线${minDistance.toFixed(3)}的最近点`);

    // 返回包含点坐标和法向量的对象
    if (closestPoint) {
      return {
        coordinate: closestPoint,
        normal: closestNormal || new THREE.Vector3(0, 1, 0) // 如果没有法向量，返回默认值
      };
    }
    return null;
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
      // 只考虑距离摄像机最近的交点（确保是可见的外表面）
      // 这可以防止射线穿过模型捕捉到背面的点
      const closestIntersect = intersects.reduce((closest, current) => 
        current.distance < closest.distance ? current : closest
      );
      
      // 额外验证：确保交点在摄像机前方
      const cameraForward = new THREE.Vector3();
      this.camera.getWorldDirection(cameraForward);
      const directionToPoint = new THREE.Vector3().subVectors(closestIntersect.point, this.camera.position).normalize();
      const dotProduct = directionToPoint.dot(cameraForward);
      
      // 如果点在摄像机前方（点积为正）
      if (dotProduct > 0) {
        return closestIntersect.point;
      }
      
      console.log('忽略摄像机背面的投影点');
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
      
      // 将当前轨迹添加到历史记录
      this.trajectoryHistory.setCurrentModel(this.currentModel);
      this.trajectoryHistory.addTrajectory([...this.snappedTrajectoryPoints], this.scene);
      
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
      
      // 将当前轨迹添加到历史记录
      this.trajectoryHistory.setCurrentModel(this.currentModel);
      this.trajectoryHistory.addTrajectory([...this.snappedTrajectoryPoints], this.scene);
      
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
   * 显示校准轨迹，连接所有轨迹点并为每个点渲染正方形面
   * @param {Array|string} trajectoryData - 轨迹数据，可以是包含多个轨迹点和正方形面的数组，或者单个PLY文件的URL
   * @param {Object} options - 配置选项
   * @param {number} options.color - 轨迹颜色
   * @param {number} options.faceColor - 正方形面颜色
   */
  async showCalibrationTrajectory(trajectoryData, options = {}) {
    // 支持处理后端返回的JSON格式数据：[{"base64": "base64编码的ply文件内容"}, ...]
    // 每个PLY文件包含1个轨迹点和4个正方形面顶点
    console.log('showCalibrationTrajectory方法被调用:', { trajectoryData: Array.isArray(trajectoryData) ? trajectoryData.length + '个元素' : trajectoryData, options });
    
    // 先隐藏当前校准轨迹
    this.hideCalibrationTrajectory();
    
    try {
      // 存储轨迹点和正方形面
      const allTrajectoryPoints = [];
      const facePointsGroups = [];
      
      // 处理不同类型的输入数据
      if (typeof trajectoryData === 'string') {
        // 如果是单个URL，假设是包含多个点的PLY文件
        const response = await fetch(trajectoryData);
        const text = await response.text();
        
        // 解析PLY文件中的点坐标
        const points = this._parsePlyPoints(text);
        console.log('解析到的校准轨迹点数量:', points.length);
        
        // 按照用户描述的逻辑处理：每5个点一组，第一个是轨迹点，后4个是正方形面
        for (let i = 0; i < points.length; i += 5) {
          if (i + 4 < points.length) {
            allTrajectoryPoints.push(points[i]); // 轨迹点
            facePointsGroups.push([points[i+1], points[i+2], points[i+3], points[i+4]]); // 正方形面的四个点
          }
        }
      } else if (Array.isArray(trajectoryData)) {
        console.log(`处理包含${trajectoryData.length}个元素的轨迹数据数组`);
        // 如果是轨迹点数组，直接处理每个点
        for (let index = 0; index < trajectoryData.length; index++) {
          const pointData = trajectoryData[index];
          if (pointData.dataUrl) {
            // 如果包含dataUrl，获取并解析该URL
            try {
              console.log(`处理第${index + 1}个轨迹数据项（包含dataUrl）`);
              const response = await fetch(pointData.dataUrl);
              const text = await response.text();
              const points = this._parsePlyPoints(text);
              
              console.log(`解析到的点数量: ${points.length}`);
              
              // 提取轨迹点（第一个点）和正方形面（后四个点）
              if (points.length >= 5) {
                allTrajectoryPoints.push(points[0]);
                facePointsGroups.push([points[1], points[2], points[3], points[4]]);
                console.log(`成功添加轨迹点和正方形面，累计: ${allTrajectoryPoints.length}`);
              } else if (points.length > 0) {
                console.warn(`点数量不足，期望5个点，实际${points.length}个点`);
              }
            } catch (itemError) {
              console.error(`处理第${index + 1}个轨迹数据项时出错:`, itemError);
              // 继续处理下一个数据，不中断整个流程
            }
          } else if (pointData.targetPoint && pointData.facePoints) {
            // 如果直接包含targetPoint和facePoints
            allTrajectoryPoints.push(pointData.targetPoint);
            facePointsGroups.push(pointData.facePoints);
          } else if (pointData.base64) {
            // 直接处理base64数据（后端返回格式）
            try {
              console.log(`处理第${index + 1}个轨迹数据项（包含base64）`);
              // 解码base64数据
              const binaryString = atob(pointData.base64);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              // 创建Blob并转换为文本
              const blob = new Blob([bytes], { type: 'text/plain' });
              const text = await blob.text();
              const points = this._parsePlyPoints(text);
              
              console.log(`解析到的点数量: ${points.length}`);
              
              // 提取轨迹点（第一个点）和正方形面（后四个点）
              if (points.length >= 5) {
                allTrajectoryPoints.push(points[0]);
                facePointsGroups.push([points[1], points[2], points[3], points[4]]);
                console.log(`成功添加轨迹点和正方形面，累计: ${allTrajectoryPoints.length}`);
              }
            } catch (itemError) {
              console.error(`处理第${index + 1}个base64数据时出错:`, itemError);
              // 继续处理下一个数据，不中断整个流程
            }
          }
        }
      }
      
      console.log('处理后的轨迹点数量:', allTrajectoryPoints.length);
      console.log('处理后的正方形面数量:', facePointsGroups.length);
      
      if (allTrajectoryPoints.length === 0) {
        console.warn('没有找到有效的轨迹点数据');
        return;
      }
      
      // 使用指定颜色或默认颜色
      const trajectoryColor = options.color || 0xFF0000; // 轨迹线颜色
      const faceColor = options.faceColor || 0x00FF00;   // 正方形面颜色
      
      // 1. 渲染轨迹线：连接所有轨迹点
      this._renderTrajectoryLine(allTrajectoryPoints, trajectoryColor);
      
      // 2. 为每个轨迹点渲染正方形面
      for (let i = 0; i < allTrajectoryPoints.length && i < facePointsGroups.length; i++) {
        this._renderSquareFace(allTrajectoryPoints[i], facePointsGroups[i], faceColor);
      }
      
      // 渲染场景
      this.modelRenderer.render();
      
      console.log('校准轨迹和正方形面显示成功');
      return true;
    } catch (error) {
      console.error('显示校准轨迹失败:', error);
      throw error;
    }
  }
  
  /**
   * 渲染轨迹线
   * @private
   * @param {Array} points - 轨迹点数组
   * @param {number} color - 轨迹线颜色
   */
  _renderTrajectoryLine(points, color) {
    if (!points || points.length < 2) return;
    
    // 创建线段材质
    const material = new THREE.LineBasicMaterial({
      color: color,
      linewidth: 3
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
    
    // 创建线段对象
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    
    // 保存到currentCalibrationTrajectory数组
    if (!this.currentCalibrationTrajectory) {
      this.currentCalibrationTrajectory = [];
    }
    this.currentCalibrationTrajectory.push(line);
  }
  
  /**
   * 渲染正方形面
   * @private
   * @param {Object} targetPoint - 轨迹点
   * @param {Array} facePoints - 正方形面的四个顶点
   * @param {number} color - 正方形面颜色
   */
  _renderSquareFace(targetPoint, facePoints, color) {
    if (!facePoints || facePoints.length !== 4) return;
    
    // 创建面材质
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    
    // 创建几何体
    const geometry = new THREE.BufferGeometry();
    
    // 创建顶点数组（正方形面需要6个顶点来形成两个三角形）
    const positions = new Float32Array([
      facePoints[0].x, facePoints[0].y, facePoints[0].z,
      facePoints[1].x, facePoints[1].y, facePoints[1].z,
      facePoints[2].x, facePoints[2].y, facePoints[2].z,
      facePoints[0].x, facePoints[0].y, facePoints[0].z,
      facePoints[2].x, facePoints[2].y, facePoints[2].z,
      facePoints[3].x, facePoints[3].y, facePoints[3].z
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // 创建面网格
    const faceMesh = new THREE.Mesh(geometry, material);
    this.scene.add(faceMesh);
    
    // 保存到currentCalibrationTrajectory数组
    if (!this.currentCalibrationTrajectory) {
      this.currentCalibrationTrajectory = [];
    }
    this.currentCalibrationTrajectory.push(faceMesh);
  }
  
  /**
   * 隐藏校准轨迹
   */
  hideCalibrationTrajectory() {
    console.log('hideCalibrationTrajectory方法被调用');
    
    // 移除当前显示的校准轨迹线段
    if (this.currentCalibrationTrajectory && this.currentCalibrationTrajectory.length > 0) {
      for (const segment of this.currentCalibrationTrajectory) {
        if (segment.parent) {
          this.scene.remove(segment);
          segment.geometry.dispose();
          segment.material.dispose();
        }
      }
      this.currentCalibrationTrajectory = null;
    }
    
    // 渲染场景
        this.modelRenderer.render();
    console.log('校准轨迹已隐藏');
    return true;
  }
  
  /**
   * 解析PLY文件中的点坐标
   * @param {string} plyContent - PLY文件内容
   * @returns {Array} 点坐标数组
   */
  _parsePlyPoints(plyContent) {
    const points = [];
    const lines = plyContent.trim().split('\n');
    
    // 找到end_header行之后的数据
    let headerEndIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === 'end_header') {
        headerEndIndex = i + 1;
        break;
      }
    }
    
    if (headerEndIndex === -1) {
      console.error('PLY文件格式错误，未找到end_header');
      return points;
    }
    
    // 解析点数据
    for (let i = headerEndIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          points.push({ x, y, z });
        }
      }
    }
    
    return points;
  }
  
  /**
   * 创建按间隔连接的线段
   * @param {Array} points - 点坐标数组
   * @param {number} interval - 连接间隔（秒）
   * @param {number} color - 线段颜色
   */
  _createIntervalSegments(points, interval, color) {
    console.log('创建按间隔连接的线段:', { pointCount: points.length, interval });
    
    // 计算间隔点数（假设点是按一定频率采集的，这里简化处理，直接按索引间隔）
    // 这里假设每秒采集一定数量的点，简化为按固定索引间隔
    const pointInterval = Math.max(1, Math.floor(points.length * interval));
    
    this.currentCalibrationTrajectory = [];
    
    // 创建线段材质
    const material = new THREE.LineBasicMaterial({
      color: color,
      linewidth: 2
    });
    
    // 按间隔连接点
    for (let i = 0; i < points.length - 1; i += pointInterval) {
      const endIndex = Math.min(i + pointInterval, points.length - 1);
      
      // 创建线段几何体
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array([
        points[i].x, points[i].y, points[i].z,
        points[endIndex].x, points[endIndex].y, points[endIndex].z
      ]);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      
      // 创建线段对象
      const line = new THREE.Line(geometry, material);
      this.scene.add(line);
      this.currentCalibrationTrajectory.push(line);
    }
    
    console.log('线段创建完成，共创建:', this.currentCalibrationTrajectory.length, '条线段');
  }

  /**
   * 获取当前模型的轨迹历史记录
   * @returns {Array} 轨迹数组
   */
  getTrajectoryHistory() {
    if (!this.currentModel) return [];
    return this.trajectoryHistory.getTrajectories();
  }

  /**
   * 显示指定的历史轨迹
   * @param {string} trajectoryId - 轨迹ID
   * @returns {boolean} 是否成功
   */
  showHistoryTrajectory(trajectoryId) {
    // 先清除当前绘制的轨迹
    this.clearLine();
    // 显示历史轨迹
    return this.trajectoryHistory.showTrajectory(trajectoryId, this.scene);
  }

  /**
   * 删除指定的历史轨迹
   * @param {string} trajectoryId - 轨迹ID
   * @returns {boolean} 是否成功
   */
  deleteHistoryTrajectory(trajectoryId) {
    return this.trajectoryHistory.deleteTrajectory(trajectoryId, this.scene);
  }

  /**
   * 清除当前模型的所有历史轨迹
   */
  clearAllTrajectoryHistory() {
    this.trajectoryHistory.clearAllTrajectories(this.scene);
    
    // 同时清除校准轨迹
    this.hideCalibrationTrajectory();
    this.calibrationTrajectories.clear();
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
    
    // 清除该器官的轨迹历史记录
    this.trajectoryHistory.clearOrganTrajectories(organName, this.scene);
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
   * 设置当前模型
   * @param {string} organName - 器官名称
   */
  setCurrentModel(organName) {
    if (organName && typeof organName === 'string') {
      this.currentModel = organName;
      // 同步更新轨迹历史记录的当前模型
      if (this.trajectoryHistory && this.trajectoryHistory.setCurrentModel) {
        this.trajectoryHistory.setCurrentModel(organName);
      }
      console.log('当前模型已设置为:', organName);
    }
  }

  /**
   * 高亮显示指定的点
   * @param {THREE.Vector3|null} point - 要高亮的点坐标，如果为null则清除高亮
   */
  highlightPoint(point) {
    // 如果有之前的高亮点，清除它
    if (this.highlightedPointMesh) {
      this.scene.remove(this.highlightedPointMesh);
      this.highlightedPointMesh.geometry.dispose();
      this.highlightedPointMesh.material.dispose();
      this.highlightedPointMesh = null;
    }
    
    // 如果提供了有效的点，创建高亮显示
    if (point && point.isVector3) {
      // 创建点的几何体
      const geometry = new THREE.SphereGeometry(2, 16, 16); // 半径为2，细分度16
      // 创建发光材质
      const material = new THREE.MeshBasicMaterial({
        color: 0xff0000, // 红色高亮
        transparent: true,
        opacity: 0.8
      });
      // 创建网格对象
      this.highlightedPointMesh = new THREE.Mesh(geometry, material);
      // 设置位置
      this.highlightedPointMesh.position.copy(point);
      // 添加到场景
      this.scene.add(this.highlightedPointMesh);
    }
  }

  /**
   * 启用吸附到最近点
   * @param {Function} callback - 吸附回调函数
   * @param {number} threshold - 吸附阈值（可选）
   */
  enableSnapToClosestPoint(callback, threshold) {
    this.snapEnabled = true;
    this.snapCallback = callback;
    
    // 设置吸附阈值
    if (threshold !== undefined) {
      this.snapThreshold = threshold;
    }
    
    // 设置鼠标样式为十字准星
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.style.cursor = 'crosshair';
    }
    
    // 禁用控制器，防止与选点操作冲突
    if (this.controls && this.controls.enabled !== undefined) {
      this.controls.enabled = false;
    }
    
    // 确保鼠标事件处理程序已绑定
    if (!this._eventHandlersBound) {
      this._bindEventHandlers();
    }
    
    // 确保currentModel已设置（与toggleDrawing方法保持一致）
    if (!this.currentModel && this.trajectoryHistory.getCurrentModel) {
      this.currentModel = this.trajectoryHistory.getCurrentModel();
    }
    
    console.log('启用吸附功能，鼠标样式已设置为十字型，currentModel:', this.currentModel);
  }

  /**
   * 禁用吸附到最近点
   */
  disableSnapToClosestPoint() {
    this.snapEnabled = false;
    this.snapCallback = null;
    
    // 恢复鼠标样式为默认
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.style.cursor = 'default';
    }
    
    // 重新启用控制器
    if (this.controls && this.controls.enabled !== undefined) {
      this.controls.enabled = true;
    }
    
    console.log('禁用吸附功能，鼠标样式已恢复为默认');
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