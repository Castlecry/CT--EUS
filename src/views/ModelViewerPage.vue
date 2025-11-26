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
                
                <!-- 轨迹历史记录 -->
                  <div class="trajectory-history-section">
                    <div class="section-header">
                      <h5>轨迹历史记录</h5>
                      <button 
                        class="toggle-history-btn" 
                        @click="toggleTrajectoryHistory"
                        :class="{ active: showTrajectoryHistory }"
                      >
                        {{ showTrajectoryHistory ? '隐藏' : '显示' }}
                      </button>
                    </div>
                    
                    <div v-if="showTrajectoryHistory" class="trajectory-list">
                      <div v-if="trajectoryHistory.length === 0" class="no-trajectories">
                        暂无轨迹历史记录
                      </div>
                      <div 
                        v-for="trajectory in trajectoryHistory" 
                        :key="trajectory.id"
                        class="trajectory-item"
                        :class="{ active: currentDisplayedTrajectoryId === trajectory.id, uploaded: trajectory.uploaded }"
                      >
                        <div class="trajectory-info">
                          <div class="trajectory-color" :style="{ backgroundColor: '#' + trajectory.color.toString(16).padStart(6, '0') }"></div>
                          <span class="trajectory-name">{{ trajectory.name }} <span v-if="trajectory.uploaded" class="uploaded-badge">已上传</span></span>
                        </div>
                        <div class="trajectory-actions">
                          <!-- 未上传的轨迹显示全部按钮 -->
                          <template v-if="!trajectory.uploaded">
                            <button 
                              class="action-btn show-btn" 
                              @click="showHistoryTrajectory(trajectory.id)"
                              :disabled="currentDisplayedTrajectoryId === trajectory.id"
                            >
                              显示
                            </button>
                            <button 
                              class="action-btn hide-btn" 
                              @click="hideHistoryTrajectory()"
                              :disabled="currentDisplayedTrajectoryId !== trajectory.id"
                            >
                              取消选中
                            </button>
                            <button 
                              class="action-btn upload-btn" 
                              @click="uploadTrajectory(trajectory.id)"
                              :disabled="isDrawingMode"
                            >
                              上传
                            </button>
                          </template>
                          <!-- 已上传的轨迹只显示删除按钮 -->
                          <button 
                            class="action-btn delete-btn" 
                            @click="deleteHistoryTrajectory(trajectory.id)"
                            :disabled="isDrawingMode"
                          >
                            删除
                          </button>
                        </div>
                        <!-- 轨迹点坐标信息 -->
                        <div class="trajectory-points-info">
                          <div class="points-header">
                            <span>点坐标 (共{{ trajectory.points?.length || 0 }}个点)</span>
                            <button 
                              class="toggle-points-btn" 
                              @click="togglePointsView(trajectory.id)"
                            >
                              {{ isPointsViewOpen(trajectory.id) ? '收起' : '展开' }}
                            </button>
                          </div>
                          <div 
                            v-if="isPointsViewOpen(trajectory.id)" 
                            class="points-list"
                          >
                            <div 
                              v-for="(point, index) in trajectory.points" 
                              :key="index"
                              class="point-item"
                            >
                              <span class="point-index">点{{ index + 1 }}:</span>
                              <span class="point-coords">
                                ({{ point.x.toFixed(2) }}, {{ point.y.toFixed(2) }}, {{ point.z.toFixed(2) }})
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 校准轨迹记录区域 -->
                  <div class="calibration-trajectory-section">
                    <div class="section-header">
                      <h5>校准轨迹记录</h5>
                      <button 
                        class="toggle-history-btn" 
                        @click="toggleCalibrationTrajectory"
                        :class="{ active: showCalibrationTrajectory }"
                      >
                        {{ showCalibrationTrajectory ? '隐藏' : '显示' }}
                      </button>
                    </div>
                    
                    <div v-if="showCalibrationTrajectory" class="trajectory-list">
                      <div v-if="calibrationTrajectory.length === 0" class="no-trajectories">
                        暂无校准轨迹记录
                      </div>
                      <div 
                        v-for="trajectory in calibrationTrajectory" 
                        :key="trajectory.id"
                        class="trajectory-item"
                        :class="{ active: currentDisplayedCalibrationId === trajectory.id }"
                      >
                        <div class="trajectory-info">
                          <div class="trajectory-color" :style="{ backgroundColor: '#' + trajectory.color.toString(16).padStart(6, '0') }"></div>
                          <span class="trajectory-name">{{ trajectory.name }}</span>
                        </div>
                        <div class="trajectory-actions">
                          <button 
                            class="action-btn show-btn" 
                            @click="displayCalibrationTrajectory(trajectory.id)"
                            :disabled="currentDisplayedCalibrationId === trajectory.id"
                          >
                            显示
                          </button>
                          <button 
                            class="action-btn hide-btn" 
                            @click="hideCalibrationTrajectory()"
                            :disabled="currentDisplayedCalibrationId !== trajectory.id"
                          >
                            取消选中
                          </button>
                          <button 
                            class="action-btn delete-btn" 
                            @click="deleteCalibrationTrajectory(trajectory.id)"
                            :disabled="isDrawingMode"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 点2CT选点功能 -->
                  <div class="point2ct-section">
                    <div class="section-header">
                      <h5>点2CT选点功能</h5>
                      <button 
                        class="toggle-point2ct-btn" 
                        @click="togglePoint2CTMode"
                        :class="{ active: isPoint2CTMode }"
                      >
                        {{ isPoint2CTMode ? '退出选点' : '进入选点' }}
                      </button>
                    </div>
                    
                    <!-- 选点状态提示 -->
                    <div class="point2ct-status" v-if="isPoint2CTMode">
                      <!-- 操作步骤指示器 -->
                      <div class="operation-steps">
                        <div class="step" :class="{ active: !selectedPoint, completed: selectedPoint }"><span>1</span> 选择点</div>
                        <div class="step-separator"></div>
                        <div class="step" :class="{ active: selectedPoint && !selectedAxis, completed: selectedAxis }"><span>2</span> 选择轴向</div>
                        <div class="step-separator"></div>
                        <div class="step" :class="{ active: selectedAxis && !firstAngleSet, completed: firstAngleSet }"><span>3</span> 角度1</div>
                        <div class="step-separator"></div>
                        <div class="step" :class="{ active: firstAngleSet && !secondAngleSet, completed: secondAngleSet }"><span>4</span> 角度2</div>
                        <div class="step-separator"></div>
                        <div class="step" :class="{ active: secondAngleSet && !thirdAngleSet, completed: thirdAngleSet }"><span>5</span> 角度3</div>
                        <div class="step-separator"></div>
                        <div class="step" :class="{ active: thirdAngleSet, completed: false }"><span>6</span> 上传</div>
                      </div>
                       
                      <!-- 详细状态提示 -->
                      <div v-if="!selectedPoint" class="status-message">
                        <span class="status-indicator searching"></span>
                        请点击模型上的点进行选择（吸附距离：5单位）
                      </div>
                      <div v-else-if="selectedPoint && !selectedAxis" class="status-message info">
                        <span class="status-indicator info"></span>
                        已选中点，请选择一个轴向单位向量（x、y或z）
                      </div>
                      <div v-else-if="selectedAxis && !firstAngleSet" class="status-message info">
                        <span class="status-indicator info"></span>
                        请调整第一个角度（围绕法向量旋转），然后点击确认
                      </div>
                      <div v-else-if="firstAngleSet && !secondAngleSet" class="status-message info">
                        <span class="status-indicator info"></span>
                        请调整第二个角度（围绕{{ selectedAxis }}轴旋转），然后点击确认
                      </div>
                      <div v-else-if="secondAngleSet && !thirdAngleSet" class="status-message info">
                        <span class="status-indicator info"></span>
                        请调整第三个角度（围绕面法向量旋转），然后点击确认
                      </div>
                      <div v-else-if="thirdAngleSet" class="status-message success">
                        <span class="status-indicator success"></span>
                        所有参数已设置完成，可以点击上传按钮生成模型
                      </div>
                    
                    <!-- 选中点信息和操作 -->
                    <div v-if="selectedPoint" class="selected-point-info">
                      <div class="point-details">
                        <h6>选中点信息</h6>
                        <div class="detail-item">
                          <span class="label">坐标：</span>
                          <span class="value">({{ selectedPoint.x.toFixed(2) }}, {{ selectedPoint.y.toFixed(2) }}, {{ selectedPoint.z.toFixed(2) }})</span>
                        </div>
                        <div class="detail-item">
                          <span class="label">法向量：</span>
                          <span class="value" v-if="selectedPointNormal">
                            ({{ selectedPointNormal.x.toFixed(4) }}, {{ selectedPointNormal.y.toFixed(4) }}, {{ selectedPointNormal.z.toFixed(4) }})
                          </span>
                          <span class="value" v-else>未知</span>
                        </div>
                      </div>
                      
                      <!-- 单位向量选择 -->
                      <div class="unit-vector-selection">
                        <h6>选择轴向单位向量</h6>
                        <div class="vector-options">
                          <button 
                            v-for="axis in ['x', 'y', 'z']" 
                            :key="axis"
                            class="vector-btn"
                            :class="{ active: selectedAxis === axis }"
                            @click="selectUnitVector(axis)"
                          >
                            {{ axis }}轴 ({{ getVectorString(axis) }})
                          </button>
                        </div>
                      </div>
                      
                      <!-- 第一个角度输入 -->
                      <div v-if="selectedAxis && !firstAngleSet" class="angle-input-section">
                        <h6>选择第一个角度（围绕法向量旋转 0-180°）</h6>
                        <div class="angle-controls">
                          <input 
                            type="range" 
                            v-model.number="firstAngle" 
                            min="0" 
                            max="180" 
                            step="1"
                            @input="updateFirstAngle"
                          >
                          <span class="angle-value">{{ firstAngle }}°</span>
                          <button class="confirm-btn" @click="confirmFirstAngle" :disabled="!selectedPoint || !selectedAxis">
                            确认角度1
                          </button>
                        </div>
                        <div class="angle-hint">
                          <i class="hint-icon">💡</i>
                          提示：该角度控制正方形围绕点的法向量顺时针旋转，决定正方形在法向量方向上的初始朝向
                        </div>
                      </div>
                      
                      <!-- 第二个角度输入 -->
                      <div v-if="firstAngleSet && !secondAngleSet" class="angle-input-section">
                        <h6>选择第二个角度（围绕{{ selectedAxis }}轴旋转 0-180°）</h6>
                        <div class="angle-controls">
                          <input 
                            type="range" 
                            v-model.number="secondAngle" 
                            min="0" 
                            max="180" 
                            step="1"
                            @input="updateSecondAngle"
                          >
                          <span class="angle-value">{{ secondAngle }}°</span>
                          <button class="confirm-btn" @click="confirmSecondAngle" :disabled="!firstAngleSet">
                            确认角度2
                          </button>
                        </div>
                        <div class="angle-hint">
                          <i class="hint-icon">💡</i>
                          提示：该角度控制正方形围绕选中的{{ selectedAxis }}轴顺时针旋转，调整正方形的倾斜角度
                        </div>
                      </div>
                      
                      <!-- 第三个角度输入 -->
                      <div v-if="secondAngleSet && !thirdAngleSet" class="angle-input-section">
                        <h6>选择第三个角度（围绕面法向量旋转 0-180°）</h6>
                        <div class="angle-controls">
                          <input 
                            type="range" 
                            v-model.number="thirdAngle" 
                            min="0" 
                            max="180" 
                            step="1"
                            @input="updateThirdAngle"
                          >
                          <span class="angle-value">{{ thirdAngle }}°</span>
                          <button class="confirm-btn" @click="confirmThirdAngle" :disabled="!secondAngleSet">
                            确认角度3
                          </button>
                        </div>
                        <div class="angle-hint">
                          <i class="hint-icon">💡</i>
                          提示：该角度控制正方形围绕当前面的法向量顺时针旋转，进一步调整正方形的最终朝向
                        </div>
                      </div>
                      
                      <!-- 上传按钮 -->
                      <div v-if="thirdAngleSet" class="upload-section">
                        <div class="upload-preview">
                          <div class="uploaded-params">
                            <h6>即将上传的参数</h6>
                            <div class="param-item">
                              <span class="param-label">选中点坐标：</span>
                              <span class="param-value">({{ selectedPoint.x.toFixed(2) }}, {{ selectedPoint.y.toFixed(2) }}, {{ selectedPoint.z.toFixed(2) }})</span>
                            </div>
                            <div class="param-item">
                              <span class="param-label">单位向量：</span>
                              <span class="param-value">{{ getVectorString(selectedAxis) }}</span>
                            </div>
                            <div class="param-item">
                              <span class="param-label">旋转角度1：</span>
                              <span class="param-value">{{ firstAngle }}°</span>
                            </div>
                            <div class="param-item">
                              <span class="param-label">旋转角度2：</span>
                              <span class="param-value">{{ secondAngle }}°</span>
                            </div>
                            <div class="param-item">
                              <span class="param-label">旋转角度3：</span>
                              <span class="param-value">{{ thirdAngle }}°</span>
                            </div>
                          </div>
                        </div>
                        
                        <!-- 上传状态显示 -->
                        <div v-if="isUploading || uploadMessage" class="upload-status-container">
                          <div v-if="isUploading" class="upload-loading">
                            <span class="loading-spinner">⏳</span>
                            <span>{{ uploadMessage || '处理中...' }}</span>
                          </div>
                          <div v-else-if="uploadSuccess !== null" 
                               :class="['upload-result', uploadSuccess ? 'success' : 'error']">
                            <span class="result-icon">{{ uploadSuccess ? '✅' : '❌' }}</span>
                            <span>{{ uploadMessage }}</span>
                          </div>
                        </div>
                        
                        <button 
                          class="upload-point2ct-btn primary" 
                          @click="handleUploadPoint2CTParams"
                          :disabled="!canUploadPoint2CT || isUploading"
                        >
                          <i class="upload-icon">📤</i> 上传参数生成模型
                        </button>
                        <div class="upload-info">
                          <p>点击后，系统将发送参数到后端并生成新的PLY模型</p>
                          <p class="upload-note">注意：上传后将显示生成的新模型面</p>
                        </div>
                      </div>
                      
                      <!-- 重置按钮 -->
                      <button 
                        class="reset-point2ct-btn" 
                        @click="resetPoint2CT"
                        :disabled="!selectedPoint"
                      >
                        重新选点
                      </button>
                    </div>
                  </div>
                  
                  <!-- 颜色选择器 -->
                  <div class="color-selection-section">
                    <div class="section-header">
                      <h5>模型颜色</h5>
                      <button 
                        class="reset-color-btn" 
                        @click="resetToOriginalColor"
                        title="重置为原始颜色"
                      >
                        ↻
                      </button>
                    </div>
                    
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
import { getOrganModel, getOrganPlyModel, uploadTrajectoryPly, getCalibrationTrajectoryPly, uploadPoint2CTParams } from '../api/dicom.js';
import ModelRenderer from '../utils/modelRenderer.js';
import PlyRenderer from '../utils/plyRenderer.js';
import Point2CTManager from '../utils/point2ct.js';
import {
  presetColors,
  rgbToHex,
  hexToRgb,
  isValidRgb,
  applyModelColor,
  toggleModelVisibility,
  getModelColor,
  getModelVisibility,
  resetModelColor
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
// 校准轨迹相关状态
const calibrationTrajectory = ref([]); // 校准轨迹记录
const loadingCalibration = ref(false); // 校准轨迹加载状态
const showCalibrationTrajectory = ref(true); // 是否显示校准轨迹区域

// 点2CT选点功能相关状态
const isPoint2CTMode = ref(false); // 是否处于选点模式
const isUploading = ref(false); // 上传状态
const uploadSuccess = ref(null); // 上传成功状态 (null: 未开始, true: 成功, false: 失败)
const uploadMessage = ref(''); // 上传消息提示
const generatedPlyUrl = ref(''); // 生成的PLY模型URL
const selectedPoint = ref(null); // 选中的点坐标
const selectedPointNormal = ref(null); // 选中点的法向量
const selectedAxis = ref(null); // 选择的轴向单位向量
const firstAngle = ref(0); // 第一个旋转角度
const secondAngle = ref(0); // 第二个旋转角度
const thirdAngle = ref(0); // 第三个旋转角度
const firstAngleSet = ref(false); // 第一个角度是否已确认
const secondAngleSet = ref(false); // 第二个角度是否已确认
const thirdAngleSet = ref(false); // 第三个角度是否已确认
const canUploadPoint2CT = ref(false); // 是否可以上传
const currentDisplayedCalibrationId = ref(null); // 当前显示的校准轨迹ID

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

// 轨迹历史记录状态
const showTrajectoryHistory = ref(false);
const trajectoryHistory = ref([]);
const currentDisplayedTrajectoryId = ref(null);
// 跟踪展开的点坐标视图
const expandedPointsViews = ref(new Set());

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
    
    // 关闭轨迹历史面板
    showTrajectoryHistory.value = false;
    // 重置当前显示的轨迹ID
    currentDisplayedTrajectoryId.value = null;
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
      trajectoryHistory.value = [];
      currentDisplayedTrajectoryId.value = null;
      showTrajectoryHistory.value = false;
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
    
    // 调用新的PlyRenderer方法，传递batchId参数
    const success = await plyRenderer.value.loadAndRenderPlyPoints(organName, (orgName) => getOrganPlyModel(orgName, batchId));
    
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
        // 重置当前显示的轨迹ID
        currentDisplayedTrajectoryId.value = null;
      } else {
        console.log('退出绘制模式：模型可自由旋转缩放');
        plyRenderer.value.disableSnapToClosestPoint();
        // 绘制结束后重新加载轨迹历史
        loadTrajectoryHistory();
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

// 切换点2CT选点模式
const togglePoint2CTMode = () => {
  if (!selectedModelKey.value || !rendererReady.value || !plyRenderer.value) {
    alert('请先加载模型后再进入选点模式');
    return;
  }
  
  isPoint2CTMode.value = !isPoint2CTMode.value;
  
  if (isPoint2CTMode.value) {
    console.log('进入点2CT选点模式');
    // 启用吸附功能
    plyRenderer.value.enableSnapToClosestPoint(handlePointSelection, 5);
    // 重置选点状态
    resetPoint2CT();
  } else {
    console.log('退出点2CT选点模式');
    // 禁用吸附功能
    plyRenderer.value.disableSnapToClosestPoint();
    // 清除选中点的高亮
    if (selectedPoint.value) {
      plyRenderer.value.highlightPoint(null);
    }
  }
};

// 处理点选择事件
const handlePointSelection = (pointData) => {
  if (!isPoint2CTMode.value) return;
  
  console.log('选中点:', pointData);
  selectedPoint.value = pointData.coordinate;
  selectedPointNormal.value = pointData.normal;
  
  // 在渲染器中高亮显示选中的点（红色）
  plyRenderer.value.highlightPoint(pointData.coordinate, { color: [1, 0, 0] });
  
  // 初始化point2CTManager
  point2CTManager.setSelectedPoint(pointData.coordinate, pointData.normal);
};

// 获取单位向量字符串
const getVectorString = (axis) => {
  const vector = getUnitVector(axis);
  return `(${vector.x}, ${vector.y}, ${vector.z})`;
};

// 选择单位向量
const selectUnitVector = (axis) => {
  selectedAxis.value = axis;
  const unitVector = getUnitVector(axis);
  
  // 设置单位向量并生成初始正方形
  point2CTManager.setUnitVector(unitVector);
  point2CTManager.generateSquare();
  
  // 在渲染器中显示正方形
  const squarePoints = point2CTManager.getSquarePoints();
  if (plyRenderer.value && typeof plyRenderer.value.showSquare === 'function') {
    plyRenderer.value.showSquare(squarePoints);
  }
};

// 更新第一个角度
const updateFirstAngle = () => {
  if (!selectedPoint.value || !selectedAxis.value) return;
  
  // 围绕法向量旋转
  point2CTManager.rotateAroundNormal(firstAngle.value);
  
  // 更新渲染器中的正方形显示
  const squarePoints = point2CTManager.getSquarePoints();
  if (plyRenderer.value && typeof plyRenderer.value.showSquare === 'function') {
    plyRenderer.value.showSquare(squarePoints);
  }
};

// 确认第一个角度
const confirmFirstAngle = () => {
  firstAngleSet.value = true;
  console.log('确认第一个角度:', firstAngle.value);
};

// 更新第二个角度
const updateSecondAngle = () => {
  if (!firstAngleSet.value) return;
  
  // 围绕选择的轴向旋转
  point2CTManager.rotateAroundUnitVector(secondAngle.value);
  
  // 更新渲染器中的正方形显示
  const squarePoints = point2CTManager.getSquarePoints();
  if (plyRenderer.value && typeof plyRenderer.value.showSquare === 'function') {
    plyRenderer.value.showSquare(squarePoints);
  }
};

// 确认第二个角度
const confirmSecondAngle = () => {
  secondAngleSet.value = true;
  console.log('确认第二个角度:', secondAngle.value);
  
  // 计算正方形面的法向量用于第三个旋转
  point2CTManager.calculateFaceNormal();
};

// 更新第三个角度
const updateThirdAngle = () => {
  if (!secondAngleSet.value) return;
  
  // 围绕面法向量旋转
  point2CTManager.rotateAroundFaceNormal(thirdAngle.value);
  
  // 更新渲染器中的正方形显示
  const squarePoints = point2CTManager.getSquarePoints();
  if (plyRenderer.value && typeof plyRenderer.value.showSquare === 'function') {
    plyRenderer.value.showSquare(squarePoints);
  }
};

// 确认第三个角度
const confirmThirdAngle = () => {
  thirdAngleSet.value = true;
  canUploadPoint2CT.value = true;
  console.log('确认第三个角度:', thirdAngle.value);
};

// 重置点2CT选点状态
const resetPoint2CT = () => {
  selectedPoint.value = null;
  selectedPointNormal.value = null;
  selectedAxis.value = null;
  firstAngle.value = 0;
  secondAngle.value = 0;
  thirdAngle.value = 0;
  firstAngleSet.value = false;
  secondAngleSet.value = false;
  thirdAngleSet.value = false;
  canUploadPoint2CT.value = false;
  
  // 清除渲染器中的正方形显示
  if (plyRenderer.value && typeof plyRenderer.value.showSquare === 'function') {
    plyRenderer.value.showSquare(null);
  }
  
  // 重置point2CTManager
  point2CTManager.reset();
};

// 上传点2CT参数（自定义函数）
const handleUploadPoint2CTParams = async () => {
  if (!canUploadPoint2CT.value || !batchId) return;
  
  // 显示加载状态
  isUploading.value = true;
  uploadSuccess.value = null;
  uploadMessage.value = '正在上传参数并生成模型...';
  
  try {
    // 准备上传参数
    const params = point2CTManager.getUploadData();
    
    console.log('上传点2CT参数:', params);
    
    // 调用上传接口
    const response = await uploadPoint2CTParams(batchId, params);
    
    if (response && (response.plyUrl || response.plyData)) {
      console.log('上传成功，获取到模型数据:', response);
      
      // 设置成功状态
      uploadSuccess.value = true;
      uploadMessage.value = '模型生成成功！正在加载...';
      
      // 处理并显示生成的PLY模型
      if (renderer.value && plyRenderer) {
        let plyUrl;
        
        if (response.plyUrl) {
          // 如果返回的是URL，直接使用
          plyUrl = response.plyUrl;
        } else if (response.plyData) {
          // 如果返回的是数据，转换为Blob URL
          const plyBlob = new Blob([response.plyData], { type: 'text/plain' });
          plyUrl = URL.createObjectURL(plyBlob);
        }
        
        if (plyUrl) {
          // 使用plyRenderer渲染模型，使用绿色显示面
          await plyRenderer.renderPLY(plyUrl, '#00FF00');
          
          // 保存生成的PLY URL，以便后续使用或清理
          generatedPlyUrl.value = plyUrl;
          
          uploadMessage.value = '模型已成功加载和显示！';
          console.log('PLY模型渲染成功');
        }
      } else {
        throw new Error('渲染器未初始化，无法显示模型');
      }
    } else {
      throw new Error('上传失败，服务器未返回有效的PLY数据');
    }
  } catch (error) {
    console.error('上传点2CT参数失败:', error);
    uploadSuccess.value = false;
    uploadMessage.value = `上传失败: ${error.message || '未知错误'}`;
  } finally {
    // 关闭加载状态
    isUploading.value = false;
    
    // 5秒后自动清除上传消息
    setTimeout(() => {
      if (uploadMessage.value) {
        uploadMessage.value = '';
        uploadSuccess.value = null;
      }
    }, 5000);
  }
};

// 清理生成的PLY资源
const cleanupGeneratedPly = () => {
  if (generatedPlyUrl.value) {
    URL.revokeObjectURL(generatedPlyUrl.value);
    generatedPlyUrl.value = null;
    console.log('已清理生成的PLY资源');
  }
};

// 导出所有函数和状态

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

// 重置模型颜色到原始状态
const resetToOriginalColor = () => {
  if (!selectedModelKey.value || !renderer.value || !rendererReady.value) return;
  
  const modelName = organList[selectedModelKey.value];
  const success = resetModelColor(renderer.value, modelName);
  
  if (success) {
    // 获取重置后的颜色并更新UI
    const color = getModelColor(renderer.value, modelName);
    if (color && isValidRgb(color)) {
      customRgb.value = color;
      // 查找是否匹配预设颜色
      const hex = rgbToHex(color);
      const matchingIndex = presetColors.findIndex(c => c.hex === hex);
      selectedColorIndex.value = matchingIndex !== -1 ? matchingIndex : 0;
      showCustomColor.value = matchingIndex === -1;
    }
  } else {
    alert('无法重置模型颜色，请重试');
  }
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
    // 加载该模型的轨迹历史
    loadTrajectoryHistory();
  } else {
    // 聚焦到特定模型（3D模型在下方固定显示）
    console.log(`聚焦到模型: ${organList[organKey]}`);
    // 可以在这里添加聚焦到特定模型的逻辑
  }
};

