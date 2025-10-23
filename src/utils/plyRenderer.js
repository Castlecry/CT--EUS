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
      this.trajectoryPoints = []; // 用户绘制的轨迹点
      this.snappedTrajectoryPoints = []; // 吸附到模型点位的轨迹点
      this.trajectoryLine = null; // 实时轨迹线
      
      // 事件处理函数引用 - 延迟到方法定义后再绑定
      this._bindEventHandlers();
      
      // 绑定鼠标事件到渲染器的 DOM 元素
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
      // 默认隐藏法向量
      vectorsObject.visible = false;

      // 将对象添加到场景中
      if (this.modelRenderer && this.modelRenderer.scene) {
        this.modelRenderer.scene.add(pointsObject);
        this.modelRenderer.scene.add(vectorsObject);
        
        // 存储对象引用和原始点位数据
        this.pointsObjects.set(organName, pointsObject);
        this.vectorsObjects.set(organName, vectorsObject);
        this.pointsData.set(organName, points); // 存储原始点位数据用于吸附计算
        
        // 存储法向量可见性状态
        if (!this._normalsVisibility) {
          this._normalsVisibility = new Map();
        }
        this._normalsVisibility.set(organName, false);
        
        // 重新渲染场景 - 避免Vue响应式代理与Three.js对象的冲突
        if (this.modelRenderer && this.modelRenderer.renderer && this.modelRenderer.scene && this.modelRenderer.camera) {
          try {
            // 直接获取原始的渲染器、场景和相机，避免代理问题
            const renderer = this.modelRenderer.renderer;
            const scene = this.modelRenderer.scene;
            const camera = this.modelRenderer.camera;
            
            // 使用原始对象进行渲染
            renderer.render(scene, camera);
            console.log(`成功渲染${organName}的点位和法向量，共${points.length}个点`);
          } catch (renderError) {
            console.error('渲染时发生错误:', renderError);
            // 降级处理：不调用渲染方法，因为animate循环会自动渲染
            console.log('跳过直接渲染，依赖动画循环更新视图');
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
    
    // 清除之前的线段和轨迹
    this.clearLine();
    this.clearTrajectory();
    
    // 重置绘制状态
    this.isDrawing = true;
    this.currentModel = modelName;
    this.trajectoryPoints = [];
    this.snappedTrajectoryPoints = [];
    this.startPoint = null;
    this.endPoint = null;
    
    // 添加事件监听
    const domElement = this.modelRenderer.renderer.domElement;
    domElement.addEventListener('mousedown', this.onMouseDown);
    domElement.addEventListener('mousemove', this.onMouseMove);
    domElement.addEventListener('mouseup', this.onMouseUp);
    
    console.log(`开始在模型${modelName}上绘制线段，已清除旧轨迹`);
    return true;
  }
  
  /**
   * 停止线段绘制模式
   */
  stopDrawing() {
    if (!this.isDrawing || !this.modelRenderer || !this.modelRenderer.renderer) return;
    
    // 移除事件监听
    const domElement = this.modelRenderer.renderer.domElement;
    domElement.removeEventListener('mousedown', this.onMouseDown);
    domElement.removeEventListener('mousemove', this.onMouseMove);
    domElement.removeEventListener('mouseup', this.onMouseUp);

    // 移除临时线段和临时轨迹
    this.removeTempLine();
    this.clearTrajectory();
    
    // 重置绘制状态
    this.isDrawing = false;
    this.currentModel = null;
    this.startPoint = null;
    this.endPoint = null;
    
    console.log('停止线段绘制');
  }
  
  /**
   * 切换线段绘制模式
   * @param {string} modelName - 当前选中的模型名称
   */
  toggleDrawing(modelName) {
    if (this.isDrawing) {
      this.stopDrawing();
      if (this.modelRenderer && this.modelRenderer.controls) {
        this.modelRenderer.controls.enabled = true; // 重新启用模型旋转控制
      }
      return false;
    } else {
      const started = this.startDrawing(modelName);
      if (started && this.modelRenderer && this.modelRenderer.controls) {
        this.modelRenderer.controls.enabled = false; // 禁用模型旋转控制
      }
      return started;
    }
  }
  
  /**
   * 鼠标按下事件处理
   */
  onMouseDown(event) {
    console.log('onMouseDown triggered', { event, isDrawing: this.isDrawing, currentModel: this.currentModel });
    if (!this.isDrawing || !this.currentModel) return;

    const snapPoint = this.getNearestPointFromMouse(event);
    console.log('Snap point on mouse down:', snapPoint);
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
    if (!this.isDrawing || !this.startPoint) return;

    const rect = this.modelRenderer.renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: mouseX, y: mouseY }, this.modelRenderer.camera);

    // 先尝试直接与模型相交，确保轨迹贴在模型表面
    const model = this.modelRenderer.models?.get(this.currentModel);
    if (!model) return;
    
    const modelIntersects = raycaster.intersectObject(model, true);
    if (modelIntersects.length > 0) {
      const point = modelIntersects[0].point;

      // 确保点贴合模型表面
      const surfacePoint = {
        x: point.x,
        y: point.y,
        z: point.z
      };

      this.endPoint = surfacePoint;

      // 更新轨迹点列表，避免点太多影响性能
      if (this.trajectoryPoints.length === 0) {
        this.trajectoryPoints = [this.startPoint];
      }
      
      // 只添加与上一个点有足够距离的点，避免重复点
      const lastPoint = this.trajectoryPoints[this.trajectoryPoints.length - 1];
      const distance = Math.sqrt(
        Math.pow(surfacePoint.x - lastPoint.x, 2) +
        Math.pow(surfacePoint.y - lastPoint.y, 2) +
        Math.pow(surfacePoint.z - lastPoint.z, 2)
      );
      
      if (distance > 1) { // 距离阈值，可根据需要调整
        this.trajectoryPoints.push(surfacePoint);
      } else {
        // 更新最后一个点
        this.trajectoryPoints[this.trajectoryPoints.length - 1] = surfacePoint;
      }

      // 实时吸附预览：在绘制轨迹前先进行吸附计算
      this.drawTrajectoryWithSnapPreview();
    }
  }
  
  /**
   * 绘制带有实时吸附预览的轨迹
   */
  drawTrajectoryWithSnapPreview() {
    if (!this.trajectoryPoints || this.trajectoryPoints.length < 2 || !this.modelRenderer || !this.modelRenderer.scene) return;
    
    // 移除旧的轨迹
    if (this.trajectoryLine) {
      this.modelRenderer.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      this.trajectoryLine.material.dispose();
    }
    
    // 获取当前模型的ply点数据
    const plyPoints = this.pointsData.get(this.currentModel) || [];
    
    if (plyPoints.length > 0) {
      // 实时吸附：对轨迹点进行临时吸附计算
      const previewTrajectoryPoints = [];
      
      this.trajectoryPoints.forEach(trajectoryPoint => {
        let closestPoint = trajectoryPoint; // 默认使用原始点
        let minDistance = Infinity;
        
        // 查找最近的ply点
        plyPoints.forEach(plyPoint => {
          const distance = Math.sqrt(
            Math.pow(trajectoryPoint.x - plyPoint.x, 2) +
            Math.pow(trajectoryPoint.y - plyPoint.y, 2) +
            Math.pow(trajectoryPoint.z - plyPoint.z, 2)
          );
          
          if (distance < minDistance && distance < 20) { // 20单位距离阈值
            minDistance = distance;
            closestPoint = plyPoint;
          }
        });
        
        previewTrajectoryPoints.push(closestPoint);
      });
      
      // 创建吸附预览轨迹的几何体
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(previewTrajectoryPoints.length * 3);
      
      previewTrajectoryPoints.forEach((point, index) => {
        positions[index * 3] = point.x;
        positions[index * 3 + 1] = point.y;
        positions[index * 3 + 2] = point.z;
      });
      
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      
      // 使用黄色半透明材质显示实时吸附预览轨迹
      const material = new THREE.LineBasicMaterial({
        color: 0xffff00, // 黄色
        linewidth: 3,
        transparent: true,
        opacity: 0.8
      });
      
      this.trajectoryLine = new THREE.Line(geometry, material);
      this.modelRenderer.scene.add(this.trajectoryLine);
    } else {
      // 如果没有ply点数据，回退到原始轨迹绘制
      this.drawTrajectory();
    }
    
    // 确保轨迹实时渲染
    requestAnimationFrame(() => {
      this.modelRenderer.renderer.render(this.modelRenderer.scene, this.modelRenderer.camera);
    });
  }
  
  /**
   * 鼠标抬起事件处理
   */
  onMouseUp(event) {
    console.log('onMouseUp triggered', { event, isDrawing: this.isDrawing, startPoint: this.startPoint, endPoint: this.endPoint, currentModel: this.currentModel });
    if (!this.isDrawing || !this.startPoint) return;

    // 如果没有轨迹点，使用起点作为终点
    if (!this.endPoint) {
      this.endPoint = this.startPoint;
    }

    // 先清除临时轨迹
    this.clearTrajectory();

    // 获取当前模型的ply点数据作为吸附点库
    const plyPointLibrary = this.pointsData.get(this.currentModel) || [];
    console.log(`开始最终吸附，吸附点库包含${plyPointLibrary.length}个点`);
    
    let finalPoints = [];
    
    if (plyPointLibrary.length > 0) {
      // 1. 对起点和终点单独进行精确吸附
      const snappedStartPoint = this._findNearestPlyPoint(this.startPoint, 20);
      const snappedEndPoint = this._findNearestPlyPoint(this.endPoint, 20);
      
      // 2. 对整个轨迹进行吸附处理
      const trajectoryPoints = this.trajectoryPoints.length > 1 ? this.trajectoryPoints : [this.startPoint, this.endPoint];
      const snappedTrajectoryPoints = this.snapTrajectoryToPoints(20);
      
      // 3. 构建最终轨迹点列表
      if (snappedTrajectoryPoints.length > 1) {
        finalPoints = snappedTrajectoryPoints;
        // 确保起点和终点是精确吸附的
        if (snappedStartPoint) finalPoints[0] = snappedStartPoint;
        if (snappedEndPoint && finalPoints.length > 1) finalPoints[finalPoints.length - 1] = snappedEndPoint;
      } else {
        // 如果轨迹吸附失败，至少保证起点和终点是吸附的
        finalPoints = [];
        if (snappedStartPoint) finalPoints.push(snappedStartPoint);
        if (snappedEndPoint && (!snappedStartPoint || 
            (snappedStartPoint.x !== snappedEndPoint.x || 
             snappedStartPoint.y !== snappedEndPoint.y || 
             snappedStartPoint.z !== snappedEndPoint.z))) {
          finalPoints.push(snappedEndPoint);
        }
        
        // 如果只有起点或没有点，回退到原始点
        if (finalPoints.length === 0) {
          finalPoints = [this.startPoint, this.endPoint];
        } else if (finalPoints.length === 1) {
          finalPoints.push(this.endPoint);
        }
      }
    } else {
      // 如果没有ply点数据，回退到模型表面贴合
      finalPoints = this.generateSurfaceTrajectory();
      if (finalPoints.length < 2) {
        finalPoints = [this.startPoint, this.endPoint];
      }
    }
    
    console.log(`最终轨迹包含${finalPoints.length}个点`);

    // 停止绘制
    this.stopDrawing();

    // 保存最终线段并绘制红色轨迹
    this.drawFinalLine(finalPoints);
  }
  
  /**
   * 从鼠标位置获取最近的点位
   */
  getNearestPointFromMouse(event) {
    if (!this.modelRenderer || !this.modelRenderer.camera || !this.currentModel) {
      return null;
    }

    try {
      const rect = this.modelRenderer.renderer.domElement.getBoundingClientRect();
      const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera({ x: mouseX, y: mouseY }, this.modelRenderer.camera);

      const pointsObject = this.pointsObjects.get(this.currentModel);
      if (pointsObject) {
        const pointIntersects = raycaster.intersectObject(pointsObject, true);
        if (pointIntersects.length > 0) {
          const index = Math.floor(pointIntersects[0].faceIndex / 3);
          const points = this.pointsData.get(this.currentModel);
          if (points && index >= 0 && index < points.length) {
            return points[index];
          }
        }
      }

      const model = this.modelRenderer.models?.get(this.currentModel);
      if (model) {
        const modelIntersects = raycaster.intersectObject(model, true);
        if (modelIntersects.length > 0) {
          const referencePoint = modelIntersects[0].point;

          const points = this.pointsData.get(this.currentModel);
          if (points) {
            let nearestPoint = null;
            let minDistance = Infinity;
            for (const point of points) {
              const pointVector = new THREE.Vector3(point.x, point.y, point.z);
              const distance = pointVector.distanceTo(referencePoint);
              if (distance < minDistance) {
                minDistance = distance;
                nearestPoint = point;
              }
            }
            return nearestPoint;
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * 绘制临时线段（拖动时）
   */
  drawTempLine() {
    if (!this.startPoint || !this.endPoint || !this.modelRenderer || !this.modelRenderer.scene) return;

    this.removeTempLine();

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      this.startPoint.x, this.startPoint.y, this.startPoint.z,
      this.endPoint.x, this.endPoint.y, this.endPoint.z
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 3,
      transparent: true,
      opacity: 0.7
    });

    this.tempLine = new THREE.Line(geometry, material);
    this.modelRenderer.scene.add(this.tempLine);

    requestAnimationFrame(() => {
      this.modelRenderer.renderer.render(this.modelRenderer.scene, this.modelRenderer.camera);
    });
  }

  drawTrajectory() {
    if (!this.trajectoryPoints || this.trajectoryPoints.length < 2 || !this.modelRenderer || !this.modelRenderer.scene) return;

    // 移除旧的轨迹
    if (this.trajectoryLine) {
      this.modelRenderer.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      this.trajectoryLine.material.dispose();
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.trajectoryPoints.length * 3);

    this.trajectoryPoints.forEach((point, index) => {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // 使用黄色显示临时轨迹
    const material = new THREE.LineBasicMaterial({
      color: 0xffff00, // 黄色
      linewidth: 3,
      transparent: true,
      opacity: 0.8
    });

    this.trajectoryLine = new THREE.Line(geometry, material);
    this.modelRenderer.scene.add(this.trajectoryLine);

    // 确保轨迹实时渲染
    requestAnimationFrame(() => {
      this.modelRenderer.renderer.render(this.modelRenderer.scene, this.modelRenderer.camera);
    });
  }
  
  /**
   * 清除轨迹
   */
  clearTrajectory() {
    if (this.trajectoryLine && this.modelRenderer && this.modelRenderer.scene) {
      this.modelRenderer.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      this.trajectoryLine.material.dispose();
      this.trajectoryLine = null;
    }
    this.trajectoryPoints = [];
    this.snappedTrajectoryPoints = [];
  }
  
  /**
   * 将轨迹吸附到ply文件渲染的点位（仅使用x,y,z坐标）
   * @param {number} distanceThreshold 距离阈值
   * @returns {Array} 吸附后的轨迹点
   */
  snapTrajectoryToPoints(distanceThreshold = 20) {
    if (!this.currentModel || !this.trajectoryPoints || this.trajectoryPoints.length === 0) {
      return [];
    }
    
    // 确保使用的是ply文件渲染的点数据
    const plyPoints = this.pointsData.get(this.currentModel) || [];
    console.log(`获取到${plyPoints.length}个ply文件渲染的点位`);
    
    const snappedPoints = [];
    
    // 为轨迹中的每个点找到最近的ply点位，只使用x,y,z坐标进行距离计算
    this.trajectoryPoints.forEach(trajectoryPoint => {
      let closestPoint = null;
      let minDistance = Infinity;
      
      plyPoints.forEach(plyPoint => {
        // 只使用x,y,z坐标计算距离，忽略法向量数据
        const distance = Math.sqrt(
          Math.pow(trajectoryPoint.x - plyPoint.x, 2) +
          Math.pow(trajectoryPoint.y - plyPoint.y, 2) +
          Math.pow(trajectoryPoint.z - plyPoint.z, 2)
        );
        
        if (distance < minDistance && distance < distanceThreshold) {
          minDistance = distance;
          closestPoint = plyPoint; // 保留完整的点数据（包含法向量）
        }
      });
      
      if (closestPoint) {
        snappedPoints.push(closestPoint);
        console.log(`吸附点: (${closestPoint.x}, ${closestPoint.y}, ${closestPoint.z})，距离: ${minDistance.toFixed(2)}`);
      }
    });
    
    console.log(`轨迹吸附到${snappedPoints.length}个ply点位`);
    return snappedPoints;
  }
  
  /**
   * 生成贴合模型表面的轨迹，优先使用ply文件的点数据
   * @returns {Array} 优化后的轨迹点
   */
  generateSurfaceTrajectory() {
    // 获取当前模型的ply点数据
    const plyPoints = this.pointsData.get(this.currentModel) || [];
    
    if (plyPoints.length === 0) {
      console.warn('没有可用的ply点数据，使用模型表面贴合');
      return this.finalizeLineToSurface();
    }
    
    // 将用户绘制的轨迹吸附到ply文件的点位
    this.snappedTrajectoryPoints = this.snapTrajectoryToPoints(20);
    
    console.log(`吸附到${this.snappedTrajectoryPoints.length}个ply点位`);
    
    if (this.snappedTrajectoryPoints.length < 2) {
      // 如果吸附到的点太少，尝试直接从ply点云中选择路径
      console.log('吸附点太少，尝试从ply点云中直接选择路径');
      const pathPoints = this._findPathThroughPlyPoints(20);
      if (pathPoints.length > 1) {
        return pathPoints;
      }
      // 否则使用原始轨迹点但确保它们贴合模型表面
      return this.finalizeLineToSurface();
    }
    
    // 对吸附点进行去重和优化，避免重复或过于接近的点
    const optimizedPoints = [];
    let lastPoint = null;
    
    this.snappedTrajectoryPoints.forEach(point => {
      if (!lastPoint || this._calculateDistance(point, lastPoint) > 5) {
        optimizedPoints.push(point);
        lastPoint = point;
      }
    });
    
    // 如果优化后点数太少，尝试补充中间点
    const finalPoints = this._interpolatePathPoints(optimizedPoints);
    
    console.log(`优化后的表面轨迹包含${finalPoints.length}个ply点位`);
    return finalPoints;
  }
  
  /**
   * 直接从ply点云中寻找连接起点和终点的路径
   * @param {number} maxDistance 最大允许距离
   * @returns {Array} 路径点数组
   */
  _findPathThroughPlyPoints(maxDistance = 20) {
    if (!this.startPoint || !this.endPoint || !this.currentModel) {
      return [];
    }
    
    const plyPoints = this.pointsData.get(this.currentModel) || [];
    const pathPoints = [];
    
    // 找到离起点最近的ply点
    let startPlyPoint = this._findNearestPlyPoint(this.startPoint, maxDistance);
    // 找到离终点最近的ply点
    let endPlyPoint = this._findNearestPlyPoint(this.endPoint, maxDistance);
    
    if (startPlyPoint && endPlyPoint) {
      // 简单路径：如果起点和终点都有对应的ply点，直接连接它们
      pathPoints.push(startPlyPoint);
      pathPoints.push(endPlyPoint);
      console.log('找到起点和终点对应的ply点');
    }
    
    return pathPoints;
  }
  
  /**
   * 找到离给定点最近的ply点（仅使用x,y,z坐标）
   * @param {Object} point 给定点
   * @param {number} maxDistance 最大距离
   * @returns {Object|null} 最近的ply点
   */
  _findNearestPlyPoint(point, maxDistance = 20) {
    const plyPoints = this.pointsData.get(this.currentModel) || [];
    let nearestPoint = null;
    let minDistance = Infinity;
    
    plyPoints.forEach(plyPoint => {
      // 只使用x,y,z坐标计算距离，忽略法向量数据
      const distance = Math.sqrt(
        Math.pow(point.x - plyPoint.x, 2) +
        Math.pow(point.y - plyPoint.y, 2) +
        Math.pow(point.z - plyPoint.z, 2)
      );
      
      if (distance < minDistance && distance <= maxDistance) {
        minDistance = distance;
        nearestPoint = plyPoint; // 返回完整的点数据，包含法向量
      }
    });
    
    if (nearestPoint) {
      console.log(`找到最近的ply点: (${nearestPoint.x}, ${nearestPoint.y}, ${nearestPoint.z})，距离: ${minDistance.toFixed(2)}`);
    }
    
    return nearestPoint;
  }
  
  /**
   * 对路径点进行插值，增加中间点
   * @param {Array} points 路径点数组
   * @returns {Array} 插值后的路径点
   */
  _interpolatePathPoints(points) {
    if (!points || points.length < 2) {
      return points || [];
    }
    
    const interpolatedPoints = [points[0]];
    
    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1];
      const currPoint = points[i];
      const distance = this._calculateDistance(prevPoint, currPoint);
      
      // 如果两点距离太远，尝试找到中间的ply点
      if (distance > 25) { // 距离阈值
        const midPoint = this._findIntermediatePlyPoints(prevPoint, currPoint, 20);
        if (midPoint.length > 0) {
          interpolatedPoints.push(...midPoint);
        }
      }
      
      interpolatedPoints.push(currPoint);
    }
    
    return interpolatedPoints;
  }
  
  /**
   * 查找两点之间的中间ply点
   * @param {Object} startPoint 起点
   * @param {Object} endPoint 终点
   * @param {number} maxDistance 最大距离
   * @returns {Array} 中间点数组
   */
  _findIntermediatePlyPoints(startPoint, endPoint, maxDistance = 20) {
    const plyPoints = this.pointsData.get(this.currentModel) || [];
    const intermediatePoints = [];
    
    // 计算方向向量
    const dirX = endPoint.x - startPoint.x;
    const dirY = endPoint.y - startPoint.y;
    const dirZ = endPoint.z - startPoint.z;
    const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    
    if (length === 0) return [];
    
    // 归一化方向向量
    const normDirX = dirX / length;
    const normDirY = dirY / length;
    const normDirZ = dirZ / length;
    
    // 查找在路径附近的ply点
    plyPoints.forEach(plyPoint => {
      // 计算点到线段的垂直距离
      const vectorToPointX = plyPoint.x - startPoint.x;
      const vectorToPointY = plyPoint.y - startPoint.y;
      const vectorToPointZ = plyPoint.z - startPoint.z;
      
      // 计算点积
      const dotProduct = vectorToPointX * normDirX + vectorToPointY * normDirY + vectorToPointZ * normDirZ;
      
      // 确保点在线段的投影范围内
      if (dotProduct >= 0 && dotProduct <= length) {
        // 计算垂直距离
        const perpendicularDistance = Math.sqrt(
          vectorToPointX * vectorToPointX + 
          vectorToPointY * vectorToPointY + 
          vectorToPointZ * vectorToPointZ - 
          dotProduct * dotProduct
        );
        
        if (perpendicularDistance <= maxDistance) {
          intermediatePoints.push(plyPoint);
        }
      }
    });
    
    // 按到起点的距离排序
    intermediatePoints.sort((a, b) => {
      const distA = this._calculateDistance(startPoint, a);
      const distB = this._calculateDistance(startPoint, b);
      return distA - distB;
    });
    
    return intermediatePoints;
  }
  
  /**
   * 计算两点之间的距离（仅使用x,y,z坐标）
   */
  _calculateDistance(point1, point2) {
    // 确保只使用x,y,z坐标进行距离计算，忽略法向量数据
    return Math.sqrt(
      Math.pow(point1.x - point2.x, 2) +
      Math.pow(point1.y - point2.y, 2) +
      Math.pow(point1.z - point2.z, 2)
    );
  }

  finalizeLineToSurface() {
    if (!this.trajectoryPoints || this.trajectoryPoints.length < 2 || !this.currentModel) return [];

    const model = this.modelRenderer.models?.get(this.currentModel);
    if (!model) return this.trajectoryPoints;

    // 确保所有点贴合模型表面
    const raycaster = new THREE.Raycaster();
    const surfacePoints = this.trajectoryPoints.map((point) => {
      // 从点向多个方向投射射线，增加找到交点的概率
      const directions = [
        new THREE.Vector3(0, -1, 0),  // 向下
        new THREE.Vector3(0, 1, 0),   // 向上
        new THREE.Vector3(1, 0, 0),   // 向右
        new THREE.Vector3(-1, 0, 0),  // 向左
        new THREE.Vector3(0, 0, 1),   // 向前
        new THREE.Vector3(0, 0, -1)   // 向后
      ];
      
      let closestIntersection = null;
      let minDistance = Infinity;
      
      directions.forEach(dir => {
        raycaster.set(point, dir.normalize());
        const intersects = raycaster.intersectObject(model, true);
        
        if (intersects.length > 0) {
          const distance = point.distanceTo(intersects[0].point);
          if (distance < minDistance && distance < 50) { // 限制最大距离
            minDistance = distance;
            closestIntersection = intersects[0].point;
          }
        }
      });
      
      // 如果找到交点，返回交点，否则返回原始点
      if (closestIntersection) {
        return {
          x: closestIntersection.x,
          y: closestIntersection.y,
          z: closestIntersection.z
        };
      }
      return point;
    });

    console.log('最终贴合表面的轨迹点数量:', surfacePoints.length);
    return surfacePoints;
  }

  drawFinalLine(points) {
    if (!points || points.length < 2 || !this.modelRenderer || !this.modelRenderer.scene) {
      console.error('无效的点数组');
      return;
    }

    // 移除旧的线段
    if (this.lineObject) {
      this.modelRenderer.scene.remove(this.lineObject);
      this.lineObject.geometry.dispose();
      this.lineObject.material.dispose();
      this.lineObject = null;
    }

    // 创建几何体
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    
    points.forEach((point, index) => {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
    });
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // 创建材质 - 使用红色表示最终轨迹
    const material = new THREE.LineBasicMaterial({
      color: 0xff0000, // 红色
      linewidth: 3,
      transparent: true,
      opacity: 0.9
    });

    // 创建线段对象
    this.lineObject = new THREE.Line(geometry, material);
    this.modelRenderer.scene.add(this.lineObject);

    // 保存选择的点位
    if (!this.selectedPoints) {
      this.selectedPoints = [];
    }
    // 确保不重复添加相同的点
    points.forEach(point => {
      if (!this.selectedPoints.some(p => 
        Math.abs(p.x - point.x) < 0.01 && 
        Math.abs(p.y - point.y) < 0.01 && 
        Math.abs(p.z - point.z) < 0.01
      )) {
        this.selectedPoints.push(point);
      }
    });

    console.log(`绘制最终轨迹，包含${points.length}个点，已保存${this.selectedPoints.length}个唯一点位`);

    // 渲染场景
    requestAnimationFrame(() => {
      this.modelRenderer.renderer.render(this.modelRenderer.scene, this.modelRenderer.camera);
    });
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
      if (this.modelRenderer && this.modelRenderer.renderer && this.modelRenderer.scene && this.modelRenderer.camera) {
        try {
          // 使用 requestAnimationFrame 确保渲染器更新
          requestAnimationFrame(() => {
            this.modelRenderer.renderer.render(this.modelRenderer.scene, this.modelRenderer.camera);
          });
        } catch (error) {
          console.error('移除临时线段后渲染失败:', error);
        }
      }
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
      // 使用正确的渲染方式
      if (this.modelRenderer && this.modelRenderer.renderer && this.modelRenderer.scene && this.modelRenderer.camera) {
        try {
          this.modelRenderer.renderer.render(this.modelRenderer.scene, this.modelRenderer.camera);
        } catch (error) {
          console.error('清除线段后渲染失败:', error);
        }
      }
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
    
    // 清除法向量可见性状态
    if (this._normalsVisibility && this._normalsVisibility.has(organName)) {
      this._normalsVisibility.delete(organName);
    }
    
    // 清除已选择的点位
    if (this.currentModel === organName) {
      this.selectedPoints = [];
    }
    
    // 如果有场景引用，重新渲染
    if (this.modelRenderer && this.modelRenderer.renderer && this.modelRenderer.scene && this.modelRenderer.camera) {
      try {
        this.modelRenderer.renderer.render(this.modelRenderer.scene, this.modelRenderer.camera);
      } catch (error) {
        console.error('清除PLY数据后渲染失败:', error);
      }
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
    
    // 清除所有已选择的点位和法向量可见性状态
    this.selectedPoints = [];
    this._normalsVisibility = new Map();
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
  
  /**
   * 切换指定器官法向量的可见性
   * @param {string} organName - 器官名称
   * @returns {boolean} - 切换后的可见性状态
   */
  toggleNormalsVisibility(organName) {
    try {
      if (!this.modelRenderer || !this._initialized) {
        console.error('PlyRenderer未正确初始化');
        return false;
      }
      
      // 检查是否有该器官的法向量数据
      if (!this.vectorsObjects.has(organName)) {
        console.error(`未找到器官${organName}的法向量数据`);
        return false;
      }
      
      // 获取法向量对象并切换可见性
      const vectorsObject = this.vectorsObjects.get(organName);
      vectorsObject.visible = !vectorsObject.visible;
      
      // 更新可见性状态存储
      if (!this._normalsVisibility) {
        this._normalsVisibility = new Map();
      }
      this._normalsVisibility.set(organName, vectorsObject.visible);
      
      // 重新渲染场景
      if (this.modelRenderer && this.modelRenderer.renderer && this.modelRenderer.scene && this.modelRenderer.camera) {
        try {
          this.modelRenderer.renderer.render(this.modelRenderer.scene, this.modelRenderer.camera);
        } catch (error) {
          console.error('切换法向量可见性后渲染失败:', error);
        }
      }
      
      console.log(`器官${organName}的法向量可见性已切换为:`, vectorsObject.visible);
      return vectorsObject.visible;
    } catch (error) {
      console.error('切换法向量可见性时出错:', error);
      return false;
    }
  }
  
  /**
   * 获取指定器官法向量的可见性状态
   * @param {string} organName - 器官名称
   * @returns {boolean} - 当前可见性状态
   */
  getNormalsVisibility(organName) {
    if (!this._normalsVisibility) {
      return false;
    }
    return this._normalsVisibility.get(organName) || false;
  }
  
  /**
   * 检查是否已选择点位
   * @returns {boolean} - 是否已选择点位
   */
  hasSelectedPoints() {
    return this.selectedPoints && this.selectedPoints.length > 0;
  }
}

export default PlyRenderer;