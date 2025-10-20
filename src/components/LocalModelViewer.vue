<template>
  <div class="model-viewer-container">
    <div class="upload-section">
      <h3>上传OBJ模型</h3>
      <div class="upload-area" :class="{ 'dragging': isDragging }" @dragover.prevent @dragleave.prevent @drop="handleDrop">
        <input 
          ref="fileInput" 
          type="file" 
          accept=".obj" 
          style="display: none" 
          @change="handleFileSelect"
        />
        <div class="upload-icon">📁</div>
        <p>点击或拖拽OBJ文件到此处上传（支持多模型上传）</p>
        <button class="browse-btn" @click="triggerFileInput">浏览文件</button>
      </div>
      
      <div v-if="loading" class="loading-indicator">
        <div class="spinner"></div>
        <p>正在加载模型... {{ progress }}%</p>
      </div>
      
      <div v-if="error" class="error-message">
        {{ error }}
      </div>
      
      <!-- 调试信息面板 -->
      <div class="debug-panel" v-if="debugInfo">
        <h4>调试信息</h4>
        <p>容器尺寸: {{ debugInfo.containerSize }}</p>
        <p v-if="debugInfo.cameraPos">相机位置: {{ debugInfo.cameraPos }}</p>
      </div>
    </div>
    
    <div class="model-section">
      <!-- 模型列表和控制 -->
      <div class="models-control">
        <h4>已加载模型 ({{ loadedModels.length }})</h4>
        <div class="models-actions">
          <button @click="fitAllToScreen" class="control-btn" :disabled="loadedModels.length === 0">
            全部适应屏幕
          </button>
          <button @click="resetView" class="control-btn">重置视角</button>
          <button @click="clearAllModels" class="control-btn danger" :disabled="loadedModels.length === 0">
            清除所有模型
          </button>
        </div>
      </div>
      
      <!-- 模型列表 -->
      <div class="models-list" v-if="loadedModels.length > 0">
        <div 
          v-for="model in loadedModels" 
          :key="model.name" 
          class="model-item"
          :class="{ 'active': selectedModel === model.name }"
        >
          <div class="model-item-info">
            <span class="model-name">{{ model.name }}</span>
            <span class="model-status" :class="model.visible ? 'visible' : 'hidden'">
              {{ model.visible ? '显示' : '隐藏' }}
            </span>
          </div>
          <div class="model-item-controls">
            <button @click="toggleModelVisibility(model.name)" class="item-control-btn">
              {{ model.visible ? '隐藏' : '显示' }}
            </button>
            <button @click="fitToScreen(model.name)" class="item-control-btn">适应屏幕</button>
            <button @click="removeModel(model.name)" class="item-control-btn danger">移除</button>
          </div>
        </div>
      </div>
      
      <div id="model-container" class="model-container"></div>
    </div>
  </div>
</template>

<script>
import ModelRenderer from '../utils/modelRenderer.js';
import * as THREE from 'three'; // 添加THREE导入

