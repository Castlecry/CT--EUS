<template>
  <div class="model-viewer-container">
    <header>
      <div class="header-content">
        <div class="logo-icon">🩻</div>
        <div class="title-container">
          <h1 class="main-title">3D 模型查看器</h1>
          <p class="subtitle">查看和交互医学影像 3D 模型</p>
        </div>
      </div>
      <router-link to="/upload" class="back-link">← 返回上传页</router-link>
    </header>

    <main class="main-content">
      <!-- 器官选择区域 - 作为可切换的视图 -->
      <div class="organ-selection-section">
        <div class="organ-selection-content">
          <!-- 切换按钮 -->
          <div class="view-toggle-buttons">
            <button @click="previousView" class="toggle-btn" :disabled="currentViewIndex === 0">
              ‹
            </button>
            <div class="view-indicator">
              {{ currentViewIndex + 1 }} / {{ totalViews }}
            </div>
            <button @click="nextView" class="toggle-btn" :disabled="currentViewIndex === totalViews - 1">
              ›
            </button>
          </div>
        
        <!-- 器官选择视图 -->
        <div v-if="currentViewType === 'select'" class="organ-selection-view">
          <div class="organ-panel-header" @click="togglePanel">
            <h3>选择器官模型</h3>
            <button
              class="toggle-btn"
              :title="isPanelExpanded ? '收起' : '展开'"
            >
              {{ isPanelExpanded ? '▲' : '▼' }}
            </button>
          </div>
          
          <div
            class="organ-buttons-container"
            :style="{ maxHeight: isPanelExpanded ? 'none' : '0px' }"
          >
            <div class="organ-buttons">
              <button
                v-for="(organ, key) in organList"
                :key="key"
                :class="['organ-btn', {
                  'loaded': loadedOrgans.includes(key),
                  'disabled': isDisabled(key),
                  'loading': loading[key]
                }]"
                @click="loadOrganModel(key)"
                :disabled="isDisabled(key)"
              >
                {{ organ }}
              </button>
            </div>
            <div class="organ-panel-footer">
              <button
                class="load-all-btn"
                @click="loadAllModels"
                :disabled="allLoaded || loadingAll"
              >
                <span v-if="loadingAll">加载中...</span>
                <span v-else>获取全部器官模型</span>
              </button>
            </div>
          </div>
        </div>
        
        <!-- 模型信息视图 -->
        <div v-else-if="currentViewType === 'info'" class="model-info-view">
          <div class="model-info-header">
            <h3>已加载的模型</h3>
            <span class="model-count">({{ loadedOrgans.length }})</span>
          </div>
          <div class="model-info-content">
            <div v-if="loadedOrgans.length === 0" class="no-models">
              <p>暂无已加载的模型</p>
              <p>请从器官选择视图加载模型</p>
            </div>
            <div v-else class="model-buttons-grid">
              <button 
                v-for="organKey in loadedOrgans" 
                :key="organKey"
                @click="switchToModel(organKey)"
                class="model-info-btn"
              >
                {{ organList[organKey] }}
              </button>
            </div>
          </div>
        </div>
        
        <!-- 模型详情视图 -->
        <div v-else-if="currentViewType === 'info-detail'" class="model-detail-view">
          <div class="model-info-header">
            <button class="back-btn" @click="returnToListView">← 返回列表</button>
            <h3>模型详情</h3>
          </div>
          <div class="model-info-content" v-if="selectedModelDetail">
            <div class="model-detail-card">
              <div class="model-detail-header">
                <h4>{{ selectedModelDetail.name }}</h4>
                <div class="model-controls-buttons">
                  <button 
                    class="visibility-btn" 
                    @click="toggleVisibility"
                    :class="{ 'visible': modelVisibility, 'hidden': !modelVisibility }"
                  >
                    {{ modelVisibility ? '隐藏模型' : '显示模型' }}
                  </button>
                  <button 
                    class="points-btn" 
                    @click="loadModelPoints"
                    :disabled="loadingPly"
                  >
                    {{ loadingPly ? '获取中...' : (hasPlyData ? '重新获取点位' : '获取点位') }}
                  </button>
                  <button 
                    class="draw-btn" 
                    @click="toggleDrawingMode"
                    :disabled="!hasPlyData"
                    :class="{ 'active': isDrawingMode }"
                  >
                    {{ isDrawingMode ? '结束选择' : '选择点位' }}
                  </button>
                  <button 
                    v-if="hasSelectedPoints" 
                    class="normals-btn" 
                    @click="toggleNormalsVisibility"
                    :class="{ 'active': normalsVisible }"
                  >
                    {{ normalsVisible ? '隐藏已选点位法向量' : '显示已选点位法向量' }}
                  </button>
                </div>
              </div>
              <div class="model-detail-content">
                <div class="detail-row">
                  <span class="detail-label">模型类型：</span>
                  <span class="detail-value">{{ selectedModelDetail.type }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">顶点数：</span>
                  <span class="detail-value">{{ selectedModelDetail.vertices.toLocaleString() }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">面数：</span>
                  <span class="detail-value">{{ selectedModelDetail.faces.toLocaleString() }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">文件大小：</span>
                  <span class="detail-value">{{ selectedModelDetail.fileSize }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">创建日期：</span>
                  <span class="detail-value">{{ selectedModelDetail.creationDate }}</span>
                </div>
                <div class="detail-row description">
                  <span class="detail-label">模型描述：</span>
                  <span class="detail-value">{{ selectedModelDetail.description }}</span>
                </div>
                
                <!-- 颜色选择器 -->
                <div class="color-selection-section">
                  <h5>模型颜色</h5>
                  
                  <!-- 预设颜色选择 -->
                  <div class="preset-colors">
                    <div 
                      v-for="(color, index) in presetColors" 
                      :key="index"
                      class="color-option"
                      :class="{ 'selected': index === selectedColorIndex && !showCustomColor }"
                      :style="{ backgroundColor: color.hex }"
                      @click="selectPresetColor(index)"
                      :title="color.name"
                    ></div>
                  </div>
                  
                  <!-- 自定义RGB颜色 -->
                  <div class="custom-color-section">
                    <div class="color-preview" :style="{ backgroundColor: rgbToHex(customRgb) }"></div>
                    <div class="rgb-inputs">
                      <div class="rgb-input-group">
                        <label>R</label>
                        <input 
                          type="number" 
                          :value="customRgb.r"
                          @input="handleRgbChange('r', $event.target.value)"
                          min="0" 
                          max="255"
                          placeholder="R"
                        >
                      </div>
                      <div class="rgb-input-group">
                        <label>G</label>
                        <input 
                          type="number" 
                          :value="customRgb.g"
                          @input="handleRgbChange('g', $event.target.value)"
                          min="0" 
                          max="255"
                          placeholder="G"
                        >
                      </div>
                      <div class="rgb-input-group">
                        <label>B</label>
                        <input 
                          type="number" 
                          :value="customRgb.b"
                          @input="handleRgbChange('b', $event.target.value)"
                          min="0" 
                          max="255"
                          placeholder="B"
                        >
                      </div>
                      <button class="apply-color-btn" @click="applyCustomColor">应用</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
      <!-- 模型查看区域 - 固定显示3D模型 -->
      <div class="model-viewer-section">
        <!-- 3D模型展示框 -->
        <div class="model-container-wrapper">
          <!-- 模型控制按钮 -->
          <div class="model-controls">
            <button @click="fitAllToScreen" class="control-btn" :disabled="loadedOrgans.length === 0">
              全部适应屏幕
            </button>
            <button @click="resetView" class="control-btn">重置视角</button>
            <button @click="clearAllModels" class="control-btn danger" :disabled="loadedOrgans.length === 0">
              清除所有模型
            </button>
          </div>
          <div class="model-container" id="modelContainer">
            <span class="placeholder-text">模型展示框字样</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import '../styles/modelviewer-page.css';
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getOrganModel, getOrganPlyModel } from '../api/dicom.js';
import ModelRenderer from '../utils/modelRenderer.js';
import PlyRenderer from '../utils/plyRenderer.js';
import {
  presetColors,
  rgbToHex,
  hexToRgb,
  isValidRgb,
  applyModelColor,
  toggleModelVisibility,
  getModelColor,
  getModelVisibility
} from '../utils/modeldetails.js';

// 器官名称映射表
const organList = {
  stomach: '胃',
  spleen: '脾脏',
  portal_vein_and_splenic_vein: '门静脉和脾静脉',
  pancreas: '胰腺',
  liver: '肝脏',
  kidney_right: '右肾',
  kidney_left: '左肾',
  inferior_vena_cava: '下腔静脉',
  esophagus: '食道',
  gallbladder: '胆囊',
  duodenum: '十二指肠',
  aorta: '主动脉',
  adrenal_gland_left: '左肾上腺',
  adrenal_gland_right: '右肾上腺'
};

// 状态管理
const route = useRoute();
const batchId = route.query.timestamp;
const renderer = ref(null);
const rendererReady = ref(false);
const loadedOrgans = ref([]);
const loading = ref({});
const loadingAll = ref(false);
const allLoaded = ref(false);
const isPanelExpanded = ref(true); // 控制面板展开/收起状态

// 视图切换状态
const currentViewIndex = ref(0);
const views = ref(['select']); // 默认只有选择器官视图
const currentViewType = computed(() => views.value[currentViewIndex.value]);
const totalViews = computed(() => views.value.length);

// 当前选中的模型详情
const selectedModelDetail = ref(null);
const selectedModelKey = ref(null);

// 模型显示控制
const modelVisibility = ref(true);

// PLY渲染器和点位显示状态
const plyRenderer = ref(null);
const loadingPly = ref(false);
const hasPlyData = ref(false);
const isDrawingMode = ref(false); // 线段绘制模式状态
const hasSelectedPoints = ref(false); // 是否已选择点位
const normalsVisible = ref(false); // 法向量是否可见

// 模型颜色控制
const selectedColorIndex = ref(0);
const customRgb = ref({ r: 204, g: 204, b: 255 });
const showCustomColor = ref(false);

// 监听模型选择变化，更新模型属性
watch(selectedModelKey, async (newKey) => {
  if (newKey && renderer.value && rendererReady.value) {
    // 获取模型当前显示状态
    const visibility = getModelVisibility(renderer.value, organList[newKey]);
    if (visibility !== null) {
      modelVisibility.value = visibility;
    }
    
    // 获取模型当前颜色
    const color = getModelColor(renderer.value, organList[newKey]);
    if (color && isValidRgb(color)) {
      customRgb.value = color;
      // 查找是否匹配预设颜色
      const hex = rgbToHex(color);
      const matchingIndex = presetColors.findIndex(c => c.hex === hex);
      selectedColorIndex.value = matchingIndex !== -1 ? matchingIndex : 0;
      showCustomColor.value = matchingIndex === -1;
    }
    
    // 检查是否已加载PLY数据
    if (plyRenderer.value && typeof plyRenderer.value.hasPlyData === 'function') {
      try {
        hasPlyData.value = plyRenderer.value.hasPlyData(organList[newKey]);
        // 如果切换了模型，退出绘制模式
        if (plyRenderer.value.getDrawingState && plyRenderer.value.getDrawingState() && plyRenderer.value.stopDrawing) {
          plyRenderer.value.stopDrawing();
          isDrawingMode.value = false;
        }
      } catch (error) {
        console.error('检查PLY数据状态时出错:', error);
        hasPlyData.value = false;
      }
    }
  } else {
    hasPlyData.value = false;
  }
});

// 模拟模型详情数据（实际应用中应从API获取）
const getModelDetail = (organKey) => {
  // 这里是模拟数据，实际应用中应从API获取真实的模型头部信息
  return {
    name: organList[organKey],
    type: 'OBJ模型',
    vertices: Math.floor(Math.random() * 50000) + 10000,
    faces: Math.floor(Math.random() * 30000) + 5000,
    fileSize: (Math.random() * 5 + 1).toFixed(2) + 'MB',
    creationDate: new Date().toLocaleDateString(),
    description: `这是${organList[organKey]}的3D模型，用于医学影像分析。`
  };
}

// 检查按钮是否应禁用
const isDisabled = (organKey) => {
  return loadedOrgans.value.includes(organKey) || loading.value[organKey] || allLoaded.value;
};

// 切换面板展开/收起
const togglePanel = () => {
  isPanelExpanded.value = !isPanelExpanded.value;
};

// 初始化渲染器
onMounted(async () => {
  if (!batchId) {
    alert('缺少批次ID，请从上传页面进入');
    return;
  }
  
  try {
    await nextTick();
    const container = document.getElementById('modelContainer');
    if (!container) {
      throw new Error('模型容器元素不存在');
    }
    const placeholder = container.querySelector('.placeholder-text');
    if (placeholder) {
      container.removeChild(placeholder);
    }
    
    // 初始化ModelRenderer
    renderer.value = new ModelRenderer('modelContainer');
    
    // 等待渲染器完全初始化
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 检查渲染器是否正确初始化
    if (!renderer.value || !renderer.value.scene || !renderer.value.camera || !renderer.value.renderer) {
      throw new Error('ModelRenderer初始化不完整');
    }
    
    rendererReady.value = true;
    
    // 初始化PLY渲染器
    try {
      plyRenderer.value = new PlyRenderer(renderer.value);
      // 等待PLY渲染器异步初始化完成
      if (plyRenderer.value._initPromise) {
        await plyRenderer.value._initPromise;
      }
      console.log('PLY渲染器初始化成功');
    } catch (plyError) {
      console.error('PLY渲染器初始化失败:', plyError);
      // 不抛出错误，允许主渲染器继续工作
      plyRenderer.value = null;
    }
  } catch (error) {
    console.error('初始化渲染器失败:', error);
    alert('无法初始化3D查看器，请刷新页面重试');
  }

  if (!organList || Object.keys(organList).length === 0) {
    console.error('器官列表为空，无法渲染按钮');
  }
  
  // 初始化视图列表
  updateViews();
});

// 清理资源
onUnmounted(() => {
  if (plyRenderer.value) {
    try {
      // 停止绘制模式
      if (plyRenderer.value.getDrawingState && typeof plyRenderer.value.getDrawingState === 'function' && 
          plyRenderer.value.getDrawingState() && plyRenderer.value.stopDrawing) {
        plyRenderer.value.stopDrawing();
      }
      if (plyRenderer.value.clearAllPlyData) {
        plyRenderer.value.clearAllPlyData();
      }
    } catch (error) {
      console.error('清理PLY渲染器资源失败:', error);
    } finally {
      plyRenderer.value = null;
    }
  }
  
  if (renderer.value && rendererReady.value) {
    try {
      renderer.value.clearAllModels();
      const container = document.getElementById('modelContainer');
      if (container && renderer.value.renderer && renderer.value.renderer.domElement) {
        container.removeChild(renderer.value.renderer.domElement);
      }
    } catch (error) {
      console.error('清理渲染器资源失败:', error);
    } finally {
      renderer.value = null;
      rendererReady.value = false;
    }
  }
});

// 加载单个器官模型
const loadOrganModel = async (organKey) => {
  if (!batchId || isDisabled(organKey) || !rendererReady.value) return;

  try {
    loading.value[organKey] = true;
    const result = await getOrganModel(batchId, organKey);
    // 使用中文名称进行显示
    const chineseName = organList[organKey];
    await renderer.value.loadModel(
      result.data,
      chineseName, // 使用中文名称作为模型名称
      result.coordinates
    );
    
    loadedOrgans.value.push(organKey);
    updateViews(); // 更新视图列表
    checkAllLoaded();
  } catch (error) {
    console.error(`加载${organList[organKey]}失败:`, error);
    const errorMessage = error.response?.data?.message || `加载失败，请重试`;
    alert(`加载${organList[organKey]}：${errorMessage}`);
  } finally {
    loading.value[organKey] = false;
  }
};

// 加载所有模型
const loadAllModels = async () => {
  if (!batchId || allLoaded.value || loadingAll.value || !rendererReady.value) return;

  try {
    loadingAll.value = true;
    const organKeys = Object.keys(organList);
    const unloadedOrgans = organKeys.filter(key => !loadedOrgans.value.includes(key));
    
    if (unloadedOrgans.length === 0) {
      alert('所有模型已经加载完成');
      return;
    }

    const failedModels = [];
    for (const organKey of unloadedOrgans) {
      if (loading.value[organKey]) continue;
      
      try {
        const result = await getOrganModel(batchId, organKey);
        // 使用中文名称进行显示
        const chineseName = organList[organKey];
        await renderer.value.loadModel(
          result.data,
          chineseName, // 使用中文名称作为模型名称
          result.coordinates
        );
        loadedOrgans.value.push(organKey);
        updateViews(); // 更新视图列表
      } catch (error) {
        console.error(`加载${organList[organKey]}失败:`, error);
        failedModels.push(organList[organKey]);
      }
    }

    checkAllLoaded();
    
    if (failedModels.length > 0) {
      alert(`批量加载完成，但以下模型加载失败：\n${failedModels.join('、')}\n\n您可以尝试单独加载这些模型。`);
    }
  } catch (error) {
    console.error('批量加载模型失败:', error);
    alert('批量加载过程中发生错误，请重试');
  } finally {
    loadingAll.value = false;
  }
};

// 检查是否所有模型都已加载
const checkAllLoaded = () => {
  allLoaded.value = Object.keys(organList).every(key =>
    loadedOrgans.value.includes(key)
  );
};

// 适应所有模型到屏幕
const fitAllToScreen = () => {
  if (renderer.value && renderer.value.fitToScreen) {
    renderer.value.fitToScreen();
    console.log('所有模型已适应屏幕');
  }
};

// 重置视角
const resetView = () => {
  if (renderer.value && renderer.value.resetView) {
    renderer.value.resetView();
    console.log('视角已重置');
  }
};

// 清除所有模型
const clearAllModels = () => {
  if (!renderer.value) return;
  
  // 清除PLY数据
  if (plyRenderer.value) {
    try {
      // 停止绘制模式
      if (plyRenderer.value.getDrawingState && typeof plyRenderer.value.getDrawingState === 'function' && 
          plyRenderer.value.getDrawingState() && plyRenderer.value.stopDrawing) {
        plyRenderer.value.stopDrawing();
        isDrawingMode.value = false;
      }
      if (plyRenderer.value.clearAllPlyData) {
        plyRenderer.value.clearAllPlyData();
      }
    } catch (error) {
      console.error('清除PLY数据时出错:', error);
    } finally {
      hasPlyData.value = false;
      hasSelectedPoints.value = false;
      normalsVisible.value = false;
    }
  }
  
  renderer.value.clearAllModels();
  loadedOrgans.value = [];
  allLoaded.value = false;
  updateViews(); // 更新视图列表
  console.log('所有模型已清除');
};

// 获取并渲染点位和法向量
const loadModelPoints = async () => {
  console.log('loadModelPoints开始执行', { 
    selectedModelKey: selectedModelKey.value,
    rendererReady: rendererReady.value,
    plyRenderer: !!plyRenderer.value,
    loadingPly: loadingPly.value
  });
  
  // 重置选择点位和法向量状态
  hasSelectedPoints.value = false;
  normalsVisible.value = false;
  
  if (!selectedModelKey.value || !rendererReady.value || loadingPly.value) {
    console.log('loadModelPoints基本条件不满足，提前返回');
    return;
  }
  
  // 检查PLY渲染器是否可用
  if (!plyRenderer.value) {
    console.error('PLY渲染器未初始化');
    alert('PLY渲染器未初始化，请刷新页面重试');
    return;
  }
  
  try {
    loadingPly.value = true;
    const organKey = selectedModelKey.value;
    const organName = organKey; // 使用英文名称调用API
    
    console.log(`准备加载${organList[organKey]}的点位数据`);
    
    // 等待PLY渲染器初始化完成
    if (plyRenderer.value._initPromise) {
      try {
        await plyRenderer.value._initPromise;
      } catch (initError) {
        console.error('PLY渲染器初始化失败:', initError);
        alert('PLY渲染器初始化失败，请刷新页面重试');
        return;
      }
    }
    
    // 如果正在绘制，先退出绘制模式
    if (plyRenderer.value.getDrawingState && typeof plyRenderer.value.getDrawingState === 'function' && 
        plyRenderer.value.getDrawingState() && plyRenderer.value.stopDrawing) {
      plyRenderer.value.stopDrawing();
      isDrawingMode.value = false;
    }
    
    // 调用新的PlyRenderer方法
    const success = await plyRenderer.value.loadAndRenderPlyPoints(organName, getOrganPlyModel);
    
    if (success) {
      hasPlyData.value = true;
      console.log(`成功加载${organList[organKey]}的点位数据`);
    } else {
      alert(`加载${organList[organKey]}的点位数据失败，请重试`);
    }
  } catch (error) {
    console.error('加载点位数据失败:', error);
    alert('加载点位数据时发生错误，请重试');
  } finally {
    loadingPly.value = false;
  }
};

// 切换线段绘制模式
const toggleDrawingMode = () => {
  console.log('toggleDrawingMode开始执行', { 
    selectedModelKey: selectedModelKey.value,
    rendererReady: rendererReady.value,
    plyRenderer: !!plyRenderer.value,
    hasPlyData: hasPlyData.value
  });

  if (!selectedModelKey.value || !rendererReady.value || !plyRenderer.value || !hasPlyData.value) {
    console.log('toggleDrawingMode条件不满足，提前返回');
    return;
  }

  const organKey = selectedModelKey.value;
  const organName = organKey; // 使用英文名称

  try {
    // 调用新的PlyRenderer的toggleDrawing方法
    const result = plyRenderer.value.toggleDrawing(organName);

    if (result !== undefined) {
      isDrawingMode.value = result;
      
      // 添加详细状态指示和日志
      if (isDrawingMode.value) {
        console.log('进入绘制模式：模型已固定，可在表面绘制平滑轨迹');
        plyRenderer.value.enableSnapToClosestPoint((point) => {
          console.log('吸附到最近点:', point);
        });
      } else {
        console.log('退出绘制模式：模型可自由旋转缩放');
        plyRenderer.value.disableSnapToClosestPoint();
      }

      // 检查是否已有选择的点位
      hasSelectedPoints.value = plyRenderer.value.hasSelectedPoints();
      console.log('检查已选择点位状态:', hasSelectedPoints.value);
    }
  } catch (error) {
    console.error('切换绘制模式失败:', error);
    alert('切换绘制模式时发生错误，请重试');
  }
};

// 切换法向量可见性
const toggleNormalsVisibility = () => {
  console.log('toggleNormalsVisibility开始执行', { 
    selectedModelKey: selectedModelKey.value,
    rendererReady: rendererReady.value,
    plyRenderer: !!plyRenderer.value
  });
  
  if (!selectedModelKey.value || !rendererReady.value || !plyRenderer.value) {
    console.log('toggleNormalsVisibility条件不满足，提前返回');
    return;
  }
  
  const organKey = selectedModelKey.value;
  const organName = organKey; // 使用英文名称
  
  try {
    // 调用新的PlyRenderer的toggleNormalsVisibility方法
    const result = plyRenderer.value.toggleNormalsVisibility(organName);
    
    if (result !== undefined) {
      normalsVisible.value = result;
      console.log(`法向量可见性已${normalsVisible.value ? '启用' : '禁用'}`);
    }
  } catch (error) {
    console.error('切换法向量可见性失败:', error);
    alert('切换法向量可见性时发生错误，请重试');
  }
};

// 更新视图列表
const updateViews = () => {
  const newViews = ['select']; // 器官选择视图
  if (loadedOrgans.value.length > 0) {
    newViews.push('info'); // 模型信息视图
    // 如果有选中的模型，添加详情视图
    if (selectedModelKey.value) {
      newViews.push('info-detail'); // 模型详情视图
    }
  }
  views.value = newViews;
  
  // 如果当前视图索引超出范围，重置为0
  if (currentViewIndex.value >= views.value.length) {
    currentViewIndex.value = 0;
  }
};

// 切换到模型详情视图
const switchToDetailView = (organKey) => {
  selectedModelKey.value = organKey;
  selectedModelDetail.value = getModelDetail(organKey);
  updateViews();
  // 确保视图切换到详情页
  nextTick(() => {
    const detailIndex = views.value.indexOf('info-detail');
    if (detailIndex !== -1) {
      currentViewIndex.value = detailIndex;
    }
  });
  console.log(`查看模型详情: ${organList[organKey]}`);
};

// 切换模型显示/隐藏
const toggleVisibility = () => {
  if (!selectedModelKey.value || !renderer.value || !rendererReady.value) return;
  
  const modelName = organList[selectedModelKey.value];
  const newVisibility = !modelVisibility.value;
  const success = toggleModelVisibility(renderer.value, modelName, newVisibility);
  
  if (success) {
    modelVisibility.value = newVisibility;
    console.log(`${modelName} ${newVisibility ? '显示' : '隐藏'}`);
  } else {
    alert(`无法${newVisibility ? '显示' : '隐藏'}模型，请重试`);
  }
};

// 选择预设颜色
const selectPresetColor = (index) => {
  selectedColorIndex.value = index;
  showCustomColor.value = false;
  const color = presetColors[index];
  applySelectedColor(color.rgb);
};

// 应用自定义RGB颜色
const applyCustomColor = () => {
  // 验证RGB值
  if (!isValidRgb(customRgb.value)) {
    alert('请输入有效的RGB值（0-255）');
    return;
  }
  applySelectedColor(customRgb.value);
};

// 应用选中的颜色到模型
const applySelectedColor = (rgb) => {
  if (!selectedModelKey.value || !renderer.value || !rendererReady.value) return;
  
  const modelName = organList[selectedModelKey.value];
  const success = applyModelColor(renderer.value, modelName, rgb);
  
  if (success) {
    console.log(`${modelName} 颜色已更新为:`, rgb);
  } else {
    alert('无法更新模型颜色，请重试');
  }
};

// 处理RGB输入变化
const handleRgbChange = (channel, value) => {
  // 转换为数字并限制范围
  let numValue = parseInt(value);
  if (isNaN(numValue)) numValue = 0;
  numValue = Math.max(0, Math.min(255, numValue));
  
  customRgb.value = {
    ...customRgb.value,
    [channel]: numValue
  };
  showCustomColor.value = true;
};

// 返回模型列表视图
const returnToListView = () => {
  // 清除选中的模型详情
  selectedModelKey.value = null;
  selectedModelDetail.value = null;
  updateViews();
  // 确保视图切换到列表页
  nextTick(() => {
    const infoIndex = views.value.indexOf('info');
    if (infoIndex !== -1) {
      currentViewIndex.value = infoIndex;
    }
  });
};

// 切换到上一个视图
const previousView = () => {
  if (currentViewIndex.value > 0) {
    currentViewIndex.value--;
  }
};

// 切换到下一个视图
const nextView = () => {
  if (currentViewIndex.value < views.value.length - 1) {
    currentViewIndex.value++;
  }
};

// 切换到特定模型
const switchToModel = (organKey, toDetail = true) => {
  if (toDetail) {
    // 切换到详情视图
    switchToDetailView(organKey);
  } else {
    // 聚焦到特定模型（3D模型在下方固定显示）
    console.log(`聚焦到模型: ${organList[organKey]}`);
    // 可以在这里添加聚焦到特定模型的逻辑
  }
};
</script>

