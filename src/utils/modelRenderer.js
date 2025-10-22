import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

class ModelRenderer {
  // 存储原始材质状态，用于恢复
  originalMaterials = new Map();
  // 当前悬停的模型
  hoveredModel = null;
  // 模型名称提示元素
  tooltipElement = null;
  // 射线检测器，用于检测鼠标悬停
  raycaster = null;
  // 鼠标向量，用于射线检测
  mouse = null;
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.models = new Map(); // 存储已加载的模型
    this.modelsGroup = new THREE.Group(); // 创建一个组来存放所有模型
    // 初始化射线检测器和鼠标向量
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.initScene();
    this.initMouseEvents();
    console.log('ModelRenderer初始化成功，容器ID:', containerId);
    console.log('容器尺寸:', this.container.clientWidth, 'x', this.container.clientHeight);
  }

  // 初始化Three.js场景
  initScene() {
    // 创建场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);
    
    // 添加模型组到场景
    this.scene.add(this.modelsGroup);

    // 创建相机
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.container.clientWidth / this.container.clientHeight || 1, // 防止除以零
      0.1,
      2000
    );
    this.camera.position.z = 50;

    // 创建渲染器
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true  // 启用透明度支持
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);  // 提高渲染质量
    this.renderer.shadowMap.enabled = true;  // 启用阴影
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;  // 柔和阴影
    this.container.appendChild(this.renderer.domElement);

    // 添加灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 30);
    this.scene.add(directionalLight);

    // 添加辅助网格线
    const gridHelper = new THREE.GridHelper(100, 100, 0xcccccc, 0xeeeeee);
    this.scene.add(gridHelper);

    // 添加坐标轴辅助线
    const axesHelper = new THREE.AxesHelper(50);
    this.scene.add(axesHelper);

    // 添加控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.enableZoom = true;
    this.controls.enableRotate = true;
    this.controls.enablePan = true;
    this.controls.autoRotate = false;
    this.controls.update();
    
    // 存储初始相机位置，用于reset方法
    this.initialCameraPosition = this.camera.position.clone();
    this.initialControlsTarget = this.controls.target.clone();

    // 处理窗口大小变化
    window.addEventListener('resize', () => this.onWindowResize());

    // 开始渲染循环
    this.animate();
  }

  // 初始化鼠标事件监听
  initMouseEvents() {
    // 创建提示框元素
    this.tooltipElement = document.createElement('div');
    this.tooltipElement.style.cssText = `
      position: absolute;
      background-color: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 14px;
      pointer-events: none;
      z-index: 9999; /* 提高z-index确保在所有元素之上 */
      display: none;
      white-space: nowrap;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    `;
    document.body.appendChild(this.tooltipElement);

    // 设置鼠标移动事件监听
    this.renderer.domElement.addEventListener('mousemove', (event) => this.onMouseMove(event));
    // 设置鼠标离开事件监听
    this.renderer.domElement.addEventListener('mouseleave', () => this.onMouseLeave());
    // 设置鼠标点击事件监听
    this.renderer.domElement.addEventListener('click', (event) => this.onMouseClick(event));
    console.log('鼠标事件监听已初始化');
  }

  // 鼠标移动事件处理
  onMouseMove(event) {
    // 计算鼠标在标准化设备坐标中的位置
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // 更新射线检测器
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 获取所有可交互的模型
    const modelObjects = Array.from(this.models.values());
    
    console.log(`射线检测前的模型数量: ${modelObjects.length}, 当前悬停模型: ${this.hoveredModel || '无'}`);
    
    // 射线检测 - 增加详细的调试信息
    const intersects = this.raycaster.intersectObjects(modelObjects, true);

    if (intersects.length > 0) {
      console.log('检测到模型相交:', intersects.length);
      // 找到相交的最前面的物体
      const intersectedObject = intersects[0].object;
      console.log('相交物体:', intersectedObject.name || 'unnamed', 
                '材质类型:', intersectedObject.material?.constructor?.name || '未知');
      console.log('相交点坐标:', 
                `x: ${intersects[0].point.x.toFixed(2)}, ` +
                `y: ${intersects[0].point.y.toFixed(2)}, ` +
                `z: ${intersects[0].point.z.toFixed(2)}`);
      
      // 调试：检查相交物体的材质状态
      if (intersectedObject.material) {
        console.log('相交物体材质状态:', {
          transparent: intersectedObject.material.transparent,
          opacity: intersectedObject.material.opacity,
          color: intersectedObject.material.color?.getHexString() || '未知'
        });
      }
      
      // 找到对应的模型 - 简化方法
      let currentModel = null;
      let currentModelObject = null;
      
      // 方法1: 从相交物体向上查找所属模型
      console.log('开始查找相交物体所属模型...');
      
      // 直接遍历模型，检查相交物体是否在模型内部
      for (const [name, model] of this.models.entries()) {
        // 简化检测：直接使用intersectObject检查模型
        const directIntersects = this.raycaster.intersectObject(model, false);
        if (directIntersects.length > 0) {
          currentModel = name;
          currentModelObject = model;
          console.log(`方法1 - 直接检测到模型: ${name}`);
          break;
        }
      }
      
      // 方法2: 如果方法1失败，使用父级查找
      if (!currentModel) {
        console.log('方法1失败，使用父级查找...');
        let parent = intersectedObject.parent;
        while (parent) {
          for (const [name, model] of this.models.entries()) {
            if (parent === model) {
              currentModel = name;
              currentModelObject = model;
              console.log(`方法2 - 通过父级找到模型: ${name}`);
              break;
            }
          }
          if (currentModel) break;
          parent = parent.parent;
        }
      }
      
      // 方法3: 如果前两种方法都失败，使用原始遍历方法
      if (!currentModel) {
        console.log('方法2失败，使用遍历查找...');
        for (const [name, model] of this.models.entries()) {
          let found = false;
          model.traverse((child) => {
            if (child === intersectedObject) {
              found = true;
            }
          });
          if (found) {
            currentModel = name;
            currentModelObject = model;
            console.log(`方法3 - 通过遍历找到模型: ${name}`);
            break;
          }
        }
      }

      if (currentModel && currentModelObject) {
        console.log(`✓ 成功识别模型: ${currentModel}`);
        
        // 调试：检查模型的基本信息
        let meshCount = 0;
        currentModelObject.traverse(child => {
          if (child.isMesh) meshCount++;
        });
        console.log(`模型包含${meshCount}个网格`);
        
        // 检查是否需要更新悬停状态
        if (this.hoveredModel !== currentModel) {
          console.log(`🔄 切换悬停模型: ${this.hoveredModel || '无'} -> ${currentModel}`);
          // 恢复之前悬停的模型
          this.resetHoveredModel();
          // 设置新的悬停模型
          this.hoveredModel = currentModel;
          // 立即应用高亮效果
          this.highlightModel(currentModel, event.clientX, event.clientY);
        } else {
          // 相同模型，只需更新提示框位置
          console.log(`同模型悬停，更新提示框位置`);
          this.tooltipElement.style.left = `${event.clientX + 10}px`;
          this.tooltipElement.style.top = `${event.clientY - 30}px`;
        }
      } else {
        console.log('❌ 未找到相交物体所属的模型');
        // 强制重置材质状态
        this.resetHoveredModel();
      }
    } else {
      console.log('❌ 没有检测到模型相交');
      // 没有相交的物体，恢复所有模型
      this.resetHoveredModel();
    }
  }

  // 鼠标离开事件处理
  onMouseLeave() {
    this.resetHoveredModel();
  }

  // 鼠标点击事件处理
  onMouseClick(event) {
    // 计算鼠标在标准化设备坐标中的位置
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // 更新射线检测器
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 获取所有可交互的模型
    const modelObjects = Array.from(this.models.values());
    
    // 射线检测
    const intersects = this.raycaster.intersectObjects(modelObjects, true);

    if (intersects.length > 0) {
      console.log('检测到模型点击:', intersects.length);
      // 找到相交的最前面的物体
      const intersectedObject = intersects[0].object;
      
      // 找到对应的模型
      let currentModel = null;
      
      // 遍历模型，检查相交物体是否在模型内部
      for (const [name, model] of this.models.entries()) {
        let found = false;
        model.traverse((child) => {
          if (child === intersectedObject) {
            found = true;
          }
        });
        if (found) {
          currentModel = name;
          break;
        }
      }
      
      if (currentModel) {
        console.log(`✓ 成功识别点击模型: ${currentModel}`);
        // 切换模型颜色状态
        this.toggleModelColorState(currentModel);
      }
    }
  }

  // 切换模型颜色状态
  toggleModelColorState(modelName) {
    const model = this.models.get(modelName);
    if (!model) return;

    console.log(`切换模型${modelName}的颜色状态`);

    model.traverse((child) => {
      if (child.isMesh) {
        // 切换颜色状态
        child.material._isPresetColor = !child.material._isPresetColor;
        
        // 根据状态设置颜色和透明度
        if (child.material._isPresetColor) {
          // 切换到预设颜色，保持当前透明度状态
          child.material.color.copy(child.material._presetColor);
        } else {
          // 切换回初始淡蓝色，恢复初始透明度
          child.material.color.copy(child.material._initialColor);
        }
        
        // 确保透明度正确设置
        if (this.hoveredModel === modelName) {
          // 悬停状态 - 实体化
          child.material.transparent = false;
          child.material.opacity = 1.0;
        } else {
          // 非悬停状态 - 透明
          child.material.transparent = true;
          child.material.opacity = 0.6;
        }
        
        child.material.needsUpdate = true;
        console.log(`已切换${modelName}的网格${child.name || 'unnamed'}颜色状态，预设颜色: ${child.material._isPresetColor}`);
      }
    });
    
    // 强制重新渲染
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  // 突出显示指定模型，实体化显示（不透明）
  highlightModel(modelName, mouseX, mouseY) {
    const targetModel = this.models.get(modelName);
    if (!targetModel) {
      console.log(`模型${modelName}不存在`);
      return;
    }

    console.log(`高亮模型${modelName}，实体化显示`);
    
    // 存储当前悬停模型的原始材质状态
    this.originalMaterials.clear();
    
    // 只处理悬停的模型，其他模型保持不变
    const materials = [];
    let meshCount = 0;
    
    targetModel.traverse((child) => {
      if (child.isMesh) {
        meshCount++;
        
        // 保存当前材质状态
        materials.push({
          object: child,
          originalOpacity: child.material.opacity,
          originalTransparent: child.material.transparent,
          originalColor: child.material._isPresetColor ? child.material._presetColor.clone() : child.material._initialColor.clone(),
          isPresetColor: child.material._isPresetColor
        });
        
        // 保持当前颜色，设置为不透明（实体化）
        const currentColor = child.material._isPresetColor ? child.material._presetColor : child.material._initialColor;
        const newMaterial = new THREE.MeshPhongMaterial({
          color: currentColor,
          transparent: false, // 实体化显示
          opacity: 1.0, // 完全不透明
          side: THREE.DoubleSide,
          emissive: 0x000000,
          emissiveIntensity: 0,
          shininess: 30,
          specular: 0x222222,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1
        });
        
        // 复制状态标记
        newMaterial._isPresetColor = child.material._isPresetColor;
        newMaterial._initialColor = child.material._initialColor;
        newMaterial._presetColor = child.material._presetColor;
        
        // 完全替换材质
        child.material = newMaterial;
        console.log(`为${modelName}的网格${child.name || 'unnamed'}加深透明度至0.3`);
        
        // 强制材质更新
        child.material.needsUpdate = true;
      }
    });
    
    // 保存材质状态
    this.originalMaterials.set(modelName, materials);
    console.log(`${modelName}处理完成，修改了${meshCount}个网格的材质`);
    
    // 强制场景重新渲染
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    
    // 重新设置动画循环确保持续渲染
    this.renderer.setAnimationLoop(() => {
      this.renderer.render(this.scene, this.camera);
    });

    // 显示提示框
    console.log('显示模型名称:', modelName);
    this.tooltipElement.textContent = modelName;
    this.tooltipElement.style.display = 'block';
    this.tooltipElement.style.left = `${mouseX + 10}px`;
    this.tooltipElement.style.top = `${mouseY - 30}px`;
  }

  // 重置悬停模型的材质状态
  resetHoveredModel() {
    if (!this.hoveredModel) return;

    console.log(`重置悬停状态，恢复模型${this.hoveredModel}的原始材质`);

    // 只恢复悬停模型的原始材质状态
    const materials = this.originalMaterials.get(this.hoveredModel);
    if (materials) {
      console.log(`恢复模型${this.hoveredModel}的材质状态，共${materials.length}个网格`);
      materials.forEach(({ object, originalOpacity, originalTransparent, originalColor, isPresetColor }) => {
        try {
          // 为每个网格创建新的原始材质实例
          const newOriginalMaterial = new THREE.MeshPhongMaterial({
            color: originalColor,
            transparent: true, // 保持透明状态
            opacity: 0.6, // 恢复为初始透明度0.6
            side: THREE.DoubleSide,
            emissive: 0x000000, // 重置发光为黑色（无发光）
            emissiveIntensity: 0, // 重置发光强度为0
            shininess: 30, // 添加光泽度
            specular: 0x222222, // 添加镜面反射
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
          });
          
          // 存储状态信息
          newOriginalMaterial._isPresetColor = isPresetColor;
          newOriginalMaterial._initialColor = object.material._initialColor;
          newOriginalMaterial._presetColor = object.material._presetColor;
          
          // 完全替换材质
          object.material = newOriginalMaterial;
          
          // 强制更新材质
          object.material.needsUpdate = true;
          
          console.log(`已恢复${this.hoveredModel}的网格材质，颜色: ${originalColor.getHexString()}, 透明: ${originalTransparent}, 不透明度: 0.6`);
        } catch (error) {
          console.error(`恢复材质时出错:`, error);
        }
      });
    }

    // 清除原始材质缓存
    this.originalMaterials.clear();
    // 隐藏提示框
    this.tooltipElement.style.display = 'none';
    // 重置悬停状态
    this.hoveredModel = null;
    
    // 强制立即渲染
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    
    // 恢复正常动画循环
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  // 窗口大小变化时调整
  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // 渲染循环
  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // 加载并添加模型
  loadModel(url, organName, coordinates = { x: 0, y: 0, z: 0 }) {
    return new Promise((resolve, reject) => {
      if (this.models.has(organName)) {
        console.log(`模型${organName}已加载，跳过`);
        resolve(this.models.get(organName));
        return;
      }

      const loader = new OBJLoader();
      console.log(`开始加载模型: ${organName}，URL: ${url}`);
      
      loader.load(
        url,
        (object) => {
          try {
            // 设置模型位置
            object.position.set(
              coordinates.x || 0,
              coordinates.y || 0,
              coordinates.z || 0
            );
            
            // 为模型添加材质，确保可交互性
            object.traverse((child) => {
              if (child.isMesh) {
                // 使用统一的淡蓝色透明作为初始状态
                const initialColor = 0x87CEEB; // 淡蓝色
                const presetColor = this.getRandomColor(); // 获取预设颜色，用于点击后显示
                
                // 确保材质可交互，设置透明属性
                child.material = new THREE.MeshPhongMaterial({
                  color: initialColor,
                  transparent: true, // 设置为true以便后续可以调整透明度
                  opacity: 0.6, // 初始透明度为0.6
                  side: THREE.DoubleSide,
                  emissive: 0x000000, // 初始无发光
                  emissiveIntensity: 0, // 发光强度为0
                  shininess: 30, // 添加光泽度
                  specular: 0x222222, // 添加镜面反射
                  polygonOffset: true, // 添加多边形偏移以避免z-fighting
                  polygonOffsetFactor: 1,
                  polygonOffsetUnits: 1
                });
                
                // 存储初始颜色和预设颜色
                child.material._initialColor = new THREE.Color(initialColor);
                child.material._presetColor = new THREE.Color(presetColor);
                child.material._isPresetColor = false; // 标记当前是否为预设颜色
                
                // 确保几何体有法线
                if (!child.geometry.attributes.normal) {
                  child.geometry.computeVertexNormals();
                }
                
                console.log(`模型${organName}的子网格${child.name || 'unnamed'}设置了材质和颜色`);
              }
            });
            
            // 设置模型名称，帮助调试和识别
            object.name = organName;
            console.log(`模型${organName}设置了名称和材质`);

            // 添加模型到组，而不是直接添加到场景
            this.modelsGroup.add(object);
            this.models.set(organName, object);
            
            console.log(`模型${organName}加载成功，开始调整视角`);
            // 调整相机以适应模型
            this.fitToScreen();
            
            resolve(object);
          } catch (error) {
            console.error(`模型${organName}处理失败:`, error);
            reject(error);
          }
        },
        (xhr) => {
          console.log(`加载 ${organName}: ${(xhr.loaded / xhr.total) * 100}%`);
        },
        (error) => {
          console.error(`加载 ${organName} 失败:`, error);
          reject(error);
        }
      );
    });
  }

  // 移除模型
  removeModel(organName) {
    if (this.models.has(organName)) {
      const model = this.models.get(organName);
      this.modelsGroup.remove(model);
      this.models.delete(organName);
      console.log(`移除模型: ${organName}`);
      // 移除后重新调整视角
      this.fitToScreen();
    }
  }

  // 生成随机颜色
  getRandomColor() {
    const colors = [
      0x4a90e2, 0x5cb85c, 0xf0ad4e, 0xd9534f, 0x7b68ee,
      0x66c2a5, 0x8da0cb, 0xe78ac3, 0xa6d854, 0xffd92f
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // 清除所有模型
  clearAllModels() {
    this.models.forEach((model) => {
      this.modelsGroup.remove(model);
    });
    this.models.clear();
    console.log('已清除所有模型');
  }

  // 获取已加载的模型列表
  getLoadedModels() {
    return Array.from(this.models.keys());
  }
  
  // 修改模型颜色
  changeModelColor(modelName, rgb) {
    const model = this.models.get(modelName);
    if (!model) {
      console.error(`模型${modelName}不存在`);
      return false;
    }
    
    const color = new THREE.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255);
    let success = false;
    
    model.traverse((child) => {
      if (child.isMesh) {
        try {
          // 保存原始颜色
          if (!child.material._originalColor) {
            child.material._originalColor = child.material.color.clone();
          }
          
          // 设置新颜色
          child.material.color.copy(color);
          child.material.needsUpdate = true;
          success = true;
        } catch (error) {
          console.error(`修改模型${modelName}的网格颜色失败:`, error);
        }
      }
    });
    
    if (success) {
      console.log(`模型${modelName}颜色已更改为RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`);
    }
    return success;
  }
  
  // 切换模型显示/隐藏
  toggleModelVisibility(modelName, isVisible) {
    const model = this.models.get(modelName);
    if (!model) {
      console.error(`模型${modelName}不存在`);
      return false;
    }
    
    let success = false;
    
    model.traverse((child) => {
      if (child.isMesh) {
        try {
          child.visible = isVisible;
          success = true;
        } catch (error) {
          console.error(`切换模型${modelName}的可见性失败:`, error);
        }
      }
    });
    
    if (success) {
      console.log(`模型${modelName}可见性已设置为: ${isVisible}`);
    }
    return success;
  }
  
  // 获取模型当前颜色
  getModelColor(modelName) {
    const model = this.models.get(modelName);
    if (!model) {
      console.error(`模型${modelName}不存在`);
      return null;
    }
    
    // 尝试获取第一个网格的颜色
    let color = null;
    model.traverse((child) => {
      if (child.isMesh && !color) {
        try {
          const materialColor = child.material._originalColor || child.material.color;
          color = {
            r: Math.round(materialColor.r * 255),
            g: Math.round(materialColor.g * 255),
            b: Math.round(materialColor.b * 255)
          };
        } catch (error) {
          console.error(`获取模型${modelName}的网格颜色失败:`, error);
        }
      }
    });
    
    return color;
  }
  
  // 获取模型当前可见性
  getModelVisibility(modelName) {
    const model = this.models.get(modelName);
    if (!model) {
      console.error(`模型${modelName}不存在`);
      return null;
    }
    
    // 尝试获取第一个网格的可见性
    let visibility = null;
    model.traverse((child) => {
      if (child.isMesh && visibility === null) {
        try {
          visibility = child.visible;
        } catch (error) {
          console.error(`获取模型${modelName}的可见性失败:`, error);
        }
      }
    });
    
    return visibility;
  }
  
  // 重置控制器视角
  resetView() {
    if (this.camera && this.initialCameraPosition) {
      this.camera.position.copy(this.initialCameraPosition);
    }
    if (this.controls && this.initialControlsTarget) {
      this.controls.target.copy(this.initialControlsTarget);
      this.controls.update();
    }
    console.log('重置相机视角');
  }
  
  // 调整相机以适应所有模型
  fitToScreen() {
    try {
      if (this.models.size === 0) {
        console.log('没有模型需要调整视角');
        return;
      }
      
      // 计算所有模型的边界框
      const boundingBox = new THREE.Box3();
      
      this.models.forEach((model) => {
        const modelBox = new THREE.Box3().setFromObject(model);
        boundingBox.union(modelBox);
      });
      
      // 获取边界框大小和中心点
      const size = boundingBox.getSize(new THREE.Vector3());
      const center = boundingBox.getCenter(new THREE.Vector3());
      
      // 检查边界框是否有效
      if (size.x === 0 && size.y === 0 && size.z === 0) {
        console.warn('计算得到的模型边界框无效，使用默认视角');
        // 为避免相机位置异常，设置一个合理的默认位置
        this.camera.position.set(0, 0, 50);
        this.controls.target.set(0, 0, 0);
        this.camera.updateProjectionMatrix();
        this.controls.update();
        return;
      }
      
      console.log('模型边界框大小:', size.x, size.y, size.z);
      console.log('模型中心点:', center.x, center.y, center.z);
      
  // 直接将相机放在模型中心点z轴正方向300处，确保模型在视野内
  this.camera.position.set(center.x, center.y, center.z + 300);
  this.controls.target.copy(center);
  this.camera.updateProjectionMatrix();
  this.controls.update();
  console.log('相机位置调整完成:', this.camera.position);
    } catch (error) {
      console.error('调整视角时出错:', error);
    }
  }
}

export default ModelRenderer;