// 加载轨迹历史
const loadTrajectoryHistory = () => {
  if (!plyRenderer.value || !selectedModelKey.value) return;
  
  try {
    if (typeof plyRenderer.value.getTrajectoryHistory === 'function') {
      trajectoryHistory.value = plyRenderer.value.getTrajectoryHistory();
      console.log('加载轨迹历史成功:', trajectoryHistory.value);
    }
  } catch (error) {
    console.error('加载轨迹历史失败:', error);
    trajectoryHistory.value = [];
  }
};

// 切换轨迹历史面板显示
const toggleTrajectoryHistory = () => {
  showTrajectoryHistory.value = !showTrajectoryHistory.value;
  // 如果打开面板，重新加载轨迹历史
  if (showTrajectoryHistory.value) {
    loadTrajectoryHistory();
  }
};

// 显示历史轨迹
const showHistoryTrajectory = (trajectoryId) => {
  if (!plyRenderer.value || isDrawingMode.value) return;
  
  try {
    // 检查轨迹是否已上传，如果已上传则不显示
    const trajectory = trajectoryHistory.value.find(t => t.id === trajectoryId);
    if (trajectory && trajectory.uploaded) {
      console.warn('已上传的轨迹不能查看');
      return;
    }
    
    if (typeof plyRenderer.value.showHistoryTrajectory === 'function') {
      const success = plyRenderer.value.showHistoryTrajectory(trajectoryId);
      if (success) {
        currentDisplayedTrajectoryId.value = trajectoryId;
        console.log('成功显示历史轨迹:', trajectoryId);
      }
    }
  } catch (error) {
    console.error('显示历史轨迹失败:', error);
  }
};

