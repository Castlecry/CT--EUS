<template>
  <div class="welcome-container">
    <div class="welcome-content">
      <h1>欢迎使用 DICOM 3D 模型生成工具</h1>
      <p>本工具可以帮助您上传 DICOM 文件并生成器官的 3D 模型（OBJ 格式）</p>
      <div class="features">
        <div class="feature-item">
          <i class="icon-upload"></i>
          <span>简单上传 DICOM 文件</span>
        </div>
        <div class="feature-item">
          <i class="icon-process"></i>
          <span>智能处理与转换</span>
        </div>
        <div class="feature-item">
          <i class="icon-export"></i>
          <span>导出高精度 OBJ 模型</span>
        </div>
      </div>
      <div class="welcome-buttons">
        <router-link to="/upload" class="start-button">开始使用</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
// 欢迎页面的逻辑
</script>

<style scoped>
.welcome-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f8f9fa;
  padding: 20px;
}

.welcome-content {
  background: white;
  border-radius: 12px;
  padding: 40px;
  max-width: 600px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  border-top: 4px solid #4a90e2;
}

h1 {
  color: #2c3e50;
  font-size: 2.2rem;
  margin-bottom: 20px;
  font-weight: 600;
}

p {
  color: #64748b;
  font-size: 1.1rem;
  margin-bottom: 30px;
  line-height: 1.5;
}

.features {
  display: flex;
  justify-content: space-around;
  margin-bottom: 40px;
  padding: 0 20px;
}

.feature-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 15px;
}

.icon-upload:before {
  content: '📤';
  font-size: 2rem;
}

.icon-process:before {
  content: '⚙️';
  font-size: 2rem;
}

.icon-export:before {
  content: '📥';
  font-size: 2rem;
}

.feature-item span {
  color: #475569;
  font-size: 0.95rem;
  font-weight: 500;
}

.welcome-buttons {
  display: flex;
  justify-content: center;
  gap: 15px;
  margin-top: 30px;
  flex-wrap: wrap;
}

.start-button {
  background: #4a90e2;
  color: white;
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: bold;
  text-decoration: none;
  transition: all 0.3s ease;
  display: inline-block;
  white-space: nowrap;
}

.start-button:hover {
  background: #357abd;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(74, 144, 226, 0.3);
}
</style>