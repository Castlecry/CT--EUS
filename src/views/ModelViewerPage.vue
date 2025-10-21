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
      <!-- 器官选择区域 -->
      <div class="organ-selection-section">
        <div class="organ-panel-header" @click="togglePanel">
          <h3>选择器官模型</h3>
          <button
            class="toggle-btn"
            :title="isPanelExpanded ? '收起' : '展开'"
          >
            {{ isPanelExpanded ? '▲' : '▼' }}
          </button>
        </div>
        
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
      <!-- 模型查看区域 -->
      <div class="model-viewer-section">
        <div class="view-toggle-container">
          <!-- 视图内容 -->
          <div class="view-content">
            <!-- 3D模型展示框 -->
            <div v-if="currentViewType === '3d'" class="model-container-wrapper">
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
            
            <!-- 模型信息展示框 -->
            <div v-else-if="currentViewType === 'info'" class="model-info-container">
              <div class="model-info-header">
                <h3>已加载的模型</h3>
                <span class="model-count">({{ loadedOrgans.length }})</span>
              </div>
              <div class="model-info-content">
                <div v-if="loadedOrgans.length === 0" class="no-models">
                  <p>暂无已加载的模型</p>
                  <p>请从上方选择器官模型进行加载</p>
                </div>
                <div v-else class="model-buttons-grid">
                  <button 
                    v-for="organKey in loadedOrgans" 
                    :key="organKey"
                    @click="switchToModel(organKey, false)"
                    class="model-info-btn"
                  >
                    {{ organList[organKey] }}
                  </button>
                </div>
              </div>
            </div>
            
            <!-- 模型详情展示框 -->
            <div v-else-if="currentViewType === 'info-detail'" class="model-info-container">
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
                      <button class="view-model-btn" @click="switchToModel(selectedModelKey)">
                        查看3D模型
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
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getOrganModel } from '../api/dicom.js';
import ModelRenderer from '../utils/modelRenderer.js';
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
const views = ref(['3d']); // 默认只有3D视图
const currentViewType = computed(() => views.value[currentViewIndex.value]);
const totalViews = computed(() => views.value.length);

// 当前选中的模型详情
const selectedModelDetail = ref(null);
const selectedModelKey = ref(null);

// 模型显示控制
const modelVisibility = ref(true);

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
    renderer.value = new ModelRenderer('modelContainer');
    rendererReady.value = true;
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
  
  renderer.value.clearAllModels();
  loadedOrgans.value = [];
  allLoaded.value = false;
  updateViews(); // 更新视图列表
  console.log('所有模型已清除');
};