// 隐藏当前显示的历史轨迹
const hideHistoryTrajectory = () => {
  if (!plyRenderer.value || !currentDisplayedTrajectoryId.value || isDrawingMode.value) return;
  
  try {
    if (typeof plyRenderer.value.showHistoryTrajectory === 'function') {
      // 传入null来隐藏当前显示的轨迹
      const success = plyRenderer.value.showHistoryTrajectory(null);
      // 无论成功与否，都重置当前显示的轨迹ID，确保UI状态正确更新
      const trajectoryIdToHide = currentDisplayedTrajectoryId.value;
      currentDisplayedTrajectoryId.value = null;
      
      if (success) {
        console.log('成功隐藏历史轨迹:', trajectoryIdToHide);
      } else {
        console.warn('隐藏轨迹失败，但仍重置状态以确保UI正常工作:', trajectoryIdToHide);
      }
    }
  } catch (error) {
    console.error('隐藏历史轨迹失败:', error);
    // 即使发生错误，也要重置状态以确保UI正常工作
    currentDisplayedTrajectoryId.value = null;
  }
};

// 切换点坐标视图显示状态
const togglePointsView = (trajectoryId) => {
  if (expandedPointsViews.value.has(trajectoryId)) {
    expandedPointsViews.value.delete(trajectoryId);
  } else {
    expandedPointsViews.value.add(trajectoryId);
  }
};

