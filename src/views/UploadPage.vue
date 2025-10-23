<template>
  <div class="upload-container">
    <header>
      <div class="header-content">
        <div class="logo-icon">🩻</div>
        <div class="title-container">
          <h1 class="main-title">DICOM 文件上传与处理</h1>
          <p class="subtitle">高效转换医学影像为 3D 模型</p>
        </div>
      </div>
      <router-link to="/" class="back-link">← 返回欢迎页</router-link>
    </header>
    
    <main>
      <!-- 上传区域 -->
      <div v-if="step === 1" class="upload-area" @dragover.prevent @drop="handleDrop">
        <input type="file" id="fileInput" class="file-input" @change="handleFileSelect" multiple accept=".dcm,.zip" />
        <label for="fileInput" class="upload-label">
          <div class="upload-icon">📁</div>
          <p>点击上传 DICOM 文件或 ZIP 压缩包</p>
          <p class="subtext">支持 .dcm 文件和包含 DICOM 文件的 .zip 压缩包</p>
        </label>
      </div>

      <!-- 文件列表 -->
      <div v-if="step === 1 && selectedFiles.length > 0" class="file-list">
        <h3>已选择的文件</h3>
        <button @click="uploadFiles" class="process-button" :disabled="isUploading">
          <span v-if="isUploading" class="loading-icon">⏳</span>
          {{ isUploading ? '上传中...' : '上传文件' }}
        </button>
        <ul>
          <li v-for="(file, index) in selectedFiles" :key="index">
            {{ file.name }} <button @click="removeFile(index)" class="remove-btn">移除</button>
          </li>
        </ul>
      </div>

      <!-- 上传成功，等待处理 -->
      <div v-if="step === 2" class="success-section">
        <div class="success-icon">✅</div>
        <h3>文件上传成功！</h3>
        <p>您的文件已成功上传到服务器</p>
        <button @click="startProcessing" class="process-button" :disabled="isProcessing">
          <span v-if="isProcessing" class="loading-icon">⏳</span>
          {{ isProcessing ? '处理中...' : '开始处理文件' }}
        </button>
      </div>

      <!-- 处理进度 -->
      <div v-if="step === 3" class="progress-container">
        <h3>文件处理中...</h3>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: processProgress + '%' }"></div>
        </div>
        <span class="progress-text">{{ processProgress }}%</span>
        <p class="process-message">{{ processMessage }}</p>
      </div>

      <!-- 错误提示 -->
      <div v-if="errorMessage" class="error-section">
        <div class="error-icon">❌</div>
        <p>{{ errorMessage }}</p>
        <button @click="clearError" class="secondary-button">确定</button>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { uploadDicomFiles, processDicomFiles } from '../api/dicom.js';
import '../styles/upload-page.css';

const router = useRouter();

// 状态管理
const step = ref(1); // 1:上传, 2:等待处理, 3:处理中
const selectedFiles = ref([]);
const isUploading = ref(false);
const isProcessing = ref(false);
const uploadTimestamp = ref(null);
const processProgress = ref(0);
const processMessage = ref('');
const errorMessage = ref('');

// 处理文件选择
const handleFileSelect = (event) => {
  const files = event.target.files;
  if (files) {
    selectedFiles.value = [...selectedFiles.value, ...Array.from(files)];
  }
};

// 处理拖放文件
const handleDrop = (event) => {
  event.preventDefault();
  const files = event.dataTransfer.files;
  if (files) {
    selectedFiles.value = [...selectedFiles.value, ...Array.from(files)];
  }
};

// 移除文件
const removeFile = (index) => {
  selectedFiles.value.splice(index, 1);
};

// 上传文件
const uploadFiles = async () => {
  if (selectedFiles.value.length === 0) return;
  
  try {
    isUploading.value = true;
    errorMessage.value = '';
    
    // 只保存时间戳
    uploadTimestamp.value = await uploadDicomFiles(selectedFiles.value);
    step.value = 2;
  } catch (error) {
    errorMessage.value = '文件上传失败，请重试';
  } finally {
    isUploading.value = false;
  }
};

// 开始处理文件
const startProcessing = async () => {
  if (!uploadTimestamp.value) return;
  
  try {
    isProcessing.value = true;
    errorMessage.value = '';
    step.value = 3;
    
    // 增加进度更新，提供更好的用户体验
    processProgress.value = 0;
    processMessage.value = '开始处理文件，请稍候...';
    
    // 模拟进度更新（实际项目中可通过WebSocket或轮询获取真实进度）
    const progressInterval = setInterval(() => {
      if (processProgress.value < 90) { // 不超过90%，留10%给实际完成
        processProgress.value += 5;
        
        // 更新处理状态消息
        if (processProgress.value < 30) {
          processMessage.value = '正在解析DICOM文件...';
        } else if (processProgress.value < 60) {
          processMessage.value = '正在提取器官数据...';
        } else {
          processMessage.value = '正在生成3D模型...';
        }
      }
    }, 1000);
    
    // 调用处理接口并等待结果
    // 注意：这里不立即跳转，而是等待处理完成
    const result = await processDicomFiles(uploadTimestamp.value);
    
    // 清除进度更新定时器
    clearInterval(progressInterval);
    
    // 设置为100%完成状态
    processProgress.value = 100;
    processMessage.value = '处理完成！正在跳转到模型查看页面...';
    
    // 稍微延迟以显示完成状态
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 处理完成后再跳转到3D模型查看页面
    router.push({
      name: 'ModelViewer',
      query: {
        timestamp: uploadTimestamp.value
      }
    });
  } catch (error) {
    console.error('处理文件失败:', error);
    processMessage.value = '处理失败';
    errorMessage.value = '文件处理失败，请重试';
    isProcessing.value = false;
  } finally {
    // 不在这里重置isProcessing，因为失败时已经在catch中处理
    // 成功时会在跳转前保持状态
  }
};

// 清除错误信息
const clearError = () => {
  errorMessage.value = '';
};
</script>