export default {
  name: 'LocalModelViewer',
  data() {
    return {
      renderer: null,
      isDragging: false,
      loading: false,
      progress: 0,
      loadedModels: [], // 改为数组存储多个模型
      selectedModel: null, // 当前选中的模型名称
      error: null,
      debugInfo: null, // 用于存储调试信息
      resizeHandler: null
    };
  },
  mounted() {
    // 确保DOM完全渲染后再初始化渲染器
    this.$nextTick(() => {
      this.initRenderer();
    });
  },
  beforeUnmount() {
    // 清理资源
    if (this.renderer) {
      // 移除窗口大小变化事件监听器
      if (this.resizeHandler) {
        window.removeEventListener('resize', this.resizeHandler);
      }
      // 清除所有模型
      this.renderer.clearAllModels();
    }
  },
  methods: {
    // 初始化渲染器
    initRenderer() {
      try {
        const container = document.getElementById('model-container');
        if (!container) {
          console.error('模型容器元素未找到');
          this.error = '模型容器元素未找到';
          return;
        }
        
        // 确保容器有明确的尺寸
        container.style.width = '100%';
        container.style.height = '500px'; // 设置固定高度
        
        this.renderer = new ModelRenderer('model-container');
        console.log('渲染器初始化成功');
        
        // 记录调试信息
        this.debugInfo = {
          containerSize: `${container.clientWidth}x${container.clientHeight}`
        };
        
        // 添加resize处理函数
        this.resizeHandler = () => this.handleResize();
        window.addEventListener('resize', this.resizeHandler);
        
        // 添加辅助网格，帮助确定场景位置
        this.addHelperGrid();
      } catch (error) {
        console.error('初始化渲染器失败:', error);
        this.error = '渲染器初始化失败，请刷新页面重试';
      }
    },
    
    // 添加辅助网格
    addHelperGrid() {
      if (!this.renderer || !this.renderer.scene) return;
      
      // 创建网格辅助线
      const gridHelper = new THREE.GridHelper(100, 20, 0x888888, 0xcccccc);
      this.renderer.scene.add(gridHelper);
      
      // 创建坐标轴辅助线
      const axesHelper = new THREE.AxesHelper(50);
      this.renderer.scene.add(axesHelper);
      
      console.log('已添加辅助网格和坐标轴');
    },
    
    // 处理窗口大小变化
    handleResize() {
      if (this.renderer && this.renderer.onWindowResize) {
        this.renderer.onWindowResize();
        
        // 更新调试信息
        const container = document.getElementById('model-container');
        if (container) {
          this.debugInfo.containerSize = `${container.clientWidth}x${container.clientHeight}`;
        }
      }
    },
    
    // 触发文件选择对话框
    triggerFileInput() {
      this.$refs.fileInput.click();
    },
    
    // 处理文件选择
    handleFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        this.processModelFile(file);
      }
      // 清空input，允许重新选择同一文件
      event.target.value = '';
    },
    
    // 处理拖拽文件
    handleDrop(event) {
      event.preventDefault();
      this.isDragging = false;
      const file = event.dataTransfer.files[0];
      if (file) {
        this.processModelFile(file);
      }
    },
    
    // 处理模型文件 - 修改为不清除已有模型
    processModelFile(file) {
      // 检查文件类型
      if (!file.name.endsWith('.obj')) {
        alert('请上传OBJ格式的模型文件');
        return;
      }
      
      if (!this.renderer) {
        alert('渲染器未初始化，请刷新页面重试');
        return;
      }
      
      // 检查模型是否已存在
      const modelName = file.name.replace('.obj', '');
      if (this.loadedModels.some(model => model.name === modelName)) {
        alert(`模型"${modelName}"已存在，请重命名文件后再上传`);
        return;
      }
      
      this.loading = true;
      this.progress = 0;
      this.error = null;
      
      // 创建文件URL
      const fileUrl = URL.createObjectURL(file);
      
      // 模拟进度更新
      const progressInterval = setInterval(() => {
        if (this.progress < 90) {
          this.progress += Math.random() * 10;
        }
      }, 200);
      
      console.log('开始加载模型:', modelName);
      
      // 加载模型 - 使用中文名称显示
      const displayName = modelName; // 本地模型使用原文件名作为显示名称
      console.log(`准备加载本地模型，名称: ${displayName}`);
      this.renderer.loadModel(fileUrl, displayName)
        .then((object) => {
          clearInterval(progressInterval);
          this.progress = 100;
          
          console.log(`本地模型${displayName}加载成功，对象信息:`, object);
          console.log(`模型材质状态 - transparent: ${object.children[0]?.material?.transparent}, opacity: ${object.children[0]?.material?.opacity}`);
          
          // 将新模型添加到已加载列表
          this.loadedModels.push({
            name: modelName,
            file,
            visible: true // 默认显示
          });
          
          // 选中新添加的模型
          this.selectedModel = modelName;
          
          console.log('模型加载成功:', modelName);
          
          // 短暂延迟后执行适应屏幕
          setTimeout(() => {
            this.fitToScreen(modelName);
            this.loading = false;
            console.log(`模型${displayName}已适应屏幕，悬停交互功能已启用`);
          }, 100);
        })
        .catch(error => {
          clearInterval(progressInterval);
          this.loading = false;
          this.error = '加载模型失败: ' + error.message;
          console.error('加载模型失败:', error);
          alert('加载模型失败，请检查文件格式是否正确\n' + error.message);
        })
        .finally(() => {
          // 清理文件URL
          setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
        });
    },
    
    // 移除单个模型
    removeModel(modelName) {
      if (!this.renderer) return;
      
      // 从渲染器中移除模型
      this.renderer.removeModel(modelName);
      
      // 从已加载列表中移除
      this.loadedModels = this.loadedModels.filter(model => model.name !== modelName);
      
      // 如果移除的是当前选中的模型，选择第一个模型或清空选择
      if (this.selectedModel === modelName) {
        this.selectedModel = this.loadedModels.length > 0 ? this.loadedModels[0].name : null;
      }
      
      console.log('模型已移除:', modelName);
    },
    
    // 清除所有模型
    clearAllModels() {
      if (!this.renderer) return;
      
      this.renderer.clearAllModels();
      this.loadedModels = [];
      this.selectedModel = null;
      console.log('所有模型已清除');
    },
    
    // 切换模型可见性
    toggleModelVisibility(modelName) {
      const model = this.loadedModels.find(m => m.name === modelName);
      if (model) {
        model.visible = !model.visible;
        
        // 更新渲染器中的模型可见性
        const threeModel = this.renderer.models.get(modelName);
        if (threeModel) {
          threeModel.visible = model.visible;
        }
        
        console.log(`${modelName} 可见性已切换为: ${model.visible}`);
      }
    },
    
    // 重置视角
    resetView() {
      if (this.renderer && this.renderer.resetView) {
        this.renderer.resetView();
        // 更新调试信息
        this.updateCameraDebugInfo();
        console.log('视角已重置');
      }
    },
    
    // 适应屏幕 - 支持单个模型或所有模型
    fitToScreen(modelName) {
      if (!this.renderer) return;
      
      if (modelName) {
        // 适应单个模型
        try {
          const model = this.renderer.models.get(modelName);
          if (!model) return;
          
          console.log('开始适应屏幕计算 (单个模型):', modelName);
          
          // 计算模型边界
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          
          console.log('模型边界:', {
            min: box.min,
            max: box.max,
            size: size,
            center: center
          });
          
          // 检查模型是否有效（尺寸不为零）
          if (size.x === 0 && size.y === 0 && size.z === 0) {
            console.warn('模型尺寸为零，可能是模型文件问题');
            return;
          }
          
          // 计算合适的相机距离
          const maxDim = Math.max(size.x, size.y, size.z);
          const fov = this.renderer.camera.fov * (Math.PI / 180);
          let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
          cameraZ *= 2; // 增加缓冲，确保能看到完整模型
          
          console.log('计算的相机距离:', cameraZ);
          
          // 从上方45度角查看模型
          const offsetX = cameraZ * 0.7;
          const offsetY = cameraZ * 0.7;
          
          // 设置相机位置
          this.renderer.camera.position.set(center.x + offsetX, center.y + offsetY, center.z + cameraZ);
          
          // 确保相机看向模型中心
          this.renderer.camera.lookAt(center);
          
          // 更新控制器目标
          if (this.renderer.controls) {
            this.renderer.controls.target.copy(center);
            this.renderer.controls.update();
          }
          
          // 更新调试信息
          this.updateCameraDebugInfo();
          
          console.log('模型已适应屏幕:', modelName);
        } catch (error) {
          console.error('适应屏幕失败:', error);
          this.error = '调整视角失败: ' + error.message;
        }
      } else if (this.renderer.fitToScreen) {
        // 使用renderer的fitToScreen方法适应所有模型
        this.renderer.fitToScreen();
        this.updateCameraDebugInfo();
      }
    },
    
    // 适应所有模型到屏幕
    fitAllToScreen() {
      if (this.renderer && this.renderer.fitToScreen) {
        this.renderer.fitToScreen();
        this.updateCameraDebugInfo();
        console.log('所有模型已适应屏幕');
      }
    },
    
    // 更新相机调试信息
    updateCameraDebugInfo() {
      if (this.renderer && this.renderer.camera) {
        const pos = this.renderer.camera.position;
        this.debugInfo.cameraPos = `${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`;
      }
    }
  }
};
</script>