// 检查点坐标视图是否展开
const isPointsViewOpen = (trajectoryId) => {
  return expandedPointsViews.value.has(trajectoryId);
};

// 生成PLY文件内容
const generatePlyContent = (points) => {
  // 假设点已经包含法向量信息，如果没有则使用默认法向量
  const vertexCount = points.length;
  let plyContent = `ply
format ascii 1.0
element vertex ${vertexCount}
comment vertices
property float x
property float y
property float z
property float nx
property float ny
property float nz
end_header\n`;
  
  // 为每个点添加坐标和法向量（如果没有法向量则使用默认值）
  points.forEach(point => {
    // 如果点有法向量信息，使用它；否则使用默认值
    const nx = point.normal?.x || 0.0;
    const ny = point.normal?.y || 0.0;
    const nz = point.normal?.z || 1.0;
    
    plyContent += `${point.x} ${point.y} ${point.z} ${nx} ${ny} ${nz}\n`;
  });
  
  return plyContent;
};

// 上传轨迹点云并处理后端返回的多个PLY文件
const uploadTrajectory = async (trajectoryId) => {
  if (!plyRenderer.value || isDrawingMode.value) return;
  
  try {
    // 获取轨迹数据
    const trajectory = trajectoryHistory.value.find(t => t.id === trajectoryId);
    if (!trajectory || !trajectory.points || trajectory.points.length === 0) {
      console.error('轨迹数据无效');
      return;
    }
    
    // 生成PLY文件内容
    const plyContent = generatePlyContent(trajectory.points);
    
    // 创建Blob对象
    const blob = new Blob([plyContent], { type: 'text/plain' });
    
    console.log('准备上传轨迹点云:', { pointCount: trajectory.points.length });
    
    // 处理每个接收到的PLY文件的回调函数
    const handlePlyReceived = (trajectoryData) => {
      console.log('接收到PLY数据:', trajectoryData);
      
      // 严格验证数据格式，确保有目标点和四个面点
      if (!trajectoryData || !trajectoryData.targetPoint || 
          !trajectoryData.facePoints || trajectoryData.facePoints.length !== 4) {
        console.error('无效的轨迹数据格式：需要一个目标点和四个面点');
        return;
      }
      
      // 验证每个点是否包含正确的坐标
      const isValidPoint = (point) => point && typeof point.x === 'number' && 
                                      typeof point.y === 'number' && typeof point.z === 'number';
      
      if (!isValidPoint(trajectoryData.targetPoint)) {
        console.error('目标点坐标格式错误');
        return;
      }
      
      if (!trajectoryData.facePoints.every(isValidPoint)) {
        console.error('面点坐标格式错误');
        return;
      }
      
      console.log('目标点坐标:', trajectoryData.targetPoint);
      console.log('四个面点坐标:', trajectoryData.facePoints);
      
      // 使用plyRenderer绘制轨迹点和面
      if (plyRenderer.value && typeof plyRenderer.value.addTrajectoryFace === 'function') {
        // 调用更新后的addTrajectoryFace方法 - 按照用户要求，只连接四个面点形成面
        const success = plyRenderer.value.addTrajectoryFace(
          trajectoryData.targetPoint,
          trajectoryData.facePoints,
          trajectory.color || 0xff00ff // 使用轨迹颜色或默认紫色
        );
        
        if (success) {
          // 确保渲染场景
          if (plyRenderer.value.modelRenderer && typeof plyRenderer.value.modelRenderer.render === 'function') {
            plyRenderer.value.modelRenderer.render();
            console.log('成功渲染轨迹面并更新场景');
          }
        } else {
          console.error('添加轨迹面失败');
        }
      } else {
        console.error('PlyRenderer不具备addTrajectoryFace方法');
      }
    };
    
    // 调用API上传PLY文件
    const result = await uploadTrajectoryPly(blob, batchId, trajectory.plyBatchNo);
    
    // 标记轨迹为已上传
    trajectory.uploaded = true;
    // 自增PLY批次号，以便下次上传时使用新的批次号
    trajectory.plyBatchNo = (trajectory.plyBatchNo || 1) + 1;
    console.log('轨迹上传成功:', trajectoryId, '新的PLY批次号:', trajectory.plyBatchNo - 1);
    
    // 尝试获取校准轨迹
    try {
      console.log('尝试获取校准轨迹');
      const calibrationResult = await getCalibrationTrajectoryPly(batchId, trajectory.plyBatchNo - 1);
      
      // 将校准轨迹添加到记录中
      const calibrationItem = {
        id: `calibration_${Date.now()}`,
        name: `校准轨迹_${trajectory.name}`,
        color: Math.floor(Math.random()*16777215), // 随机颜色
        batchId: batchId,
        dataUrl: calibrationResult.data,
        timestamp: new Date().toISOString()
      };
      
      calibrationTrajectory.value.push(calibrationItem);
      console.log('校准轨迹已添加到记录:', calibrationItem);
    } catch (calibrationError) {
      console.warn('获取校准轨迹失败，但不影响上传结果:', calibrationError);
    }
    
    // 显示成功消息
    alert('轨迹点云上传成功！所有PLY文件已处理完成。');
    console.log('轨迹点云上传成功:', result);
  } catch (error) {
    console.error('上传轨迹点云失败:', error);
    alert('上传失败：' + (error.message || '未知错误'));
  }
};

