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

      // 绑定事件处理函数
      this._bindEventHandlers();

      const domElement = this.modelRenderer.renderer.domElement;
      domElement.addEventListener('mousedown', this.onMouseDown);
      domElement.addEventListener('mousemove', this.onMouseMove);
      domElement.addEventListener('mouseup', this.onMouseUp);

      // 确保在清理时解绑事件
      this._unbindEventHandlers = () => {
        domElement.removeEventListener('mousedown', this.onMouseDown);
        domElement.removeEventListener('mousemove', this.onMouseMove);
        domElement.removeEventListener('mouseup', this.onMouseUp);
      };

      this._initialized = true;
      console.log('PlyRenderer初始化完成');
    } catch (error) {
      console.error('PlyRenderer初始化失败:', error);
      throw error;
    }
  }

  /**
   * 绑定事件处理函数的this上下文
   * @private
   */
  _bindEventHandlers() {
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
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
      if (!this.modelRenderer || !this.modelRenderer.scene) {
        console.error('PlyRenderer未正确初始化');
        return false;
      }

      this.clearPlyData(organName);

      const plyData = await getOrganPlyModel(organName);

      const response = await fetch(plyData.data);
      const plyText = await response.text();

      const points = this.parsePlyFile(plyText);

      if (!points || points.length === 0) {
        console.error('未解析到有效点位数据');
        return false;
      }

      const pointsObject = this.renderPoints(points);
      const vectorsObject = this.renderNormals(points);
      vectorsObject.visible = false;

      if (this.modelRenderer && this.modelRenderer.scene) {
        this.modelRenderer.scene.add(pointsObject);
        this.modelRenderer.scene.add(vectorsObject);

        this.pointsObjects.set(organName, pointsObject);
        this.vectorsObjects.set(organName, vectorsObject);
        this.pointsData.set(organName, points);

        if (!this._normalsVisibility) {
          this._normalsVisibility = new Map();
        }
        this._normalsVisibility.set(organName, false);

        if (this.modelRenderer && this.modelRenderer.renderer && this.modelRenderer.scene && this.modelRenderer.camera) {
          try {
            const renderer = this.modelRenderer.renderer;
            const scene = this.modelRenderer.scene;
            const camera = this.modelRenderer.camera;

            renderer.render(scene, camera);
            console.log(`成功渲染${organName}的点位和法向量，共${points.length}个点`);
          } catch (renderError) {
            console.error('渲染时发生错误:', renderError);
          }
        } else {
          console.error('缺少渲染所需的组件，无法重新渲染场景');
        }
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('element vertex')) {
        vertexCount = parseInt(line.split(' ')[2]);
      }

      if (line === 'end_header') {
        dataStartIndex = i + 1;
        break;
      }
    }

    if (dataStartIndex === -1) {
      console.error('PLY文件格式错误：未找到end_header标记');
      return [];
    }

    const dataLines = lines.slice(dataStartIndex, dataStartIndex + vertexCount);

    for (const line of dataLines) {
      const values = line.trim().split(/\s+/).map(parseFloat);

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
   * 启动绘制模式
   * @param {string} modelName - 当前选中的模型名称
   */
  startDrawing(modelName) {
    if (!this.modelRenderer || !this.modelRenderer.scene) {
      console.error('模型渲染器未初始化');
      return false;
    }

    if (!this.pointsData.has(modelName)) {
      console.error(`模型${modelName}没有点位数据，无法进行绘制`);
      return false;
    }

    // 清除之前的线段和轨迹
    this.clearLine();
    this.clearTrajectory();

    // 设置绘制状态
    this.isDrawing = true;
    this.currentModel = modelName;
    this.isDragging = false;
    this.trajectoryPoints = [];
    this.startPoint = null;

    console.log(`已进入模型 ${modelName} 的绘制模式`);
    return true;
  }

  /**
   * 停止绘制模式
   */
  stopDrawing() {
    if (!this.isDrawing) return;

    // 清除临时预览线和重置状态
    this.clearTrajectory();

    this.isDrawing = false;
    this.isDragging = false;
    this.currentModel = null;
    this.startPoint = null;
    this.trajectoryPoints = [];

    console.log('已退出绘制模式');
  }

  /**
   * 切换绘制模式
   * @param {string} modelName - 当前选中的模型名称
   */
  toggleDrawing(modelName) {
    if (this.isDrawing) {
      this.stopDrawing();
      if (this.modelRenderer && this.modelRenderer.controls) {
        this.modelRenderer.controls.enabled = true;
      }
      return false;
    } else {
      const started = this.startDrawing(modelName);
      if (started && this.modelRenderer && this.modelRenderer.controls) {
        this.modelRenderer.controls.enabled = false;
      }
      return started;
    }
  }

  /**
   * 鼠标按下事件处理
   */
  onMouseDown(event) {
    // 仅在绘制模式下，且是鼠标左键按下时响应
    if (!this.isDrawing || event.button !== 0) return;

    const snapPoint = this.getNearestPointFromMouse(event);
    if (snapPoint) {
      this.isDragging = true;
      this.startPoint = snapPoint;

      this.clearTrajectory();
      this.trajectoryPoints = [this.startPoint];
    }
  }

  /**
   * 鼠标移动事件处理
   */
  onMouseMove(event) {
    // 仅在绘制模式下且正在拖动时响应
    if (!this.isDrawing || !this.isDragging) return;

    const rect = this.modelRenderer.renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: mouseX, y: mouseY }, this.modelRenderer.camera);

    const model = this.modelRenderer.models?.get(this.currentModel);
    if (!model) return;

    const modelIntersects = raycaster.intersectObject(model, true);
    if (modelIntersects.length > 0) {
      const surfacePoint = modelIntersects[0].point;

      // 添加点到用户绘制的原始轨迹
      this.trajectoryPoints.push({ x: surfacePoint.x, y: surfacePoint.y, z: surfacePoint.z });

      // 实时绘制吸附预览轨迹
      this.drawTrajectoryWithSnapPreview();
    }
  }

  /**
   * 绘制带有实时吸附预览的轨迹
   */
  drawTrajectoryWithSnapPreview() {
    if (!this.trajectoryPoints || this.trajectoryPoints.length < 2 || !this.modelRenderer || !this.modelRenderer.scene) return;

    if (this.trajectoryLine) {
      this.modelRenderer.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      this.trajectoryLine.material.dispose();
    }

    const plyPoints = this.pointsData.get(this.currentModel) || [];
    let previewTrajectoryPoints = [];

    if (plyPoints.length > 0) {
      // 对轨迹点进行实时吸附计算
      this.trajectoryPoints.forEach(trajectoryPoint => {
        let closestPoint = this._findNearestPlyPoint(trajectoryPoint, 20);
        previewTrajectoryPoints.push(closestPoint || trajectoryPoint);
      });
    } else {
      previewTrajectoryPoints = this.trajectoryPoints;
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(previewTrajectoryPoints.length * 3);

    previewTrajectoryPoints.forEach((point, index) => {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0xffff00,
      linewidth: 3,
      transparent: true,
      opacity: 0.8
    });

    this.trajectoryLine = new THREE.Line(geometry, material);
    this.modelRenderer.scene.add(this.trajectoryLine);

    requestAnimationFrame(() => {
      this.modelRenderer.renderer.render(this.modelRenderer.scene, this.modelRenderer.camera);
    });
  }

  /**
   * 鼠标抬起事件处理
   */
  onMouseUp(event) {
    // 仅在绘制模式下且正在拖动时响应
    if (!this.isDrawing || !this.isDragging) return;

    this.isDragging = false;

    // 如果轨迹点太少，则视为无效操作
    if (this.trajectoryPoints.length < 2) {
      this.clearTrajectory();
      this.startPoint = null;
      this.trajectoryPoints = [];
      return;
    }

    // 清除黄色的实时预览轨迹
    this.clearTrajectory();

    // 对整个轨迹进行最终的吸附处理
    const snappedTrajectoryPoints = this.snapTrajectoryToPoints(20);

    let finalPoints = [];
    if (snappedTrajectoryPoints.length > 1) {
      finalPoints = snappedTrajectoryPoints;
      console.log(`最终轨迹吸附到 ${finalPoints.length} 个点位`);
    } else {
      finalPoints = this.trajectoryPoints;
      console.warn(`吸附失败，回退到原始表面轨迹，包含 ${finalPoints.length} 个点`);
    }

    // 保存曲线数据用于后续参考
    this.drawnCurves.push(finalPoints);

    // 绘制最终的红色轨迹并收集附近点
    this.drawFinalLine(finalPoints);

    // 重置状态，以便用户可以立即绘制下一条线
    this.startPoint = null;
    this.trajectoryPoints = [];
  }

  /**
   * 从鼠标位置获取最近的点位
   */
  getNearestPointFromMouse(event) {
    if (!this.modelRenderer || !this.modelRenderer.camera || !this.currentModel) {
      return null;
    }

    const rect = this.modelRenderer.renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: mouseX, y: mouseY }, this.modelRenderer.camera);

    // 优先从模型表面获取精确点击位置，再寻找最近的PLY点
    const model = this.modelRenderer.models?.get(this.currentModel);
    if (model) {
      const modelIntersects = raycaster.intersectObject(model, true);
      if (modelIntersects.length > 0) {
        const referencePoint = modelIntersects[0].point;
        return this._findNearestPlyPoint(referencePoint, 50);
      }
    }

    return null;
  }

  /**
   * 清除预览轨迹
   */
  clearTrajectory() {
    if (this.trajectoryLine && this.modelRenderer && this.modelRenderer.scene) {
      this.modelRenderer.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      this.trajectoryLine.material.dispose();
      this.trajectoryLine = null;
    }
    this.trajectoryPoints = [];
  }

  /**
   * 将轨迹吸附到ply文件渲染的点位
   * @param {number} distanceThreshold 距离阈值
   * @returns {Array} 吸附后的轨迹点
   */
  snapTrajectoryToPoints(distanceThreshold = 20) {
    if (!this.currentModel || !this.trajectoryPoints || this.trajectoryPoints.length === 0) {
      return [];
    }

    const plyPoints = this.pointsData.get(this.currentModel) || [];
    if (plyPoints.length === 0) return [];

    const snappedPoints = [];

    this.trajectoryPoints.forEach(trajectoryPoint => {
      const closestPoint = this._findNearestPlyPoint(trajectoryPoint, distanceThreshold);
      if (closestPoint) {
        // 防止连续添加重复的点
        if (snappedPoints.length === 0 || this._calculateDistance(closestPoint, snappedPoints[snappedPoints.length - 1]) > 0.1) {
          snappedPoints.push(closestPoint);
        }
      }
    });

    return snappedPoints;
  }

  /**
   * 找到离给定点最近的ply点
   * @param {Object} point 给定点
   * @param {number} maxDistance 最大距离
   * @returns {Object|null} 最近的ply点
   */
  _findNearestPlyPoint(point, maxDistance = 20) {
    const plyPoints = this.pointsData.get(this.currentModel) || [];
    if (plyPoints.length === 0) return null;

    let nearestPoint = null;
    let minDistance = Infinity;

    for (const plyPoint of plyPoints) {
      const distance = this._calculateDistance(point, plyPoint);

      if (distance < minDistance && distance <= maxDistance) {
        minDistance = distance;
        nearestPoint = plyPoint;
      }
    };

    return nearestPoint;
  }

  /**
   * 计算两点之间的距离
   */
  _calculateDistance(point1, point2) {
    return Math.sqrt(
      Math.pow(point1.x - point2.x, 2) +
      Math.pow(point1.y - point2.y, 2) +
      Math.pow(point1.z - point2.z, 2)
    );
  }

  /**
   * 绘制最终的红色轨迹线并收集附近点
   * @param {Array} points - 最终确定的点位数组
   */
  drawFinalLine(points) {
    if (!points || points.length < 2 || !this.modelRenderer || !this.modelRenderer.scene) {
      console.error('点数组无效，无法绘制最终线段');
      return;
    }

    // 清除已有线段
    if (this.lineObject) {
      this.modelRenderer.scene.remove(this.lineObject);
      this.lineObject.geometry.dispose();
      this.lineObject.material.dispose();
      this.lineObject = null;
    }

    // 创建曲线几何体
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);

    points.forEach((point, index) => {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // 创建曲线材质并添加到场景
    const material = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 3,
      transparent: true,
      opacity: 0.9
    });

    this.lineObject = new THREE.Line(geometry, material);
    this.modelRenderer.scene.add(this.lineObject);

    // 核心功能：查找并记录曲线附近的点（距离≤2单位）
    const nearbyPoints = this.findPointsNearCurve(points, 2);
    this.selectedPoints = [...new Set([...this.selectedPoints, ...points, ...nearbyPoints])];

    console.log(`绘制最终轨迹，包含${points.length}个原始点和${nearbyPoints.length}个附近点，共${this.selectedPoints.length}个点`);

    requestAnimationFrame(() => {
      this.modelRenderer.renderer.render(this.modelRenderer.scene, this.modelRenderer.camera);
    });
  }

  /**
   * 查找距离曲线（由多段线段组成）一定范围内的点
   * @param {Array} curvePoints - 曲线的顶点数组
   * @param {number} maxDistance - 最大距离阈值
   * @returns {Array} 符合条件的点数组
   */
  findPointsNearCurve(curvePoints, maxDistance) {
    if (!this.currentModel || curvePoints.length < 2) return [];

    const plyPoints = this.pointsData.get(this.currentModel) || [];
    if (plyPoints.length === 0) return [];

    const nearbyPoints = [];
    const checkedPoints = new Set(); // 用于去重

    // 遍历曲线上的每一段线段
    for (let i = 0; i < curvePoints.length - 1; i++) {
      const start = curvePoints[i];
      const end = curvePoints[i + 1];

      // 检查每个点是否在当前线段的附近
      plyPoints.forEach(plyPoint => {
        const pointKey = `${plyPoint.x},${plyPoint.y},${plyPoint.z}`;
        if (checkedPoints.has(pointKey)) return;

        // 计算点到线段的距离
        const distance = this._distanceFromPointToLine(plyPoint, start, end);

        if (distance <= maxDistance) {
          nearbyPoints.push(plyPoint);
          checkedPoints.add(pointKey);
        }
      });
    }

    return nearbyPoints;
  }

  /**
   * 计算点到线段的最短距离
   * @param {Object} point - 待检测的点
   * @param {Object} lineStart - 线段起点
   * @param {Object} lineEnd - 线段终点
   * @returns {number} 最短距离
   */
  _distanceFromPointToLine(point, lineStart, lineEnd) {
    // 线段向量
    const lineVecX = lineEnd.x - lineStart.x;
    const lineVecY = lineEnd.y - lineStart.y;
    const lineVecZ = lineEnd.z - lineStart.z;

    // 点到线段起点的向量
    const pointVecX = point.x - lineStart.x;
    const pointVecY = point.y - lineStart.y;
    const pointVecZ = point.z - lineStart.z;

    // 计算线段长度的平方
    const lineLengthSquared = lineVecX ** 2 + lineVecY ** 2 + lineVecZ ** 2;

    // 如果线段长度为0，直接返回点到起点的距离
    if (lineLengthSquared === 0) {
      return this._calculateDistance(point, lineStart);
    }

    // 计算投影比例（0-1之间为线段上的投影）
    const t = Math.max(0, Math.min(1,
      (pointVecX * lineVecX + pointVecY * lineVecY + pointVecZ * lineVecZ) / lineLengthSquared
    ));

    // 计算投影点
    const projectionX = lineStart.x + t * lineVecX;
    const projectionY = lineStart.y + t * lineVecY;
    const projectionZ = lineStart.z + t * lineVecZ;

    // 计算点到投影点的距离
    return this._calculateDistance(point, { x: projectionX, y: projectionY, z: projectionZ });
  }

  /**
   * 清除已绘制的最终线段
   */
  clearLine() {
    if (this.lineObject && this.modelRenderer && this.modelRenderer.scene) {
      this.modelRenderer.scene.remove(this.lineObject);
      this.lineObject.geometry.dispose();
      this.lineObject.material.dispose();
      this.lineObject = null;
    }
    this.selectedPoints = [];
    this.drawnCurves = [];
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
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const index = i * 3;
      positions[index] = point.x;
      positions[index + 1] = point.y;
      positions[index + 2] = point.z;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x000000,
      size: 0.5,
      transparent: true,
      opacity: 0.8
    });

    return new THREE.Points(geometry, material);
  }

  /**
   * 渲染法向量
   * @param {Array} points - 包含法向量信息的点数据
   * @returns {THREE.Group} - 法向量群组对象
   */
  renderNormals(points) {
    const group = new THREE.Group();
    const lineLength = 1;

    points.forEach(point => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(point.x, point.y, point.z),
        new THREE.Vector3(
          point.x + point.nx * lineLength,
          point.y + point.ny * lineLength,
          point.z + point.nz * lineLength
        )
      ]);

      const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
      const line = new THREE.Line(geometry, material);
      group.add(line);
    });

    return group;
  }

  /**
   * 清除指定器官的PLY数据
   * @param {string} organName - 器官名称
   */
  clearPlyData(organName) {
    if (this.pointsObjects.has(organName)) {
      const pointsObject = this.pointsObjects.get(organName);
      this.modelRenderer.scene.remove(pointsObject);
      pointsObject.geometry.dispose();
      pointsObject.material.dispose();
      this.pointsObjects.delete(organName);
    }

    if (this.vectorsObjects.has(organName)) {
      const vectorsObject = this.vectorsObjects.get(organName);
      this.modelRenderer.scene.remove(vectorsObject);
      vectorsObject.children.forEach(child => {
        child.geometry.dispose();
        child.material.dispose();
      });
      this.vectorsObjects.delete(organName);
    }

    this.pointsData.delete(organName);
    if (this._normalsVisibility) {
      this._normalsVisibility.delete(organName);
    }
  }

  /**
   * 清除所有PLY数据
   */
  clearAllPlyData() {
    this.pointsObjects.forEach((object, organName) => {
      this.modelRenderer.scene.remove(object);
      object.geometry.dispose();
      object.material.dispose();
    });
    this.pointsObjects.clear();

    this.vectorsObjects.forEach((object, organName) => {
      this.modelRenderer.scene.remove(object);
      object.children.forEach(child => {
        child.geometry.dispose();
        child.material.dispose();
      });
    });
    this.vectorsObjects.clear();

    this.pointsData.clear();
    if (this._normalsVisibility) {
      this._normalsVisibility.clear();
    }

    this.clearLine();
    this.clearTrajectory();
  }

  /**
   * 检查是否有指定器官的PLY数据
   * @param {string} organName - 器官名称
   * @returns {boolean} 是否存在
   */
  hasPlyData(organName) {
    return this.pointsData.has(organName) && this.pointsData.get(organName).length > 0;
  }

  /**
   * 切换法向量显示状态
   * @param {string} organName - 器官名称
   */
  toggleNormals(organName) {
    if (!this._normalsVisibility) {
      this._normalsVisibility = new Map();
    }

    const currentState = this._normalsVisibility.get(organName) || false;
    const vectorsObject = this.vectorsObjects.get(organName);

    if (vectorsObject) {
      vectorsObject.visible = !currentState;
      this._normalsVisibility.set(organName, !currentState);
      this.modelRenderer.renderer.render(this.modelRenderer.scene, this.modelRenderer.camera);
    }
  }

  /**
   * 销毁PlyRenderer实例
   */
  destroy() {
    this.clearAllPlyData();
    if (this._unbindEventHandlers) {
      this._unbindEventHandlers();
    }
    this._initialized = false;
    this.modelRenderer = null;
  }
}

export default PlyRenderer;