// 更新视图列表
const updateViews = () => {
  const newViews = ['3d'];
  if (loadedOrgans.value.length > 0) {
    newViews.push('info');
    // 如果有选中的模型，添加详情视图
    if (selectedModelKey.value) {
      newViews.push('info-detail');
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
const switchToModel = (organKey, to3D = true) => {
  if (to3D) {
    // 切换到3D视图
    currentViewIndex.value = 0;
    // 可以在这里添加聚焦到特定模型的逻辑
    console.log(`切换到模型: ${organList[organKey]}`);
  } else {
    // 切换到详情视图
    switchToDetailView(organKey);
  }
};
</script>

<style scoped>
/* --- 最终修复版样式 --- */

/* 全局与重置 */
:global(*) {
  box-sizing: border-box;
}

:global(html), :global(body) {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

:global(#app) {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* 根容器：使用 CSS Grid 布局，这是最稳健的方案 */
.model-viewer-container {
  display: grid;
  grid-template-rows: auto 1fr; /* 头部高度自适应，主内容区占据所有剩余空间 */
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* 头部 */
header {
  grid-row: 1 / 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 30px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  border-bottom: 1px solid #e9ecef;
}
.header-content { display: flex; align-items: center; gap: 15px; }
.logo-icon { font-size: 2rem; }
.title-container .main-title { color: #2c3e50; margin: 0; font-size: 1.6rem; }
.title-container .subtitle { color: #6c757d; margin: 4px 0 0; font-size: 0.9rem; }
.back-link { color: #4a90e2; text-decoration: none; font-weight: 500; padding: 8px 16px; border-radius: 6px; transition: background-color 0.2s ease; }
.back-link:hover { background-color: #f1f7ff; }

/* 主内容区域 */
.main-content {
  grid-row: 2 / 3;
  display: flex;
  flex-direction: column;
  padding: 20px 0;
  gap: 20px;
  min-height: 0;
  overflow: hidden;
  width: 100vw;
  height: 100%;
  flex: 1;
  margin: 0;
  box-sizing: border-box;
  position: relative;
  max-width: 100vw;
  left: 0;
  right: 0;
}

/* 器官选择区域 */
.organ-selection-section {
  flex-shrink: 0;
  background-color: white;
  border-radius: 0;
  padding: 15px 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  width: 100%;
  margin: 0;
  max-width: 100%;
  box-sizing: border-box;
  position: relative;
  left: 0;
  right: 0;
}

/* 视图切换按钮（在器官选择区域内） */
.organ-selection-section .view-toggle-buttons {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 15px 0;
  margin-bottom: 10px;
  background-color: #f8f9fa;
  border-radius: 6px;
}
.organ-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 15px;
  border-bottom: 1px solid #f1f2f6;
  cursor: pointer;
}
.organ-panel-header h3 { margin: 0; color: #2c3e50; font-size: 1.1rem; }
.toggle-btn { background: none; border: none; font-size: 1.5rem; line-height: 1; cursor: pointer; color: #6c757d; padding: 0; }

.organ-buttons-container {
  overflow: hidden;
  transition: max-height 0.35s ease-in-out;
}

.organ-buttons { display: flex; flex-wrap: wrap; gap: 12px; padding: 20px 0 10px; }
.organ-btn {
  flex: 1 1 auto;
  min-width: 110px;
  background-color: #f8f9fa; border: 1px solid #dee2e6;
  padding: 10px 8px; border-radius: 6px; cursor: pointer; transition: all 0.2s;
  font-size: 0.9rem; text-align: center;
}
.organ-btn:hover:not(:disabled) { border-color: #4a90e2; color: #4a90e2; background-color: #f1f7ff; }
.organ-btn.loaded { background-color: #e8f5e9; border-color: #c3e6cb; color: #155724; font-weight: 500; }
.organ-btn:disabled { cursor: not-allowed; opacity: 0.7; }

.organ-panel-footer { display: flex; justify-content: center; padding-top: 20px; border-top: 1px solid #f1f2f6; }
.load-all-btn { background-color: #4a90e2; color: white; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 0.95rem; transition: background-color 0.2s; }
.load-all-btn:hover:not(:disabled) { background-color: #357abd; }
.load-all-btn:disabled { background-color: #6c757d; cursor: not-allowed; opacity: 0.8; }

/* 模型查看区域 */
.model-viewer-section {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  left: 0;
  right: 0;
  max-width: 100%;
}

/* 视图切换容器 */
.view-toggle-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  overflow: hidden;
  height: 100%;
  min-height: 0;
  width: 100%;
}

.toggle-btn {
  background: #6c757d;
  color: white;
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 18px;
  transition: background 0.3s ease;
  margin: 0 10px;
}

.toggle-btn:hover:not(:disabled) {
  background: #5a6268;
}

.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.view-indicator {
  font-size: 14px;
  color: #6c757d;
  min-width: 40px;
  text-align: center;
}

/* 视图内容 */
.view-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
  height: 100%;
  width: 100%;
  display: flex; /* 添加flex布局 */
  flex-direction: column; /* 垂直方向布局 */
}

/* 模型信息展示框 */
.model-info-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: white;
  min-height: 450px;
  flex: 1; /* 占据所有可用空间 */
}

.model-info-header {
  display: flex;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #e9ecef;
  gap: 15px;
}

.model-info-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.1rem;
  flex: 1;
}

.model-count {
  margin-left: 10px;
  color: #6c757d;
  font-size: 0.9rem;
}

.back-btn {
  background: #6c757d;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s ease;
  font-size: 14px;
}

.back-btn:hover {
  background: #5a6268;
}

.model-info-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  height: 100%; /* 确保高度占满 */
}

.no-models {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6c757d;
  text-align: center;
}

.no-models p {
  margin: 5px 0;
}

.model-buttons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 15px;
}

/* 模型详情卡片样式 */
.model-detail-card {
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.model-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e9ecef;
  flex-wrap: wrap;
  gap: 10px;
}

.model-controls-buttons {
  display: flex;
  gap: 10px;
}

.model-detail-header h4 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.2rem;
}

.view-model-btn {
  background-color: #4a90e2;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s ease;
}

.view-model-btn:hover {
  background-color: #357abd;
}

.visibility-btn {
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  border: 1px solid #dee2e6;
}

.visibility-btn.visible {
  background-color: #28a745;
  color: white;
  border-color: #28a745;
}

.visibility-btn.visible:hover {
  background-color: #218838;
  border-color: #1e7e34;
}

.visibility-btn.hidden {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}

.visibility-btn.hidden:hover {
  background-color: #5a6268;
  border-color: #545b62;
}

.detail-row {
  display: flex;
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e9ecef;
}

.detail-row:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.detail-label {
  font-weight: 500;
  color: #495057;
  min-width: 100px;
  flex-shrink: 0;
}

.detail-value {
  color: #2c3e50;
  flex: 1;
}

.detail-row.description {
  flex-direction: column;
}

.detail-row.description .detail-label {
  margin-bottom: 8px;
}

/* 颜色选择器样式 */
.color-selection-section {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 2px solid #e9ecef;
}

.color-selection-section h5 {
  margin: 0 0 15px 0;
  color: #2c3e50;
  font-size: 1rem;
}

/* 预设颜色选择 */
.preset-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.color-option {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
  position: relative;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.selected {
  border-color: #2c3e50;
  box-shadow: 0 0 0 2px white, 0 0 0 4px #2c3e50;
}

/* 自定义RGB颜色选择 */
.custom-color-section {
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
}

.color-preview {
  width: 50px;
  height: 50px;
  border-radius: 6px;
  border: 1px solid #dee2e6;
  box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.1);
}

.rgb-inputs {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.rgb-input-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.rgb-input-group label {
  font-weight: 500;
  color: #495057;
  min-width: 15px;
}

.rgb-input-group input {
  width: 60px;
  padding: 6px 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  text-align: center;
  font-size: 0.9rem;
}

.rgb-input-group input:focus {
  outline: none;
  border-color: #4a90e2;
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.25);
}

.apply-color-btn {
  background-color: #17a2b8;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s ease;
}

.apply-color-btn:hover {
  background-color: #138496;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .model-detail-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .model-controls-buttons {
    width: 100%;
    justify-content: space-between;
  }
  
  .custom-color-section {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .rgb-inputs {
    width: 100%;
  }
}

.model-info-btn {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  padding: 15px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.95rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80px;
}

.model-info-btn:hover {
  border-color: #4a90e2;
  color: #4a90e2;
  background-color: #f1f7ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

/* 模型容器包装器 */
.model-container-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  overflow: hidden;
  min-height: 0;
  height: 100%;
  width: 100%; /* 确保宽度占满 */
}

/* 模型控制按钮 */
.model-controls {
  position: absolute;
  top: 15px;
  right: 15px;
  display: flex;
  gap: 10px;
  z-index: 10;
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
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
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

.model-container {
  flex: 1;
  background-color: #f0f0f0;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 0;
  width: 100%;
  height: 100%;
  min-height: 0; /* 添加最小高度为0 */
}
#modelContainer {
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1; /* 占据所有可用空间 */
}
.placeholder-text {
  color: #aaa;
  font-size: 1.2rem;
  font-weight: 500;
}

/* 加载中动画 */
.loading::after {
  content: ''; position: absolute; top: 50%; left: 50%;
  width: 16px; height: 16px; margin-top: -8px; margin-left: -8px;
  border: 2px solid rgba(74, 144, 226, 0.3); border-top-color: #4a90e2;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>