// 切换校准轨迹区域显示状态
const toggleCalibrationTrajectory = () => {
  showCalibrationTrajectory.value = !showCalibrationTrajectory.value;
};

// 显示校准轨迹
const displayCalibrationTrajectory = async (trajectoryId) => {
  if (!plyRenderer.value || isDrawingMode.value) return;
  
  try {
    // 先隐藏当前显示的轨迹
    if (currentDisplayedCalibrationId.value) {
      hideCalibrationTrajectory();
    }
    
    // 查找校准轨迹
    const trajectory = calibrationTrajectory.value.find(t => t.id === trajectoryId);
    if (!trajectory || !trajectory.dataUrl) {
      console.error('校准轨迹数据无效');
      return;
    }
    
    loadingCalibration.value = true;
    
    // 使用PlyRenderer显示校准轨迹，按照0.5秒间隔连接点
    if (typeof plyRenderer.value.showCalibrationTrajectory === 'function') {
      await plyRenderer.value.showCalibrationTrajectory(trajectory.dataUrl, {
        interval: 0.5, // 0.5秒间隔连接点
        color: trajectory.color
      });
      currentDisplayedCalibrationId.value = trajectoryId;
      console.log('校准轨迹已显示:', trajectoryId);
    } else {
      console.warn('PlyRenderer没有showCalibrationTrajectory方法');
    }
  } catch (error) {
    console.error('显示校准轨迹失败:', error);
    alert('显示校准轨迹失败：' + (error.message || '未知错误'));
  } finally {
    loadingCalibration.value = false;
  }
};