<style scoped>
/* 确保容器有足够的高度 */
html, body {
  height: 100%;
  margin: 0;
  padding: 0;
}

.model-viewer-container {
  display: flex;
  flex-direction: column;
  height: 100vh; /* 使用视口高度 */
  padding: 20px;
  gap: 20px;
  box-sizing: border-box;
}

.upload-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.upload-section h3 {
  margin-top: 0;
  color: #333;
}

.upload-area {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 30px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: white;
}

.upload-area:hover {
  border-color: #4a90e2;
}

.upload-area.dragging {
  border-color: #4a90e2;
  background-color: #f0f7ff;
}

.upload-icon {
  font-size: 48px;
  margin-bottom: 10px;
}

.upload-area p {
  margin: 10px 0;
  color: #666;
}

.browse-btn {
  background: #4a90e2;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s ease;
}

.browse-btn:hover {
  background: #357abd;
}

.loading-indicator {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.spinner {
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 4px solid #4a90e2;
  width: 30px;
  height: 30px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.model-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  min-height: 500px;
}

/* 模型控制区域 */
.models-control {
  margin-bottom: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.models-control h4 {
  margin: 0;
  color: #333;
}

.models-actions {
  display: flex;
  gap: 10px;
}

/* 模型列表 */
.models-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 15px;
  max-height: 150px;
  overflow-y: auto;
  padding: 5px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.model-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #e9ecef;
  transition: all 0.2s ease;
}

.model-item:hover {
  background: #e9ecef;
}

.model-item.active {
  border-color: #4a90e2;
  background: #f0f7ff;
}

.model-item-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.model-name {
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-status {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 3px;
  background: #e8f5e9;
  color: #2e7d32;
}

.model-status.hidden {
  background: #ffebee;
  color: #c62828;
}

.model-item-controls {
  display: flex;
  gap: 5px;
}

.item-control-btn {
  background: #6c757d;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s ease;
}

.item-control-btn:hover {
  background: #5a6268;
}

.item-control-btn.danger {
  background: #dc3545;
}

.item-control-btn.danger:hover {
  background: #c82333;
}

.control-btn {
  background: #6c757d;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s ease;
  font-size: 14px;
}

.control-btn:hover:not(:disabled) {
  background: #5a6268;
}

.control-btn.danger {
  background: #dc3545;
}

.control-btn.danger:hover:not(:disabled) {
  background: #c82333;
}

.control-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 关键修改：设置明确的高度和样式 */
.model-container {
  flex: 1;
  width: 100%;
  height: 500px;
  min-height: 500px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  border: 1px solid #ddd;
}

/* 错误提示样式 */
.error-message {
  color: #d9534f;
  padding: 10px;
  background: #fdf2f2;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
  margin-top: 10px;
}

/* 调试面板样式 */
.debug-panel {
  margin-top: 15px;
  padding: 10px;
  background: #e9ecef;
  border-radius: 4px;
  font-size: 12px;
  color: #495057;
}

.debug-panel h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
}

.debug-panel p {
  margin: 2px 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .model-viewer-container {
    padding: 10px;
    height: 100vh;
  }
  
  .models-control {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .models-actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  
  .model-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .model-item-controls {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  
  .model-container {
    min-height: 300px;
    height: 300px;
  }
}
</style>