// 隐藏校准轨迹
const hideCalibrationTrajectory = () => {
  if (!plyRenderer.value) return;
  
  try {
    // 隐藏当前显示的校准轨迹
    if (typeof plyRenderer.value.hideCalibrationTrajectory === 'function') {
      plyRenderer.value.hideCalibrationTrajectory();
    }
    currentDisplayedCalibrationId.value = null;
    console.log('校准轨迹已隐藏');
  } catch (error) {
    console.error('隐藏校准轨迹失败:', error);
  }
};

// 删除校准轨迹
const deleteCalibrationTrajectory = (trajectoryId) => {
  if (!plyRenderer.value || isDrawingMode.value) return;
  
  try {
    // 如果删除的是当前显示的轨迹，先隐藏
    if (trajectoryId === currentDisplayedCalibrationId.value) {
      hideCalibrationTrajectory();
    }
    
    // 从列表中删除（确保界面立即更新）
    const index = calibrationTrajectory.value.findIndex(t => t.id === trajectoryId);
    if (index !== -1) {
      const trajectory = calibrationTrajectory.value[index];
      
      // 立即从界面列表中移除（解决删除无响应问题）
      calibrationTrajectory.value.splice(index, 1);
      
      // 释放URL对象
      if (trajectory.dataUrl) {
        try {
          URL.revokeObjectURL(trajectory.dataUrl);
        } catch (e) {
          console.warn('释放URL对象失败:', e);
        }
      }
      
      // 同时从渲染器中清除相关资源
      if (plyRenderer.value.calibrationTrajectories) {
        plyRenderer.value.calibrationTrajectories.delete(trajectoryId);
      }
      
      console.log('校准轨迹已删除:', trajectoryId);
    }
  } catch (error) {
    console.error('删除校准轨迹失败:', error);
    alert('删除校准轨迹失败：' + (error.message || '未知错误'));
  }
};

// 删除历史轨迹
const deleteHistoryTrajectory = (trajectoryId) => {
  if (!plyRenderer.value || isDrawingMode.value) return;
  
  try {
    // 先从界面状态中删除
    const index = trajectoryHistory.value.findIndex(t => t.id === trajectoryId);
    if (index !== -1) {
      trajectoryHistory.value.splice(index, 1);
    }
    
    // 然后从渲染器中删除
    if (typeof plyRenderer.value.deleteHistoryTrajectory === 'function') {
      const success = plyRenderer.value.deleteHistoryTrajectory(trajectoryId);
      if (success) {
        // 如果删除的是当前显示的轨迹，更新状态
        if (trajectoryId === currentDisplayedTrajectoryId.value) {
          currentDisplayedTrajectoryId.value = null;
        }
        // 移除展开的视图
        expandedPointsViews.value.delete(trajectoryId);
        console.log('成功删除历史轨迹:', trajectoryId);
      } else {
        // 如果渲染器删除失败，恢复界面状态
        loadTrajectoryHistory();
        console.error('渲染器中删除轨迹失败');
      }
    }
  } catch (error) {
    console.error('删除历史轨迹失败:', error);
    // 出错时重新加载轨迹历史
    loadTrajectoryHistory();
  }
};
</script>

